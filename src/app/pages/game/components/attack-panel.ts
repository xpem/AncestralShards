import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { AttackRequest, AttackResult, CraftedStage, Deposit, GemStack, GemType, OreType } from '../../../models/shards.model';
import { GameStore } from '../../../services/game.store';
import { describeError, messageForCode } from '../../../services/shards-errors';
import { depositStatusLabel, formatPoints, tierLabel } from '../../../shared/deposit-info';
import { ElementLook, elementLook, formatMultiplier, oreColor, oreLabel, stageLabel } from '../../../shared/ore-info';

/** Espera depois da última mudança antes de pedir a prévia (cada prévia conta no limite de requisições). */
const PREVIEW_DEBOUNCE_MS = 600;
const PREVIEW_RETRY_429_MS = 2500;

interface Pick { ore: GemType; stage: CraftedStage; quantity: number; }
type Side = 'attack' | 'defend';

/** Uma linha da lista: uma pilha de gema lapidada que o jogador tem, com o que ela faz neste depósito. */
interface Row {
  ore: GemType;
  stage: CraftedStage;
  owned: number;
  /** Quanto dessa pilha ainda pode ser escolhido nesta lista (o que a outra lista já pegou não conta). */
  free: number;
  picked: number;
  /** Posição na ordem de uso (1, 2...), ou `null` se não escolhida. */
  order: number | null;
  look: ElementLook;
  perUnit: number;
  /** Multiplicador elemental (informativo). */
  multiplier: number;
}

/** Tela de ataque a um depósito: escolha de gemas, prévia ao vivo (a fonte da verdade) e confirmação. */
@Component({
  selector: 'app-attack-panel',
  template: `
    <section class="sh-card sh-plate" [attr.data-ui]="'attack-panel-' + deposit().id">
      <div class="sh-row">
        <h2 class="sh-title mb-0"><i class="bi bi-lightning-charge me-1"></i>Atacar depósito</h2>
        <button type="button" class="sh-icon-btn" aria-label="Voltar" title="Voltar" [attr.data-ui]="'attack-panel-' + deposit().id + '-close-btn'" (click)="closed.emit()">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>

      <p class="sh-muted mt-2 mb-1" [attr.data-ui]="'attack-panel-' + deposit().id + '-summary'">
        <span class="sh-gem" [style.background]="color(deposit().oreType)"></span>
        {{ label(deposit().oreType) }} · <i class="bi" [class]="depositLook().icon" [style.color]="depositLook().color"></i>
        {{ depositLook().label }} · {{ tier() }} · {{ status() }} · defesa {{ deposit().defenseCurrent }}/{{ deposit().defenseMax }}
      </p>
      <small class="sh-muted d-block">
        O depósito contra-ataca com {{ ratioPercent() }}% do dano causado. O que as gemas defensoras não absorvem custa
        {{ perPoint() }} de energia de exploração por ponto.
      </small>

      @for (side of sides; track side.id) {
        <h3 class="sh-attack-head" [attr.data-ui]="'attack-panel-' + deposit().id + '-' + side.id + '-title'">{{ side.title }}</h3>
        @if (rows(side.id).length === 0) {
          <p class="sh-muted mb-0" [attr.data-ui]="'attack-panel-' + deposit().id + '-' + side.id + '-empty'">
            Nenhuma gema lapidada {{ side.id === 'attack' ? 'que ataque' : 'que defenda' }}. Lapide na Oficina.
          </p>
        }
        @for (r of rows(side.id); track r.ore + r.stage) {
          <div class="sh-gemrow" [class.picked]="r.picked > 0" [attr.data-ui]="'attack-' + side.id + '-row-' + r.ore + '-' + r.stage">
            <div class="sh-row">
              <span class="d-flex align-items-center gap-2 flex-wrap">
                @if (r.order !== null) {
                  <span class="sh-tag ok" title="Ordem de uso">#{{ r.order }}</span>
                }
                <span class="sh-gem" [style.background]="color(r.ore)"></span>
                <strong>{{ label(r.ore) }}</strong>
                <span class="sh-muted">{{ stageName(r.stage) }} ({{ r.owned }})</span>
              </span>
              <span class="d-flex align-items-center gap-1">
                @if (r.order !== null) {
                  <button type="button" class="sh-btn-ghost sh-mini" aria-label="Usar antes" [attr.data-ui]="'attack-' + side.id + '-row-' + r.ore + '-' + r.stage + '-up-btn'" [disabled]="r.order === 1" (click)="move(side.id, r.ore, r.stage, -1)">▲</button>
                  <button type="button" class="sh-btn-ghost sh-mini" aria-label="Usar depois" [attr.data-ui]="'attack-' + side.id + '-row-' + r.ore + '-' + r.stage + '-down-btn'" [disabled]="r.order === pickedCount(side.id)" (click)="move(side.id, r.ore, r.stage, 1)">▼</button>
                }
                <button type="button" class="sh-btn sh-btn-sm sh-btn-square" aria-label="Menos" [attr.data-ui]="'attack-' + side.id + '-row-' + r.ore + '-' + r.stage + '-minus-btn'" [disabled]="r.picked < 1" (click)="change(side.id, r.ore, r.stage, -1)">−</button>
                <strong class="sh-dep-qty" [attr.data-ui]="'attack-' + side.id + '-row-' + r.ore + '-' + r.stage + '-qty'">{{ r.picked }}</strong>
                <button type="button" class="sh-btn sh-btn-sm sh-btn-square" aria-label="Mais" [attr.data-ui]="'attack-' + side.id + '-row-' + r.ore + '-' + r.stage + '-plus-btn'" [disabled]="r.picked >= r.free" (click)="change(side.id, r.ore, r.stage, 1)">+</button>
                <button type="button" class="sh-btn-ghost sh-mini" [attr.data-ui]="'attack-' + side.id + '-row-' + r.ore + '-' + r.stage + '-max-btn'" [disabled]="r.picked >= r.free" (click)="change(side.id, r.ore, r.stage, r.free - r.picked)">Máx</button>
              </span>
            </div>
            <small class="sh-muted d-block">
              <i class="bi" [class]="r.look.icon" [style.color]="r.look.color"></i> {{ r.look.label }} ·
              {{ side.id === 'attack' ? 'ataque' : 'defesa' }} {{ r.perUnit }} por unidade
              @if (r.multiplier > 1) {
                · <span [class]="side.id === 'attack' ? 'sh-adv' : 'sh-short'">{{ side.id === 'attack' ? 'vantagem' : 'fraca contra o depósito' }} {{ mult(r.multiplier) }}</span>
              } @else if (r.multiplier < 1) {
                · <span [class]="side.id === 'attack' ? 'sh-short' : 'sh-adv'">{{ side.id === 'attack' ? 'desvantagem' : 'resiste ao depósito' }} {{ mult(r.multiplier) }}</span>
              }
            </small>
          </div>
        }
      }

      <div class="sh-preview" [attr.data-ui]="'attack-panel-' + deposit().id + '-preview'" aria-live="polite">
        <h3 class="sh-attack-head">Prévia</h3>
        @if (!hasAttackers()) {
          <p class="sh-muted mb-0" data-ui="attack-preview-empty">Escolha ao menos uma gema atacante.</p>
        } @else if (previewError(); as err) {
          <p class="sh-short mb-0" data-ui="attack-preview-error">{{ err }}</p>
        } @else if (!fresh()) {
          <p class="sh-muted mb-0" data-ui="attack-preview-loading"><span class="spinner-border spinner-border-sm me-2"></span>Calculando...</p>
        } @else if (preview(); as p) {
          <div class="sh-row">
            <span class="sh-muted">Defesa</span>
            <strong data-ui="attack-preview-defense">{{ p.defenseBefore }} → {{ p.defenseAfter }}</strong>
          </div>
          <div class="sh-bar thin">
            <div class="sh-bar-fill defense" [style.width.%]="percent(p.defenseAfter, deposit().defenseMax)"></div>
          </div>
          <ul class="sh-preview-list">
            <li data-ui="attack-preview-damage">Dano: <strong>{{ p.damageDealt }}</strong>
              @if (p.broken) { <span class="sh-tag ok ms-1">derruba a defesa</span> }
            </li>
            <li data-ui="attack-preview-attackers">Atacantes gastos: {{ stacks(p.attackersUsed) }}</li>
            <li data-ui="attack-preview-defenders">Defensoras gastas: {{ stacks(p.defendersUsed) }}</li>
            <li data-ui="attack-preview-counter">Contra-ataque: {{ points(p.counterAttack) }} · absorvido {{ points(p.absorbed) }} · restante {{ points(p.unabsorbed) }}</li>
            <li data-ui="attack-preview-energy">Energia de exploração: <strong>−{{ p.energyCost }}</strong> (ficam {{ p.exploreEnergyAfter }}/{{ maxExplore() }})</li>
          </ul>
          <div class="sh-bar thin">
            <div class="sh-bar-fill explore" [style.width.%]="percent(p.exploreEnergyAfter, maxExplore())"></div>
          </div>
          @if (!p.canConfirm) {
            <p class="sh-short mt-2 mb-0" data-ui="attack-preview-blocker">
              {{ blockerText() }}
              @if (shortfall() > 0) { Faltam {{ shortfall() }} de energia de exploração. }
            </p>
          } @else if (unusedNote()) {
            <small class="sh-muted d-block mt-2">Só são gastas as gemas necessárias; o resto da seleção fica com você.</small>
          }
        }
      </div>

      <button type="button" class="sh-btn sh-btn-block" [attr.data-ui]="'attack-panel-' + deposit().id + '-confirm-btn'" [disabled]="!canConfirm()" (click)="confirm()">
        <i class="bi bi-lightning-charge"></i> Atacar
      </button>
    </section>
  `,
})
export class AttackPanel {
  protected store = inject(GameStore);
  private destroyRef = inject(DestroyRef);

  readonly deposit = input.required<Deposit>();
  readonly closed = output<void>();

  protected readonly sides: { id: Side; title: string }[] = [
    { id: 'attack', title: 'Atacantes' },
    { id: 'defend', title: 'Defensoras' },
  ];
  protected color = oreColor;
  protected label = oreLabel;
  protected stageName = stageLabel;
  protected mult = formatMultiplier;
  protected points = formatPoints;

  // ---- Apresentação do depósito ----
  protected depositLook = computed(() => elementLook(this.deposit().element));
  protected tier = computed(() => tierLabel(this.deposit()));
  protected status = computed(() => depositStatusLabel(this.deposit().status));
  protected ratioPercent = computed(() => formatPoints(this.deposit().counterRatio * 100));
  protected perPoint = computed(() => this.store.combat()?.energyPerCounterPoint ?? 0);
  protected maxExplore = computed(() => this.store.player()?.exploreMaxEnergy ?? 0);

  // ---- Seleção (a ordem do array é a ordem de uso enviada ao servidor) ----
  private readonly attackers = signal<Pick[]>([]);
  private readonly defenders = signal<Pick[]>([]);

  private picks(side: Side) {
    return side === 'attack' ? this.attackers : this.defenders;
  }

  protected pickedCount(side: Side): number {
    return this.picks(side)().length;
  }

  /** Linhas de uma lista: as escolhidas primeiro (na ordem de uso), depois as demais. */
  protected rows(side: Side): Row[] {
    const dep = this.deposit();
    const own = this.picks(side)();
    const other = this.picks(side === 'attack' ? 'defend' : 'attack')();
    const out: Row[] = [];

    for (const it of this.store.fullInventory()) {
      if (it.stage === 'Raw' || it.oreType === 'Quartz') continue;
      const info = this.store.oreMap().get(it.oreType);
      const stats = side === 'attack' ? info?.attack : info?.defense;
      const perUnit = stats?.find((s) => s.stage === it.stage);
      const value = perUnit ? ('attack' in perUnit ? perUnit.attack : perUnit.defense) : 0;
      if (!info || value <= 0) continue;

      const ore = it.oreType as GemType;
      const stage = it.stage as CraftedStage;
      const idx = own.findIndex((p) => p.ore === ore && p.stage === stage);
      const takenElsewhere = other.find((p) => p.ore === ore && p.stage === stage)?.quantity ?? 0;
      out.push({
        ore, stage, owned: it.quantity,
        free: Math.max(0, it.quantity - takenElsewhere),
        picked: idx >= 0 ? own[idx].quantity : 0,
        order: idx >= 0 ? idx + 1 : null,
        look: elementLook(info.element),
        perUnit: value,
        multiplier: side === 'attack' ? this.store.elementMultiplier(info.element, dep.element) : this.store.elementMultiplier(dep.element, info.element),
      });
    }
    return out.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }

  protected change(side: Side, ore: GemType, stage: CraftedStage, delta: number): void {
    const free = this.rows(side).find((r) => r.ore === ore && r.stage === stage)?.free ?? 0;
    this.picks(side).update((list) => {
      const next = list.map((p) => ({ ...p }));
      const i = next.findIndex((p) => p.ore === ore && p.stage === stage);
      const quantity = Math.max(0, Math.min(free, (i >= 0 ? next[i].quantity : 0) + delta));
      if (i >= 0) {
        if (quantity === 0) next.splice(i, 1);
        else next[i].quantity = quantity;
      } else if (quantity > 0) {
        next.push({ ore, stage, quantity });
      }
      return next;
    });
  }

  protected move(side: Side, ore: GemType, stage: CraftedStage, delta: -1 | 1): void {
    this.picks(side).update((list) => {
      const next = [...list];
      const i = next.findIndex((p) => p.ore === ore && p.stage === stage);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  protected hasAttackers = computed(() => this.attackers().length > 0);

  private request = computed<AttackRequest>(() => {
    const body = (list: Pick[]) => list.map((p) => ({ ore: p.ore, stage: p.stage, quantity: p.quantity }));
    return { attackers: body(this.attackers()), defenders: body(this.defenders()) };
  });
  private key = computed(() => JSON.stringify(this.request()));

  // ---- Prévia (debounce, uma por vez, descarta resposta velha) ----
  protected preview = signal<AttackResult | null>(null);
  protected previewError = signal<string | null>(null);
  private previewKey = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private again = false;
  private destroyed = false;

  /** A prévia na tela corresponde à seleção atual (nenhuma mudança pendente). */
  protected fresh = computed(() => this.previewKey() === this.key());

  constructor() {
    effect(() => {
      const id = this.deposit().id;
      const key = this.key();
      const has = this.hasAttackers();
      untracked(() => this.schedule(id, key, has));
    });
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.timer) clearTimeout(this.timer);
    });
  }

  private schedule(_id: number, _key: string, has: boolean): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!has) {
      this.preview.set(null);
      this.previewError.set(null);
      this.previewKey.set(null);
      return;
    }
    this.timer = setTimeout(() => void this.run(), PREVIEW_DEBOUNCE_MS);
  }

  private async run(): Promise<void> {
    if (this.destroyed) return;
    if (this.inFlight) {
      this.again = true;
      return;
    }
    this.inFlight = true;
    const key = this.key();
    const body = this.request();
    let retry429 = false;
    try {
      const res = await this.store.previewAttack(this.deposit().id, body);
      if (key === this.key()) {
        this.preview.set(res);
        this.previewError.set(null);
        this.previewKey.set(key);
      }
    } catch (e) {
      const err = describeError(e);
      if (err.status === 429) retry429 = true;
      else if (key === this.key()) {
        // Erros de regra da prévia (ex.: `InvalidAttack`) aparecem aqui, sem toast.
        this.preview.set(null);
        this.previewError.set(err.message);
        this.previewKey.set(key);
      }
    } finally {
      this.inFlight = false;
      if (!this.destroyed && (retry429 || this.again)) {
        this.again = false;
        this.timer = setTimeout(() => void this.run(), retry429 ? PREVIEW_RETRY_429_MS : 0);
      }
    }
  }

  // ---- Resultado ----
  protected blockerText = computed(() => {
    const b = this.preview()?.blocker;
    return b ? messageForCode(b) : '';
  });

  /** Quanto falta de energia de exploração (só aritmética sobre números do servidor). */
  protected shortfall = computed(() => {
    const p = this.preview();
    if (!p || p.blocker !== 'NotEnoughExploreEnergy') return 0;
    return Math.max(0, p.energyCost - (this.store.exploreLive()?.energy ?? 0));
  });

  protected unusedNote = computed(() => {
    const p = this.preview();
    if (!p) return false;
    const sum = (list: { quantity: number }[]) => list.reduce((a, b) => a + b.quantity, 0);
    return sum(p.attackersUsed) < sum(this.attackers()) || sum(p.defendersUsed) < sum(this.defenders());
  });

  /** Só confirma o que foi previsto: prévia atual, sem pendência e sem bloqueio. */
  protected canConfirm = computed(() => {
    const p = this.preview();
    return this.hasAttackers() && this.fresh() && !this.previewError() && !!p?.canConfirm && !this.store.busy();
  });

  protected percent(value: number, total: number): number {
    return total > 0 ? Math.min(100, (value / total) * 100) : 0;
  }

  protected stacks(list: GemStack[]): string {
    return list.length ? list.map((s) => `${s.quantity}× ${oreLabel(s.oreType as OreType)} ${stageLabel(s.stage).toLowerCase()}`).join(', ') : 'nenhuma';
  }

  protected async confirm(): Promise<void> {
    if (!this.canConfirm()) return;
    const res = await this.store.attackDeposit(this.deposit().id, this.request());
    if (!res) return;
    this.attackers.set([]);
    this.defenders.set([]);
    if (res.broken) this.closed.emit();
  }
}
