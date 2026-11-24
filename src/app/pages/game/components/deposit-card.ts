import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Deposit, ItemStage, OreType } from '../../../models/shards.model';
import { formatOres, GameStore, MAX_TIMES } from '../../../services/game.store';
import { depositStatusLabel, tierLabel } from '../../../shared/deposit-info';
import { formatDuration } from '../../../shared/format';
import { elementLook, oreColor, oreLabel, stageLabel } from '../../../shared/ore-info';

/** Cartão de um depósito: elemento, defesa, estoque e as ações que o estado dele permite (trocar, atacar, extrair). */
@Component({
  selector: 'app-deposit-card',
  template: `
    <section class="sh-card sh-dep" [class.sh-dep-done]="deposit().status === 'Depleted'" [style.--el]="element().color" [attr.data-ui]="'deposit-card-' + deposit().id">
      <div class="sh-row">
        <h3 class="sh-title mb-0" [attr.data-ui]="'deposit-card-' + deposit().id + '-title'">
          <span class="sh-gem me-1" [style.background]="oreColor()"></span>{{ oreName() }}
        </h3>
        <span class="d-flex gap-1">
          <span class="sh-tag" [attr.data-ui]="'deposit-card-' + deposit().id + '-element'" [title]="'Elemento ' + element().label">
            <i class="bi" [class]="element().icon" [style.color]="element().color"></i> {{ element().label }}
          </span>
          <span class="sh-tag" [attr.data-ui]="'deposit-card-' + deposit().id + '-tier'" [title]="'Raridade ' + deposit().rarity">{{ tier() }}</span>
          <span class="sh-tag" [class.ok]="deposit().status === 'Open'" [attr.data-ui]="'deposit-card-' + deposit().id + '-status'">{{ status() }}</span>
        </span>
      </div>

      <div class="sh-row mt-2">
        <span class="sh-muted">Defesa</span>
        <strong [attr.data-ui]="'deposit-card-' + deposit().id + '-defense'">{{ deposit().defenseCurrent }} / {{ deposit().defenseMax }}</strong>
      </div>
      <div class="sh-bar thin" role="progressbar" aria-label="Defesa" [attr.aria-valuenow]="deposit().defenseCurrent" aria-valuemin="0" [attr.aria-valuemax]="deposit().defenseMax">
        <div class="sh-bar-fill defense" [style.width.%]="percent(deposit().defenseCurrent, deposit().defenseMax)"></div>
      </div>

      <div class="sh-row">
        <span class="sh-muted">Estoque</span>
        <strong [attr.data-ui]="'deposit-card-' + deposit().id + '-stock'">{{ deposit().stockRemaining }} / {{ deposit().stockMax }}</strong>
      </div>
      <div class="sh-bar thin" role="progressbar" aria-label="Estoque" [attr.aria-valuenow]="deposit().stockRemaining" aria-valuemin="0" [attr.aria-valuemax]="deposit().stockMax">
        <div class="sh-bar-fill stock" [style.width.%]="percent(deposit().stockRemaining, deposit().stockMax)"></div>
      </div>

      <small class="sh-muted d-block" [attr.data-ui]="'deposit-card-' + deposit().id + '-yield'">
        Rende {{ deposit().unitsPerEnergy }} {{ oreName() }} por ponto de energia (+{{ deposit().xpPerEnergy }} XP)
      </small>
      @if (deposit().expiresAtUtc; as exp) {
        <small class="sh-muted d-block" [attr.data-ui]="'deposit-card-' + deposit().id + '-expires'">Expira em {{ countdown(exp) }}</small>
      }

      @if (deposit().canAttack) {
        <small class="sh-muted d-block mt-1" [attr.data-ui]="'deposit-card-' + deposit().id + '-advantage'">
          @if (advantage().length > 0) {
            <i class="bi bi-stars"></i> Vantagem com: {{ advantageText() }}
          } @else {
            Você não tem gemas lapidadas com vantagem sobre {{ element().label }}.
          }
        </small>
      }

      @if (deposit().status === 'Sealed') {
        <div class="sh-actions" [attr.data-ui]="'deposit-card-' + deposit().id + '-actions'">
          <button type="button" class="sh-btn" [attr.data-ui]="'deposit-card-' + deposit().id + '-attack-btn'" [disabled]="!deposit().canAttack || store.busy()" (click)="attack.emit(deposit().id)">
            <i class="bi bi-lightning-charge"></i> Atacar
          </button>
          <button type="button" class="sh-btn sh-btn-ghost" [attr.data-ui]="'deposit-card-' + deposit().id + '-rotate-btn'" [disabled]="!canRotate() || store.busy()" (click)="store.rotateDeposit(deposit().id)">
            <i class="bi bi-arrow-repeat"></i> Trocar · {{ rotateCost() }}
          </button>
        </div>
        @if (!deposit().canAttack) {
          <small class="sh-short d-block mt-1" [attr.data-ui]="'deposit-card-' + deposit().id + '-attack-note'">{{ attackNote() }}</small>
        }
        @if (deposit().canRotate && !rerollsAfford()) {
          <small class="sh-short d-block" [attr.data-ui]="'deposit-card-' + deposit().id + '-rotate-note'">Falta quartzo para trocar.</small>
        }
      }

      @if (deposit().status === 'Open' && deposit().canAttack) {
        <button type="button" class="sh-btn sh-btn-block" [attr.data-ui]="'deposit-card-' + deposit().id + '-attack-btn'" [disabled]="store.busy()" (click)="attack.emit(deposit().id)">
          <i class="bi bi-lightning-charge"></i> Continuar o ataque
        </button>
      }

      @if (deposit().canMine) {
        <div class="sh-dep-extract" [attr.data-ui]="'deposit-card-' + deposit().id + '-extract'">
          <div class="sh-row">
            <span class="sh-tag ok">Pronto para extrair</span>
            <span class="d-flex align-items-center gap-1" title="Pontos de energia de exploração">
              <button type="button" class="sh-btn sh-btn-sm sh-btn-square" aria-label="Menos" [attr.data-ui]="'deposit-card-' + deposit().id + '-extract-minus-btn'" [disabled]="quantity() <= 1" (click)="step(-1)">−</button>
              <strong class="sh-dep-qty" [attr.data-ui]="'deposit-card-' + deposit().id + '-extract-qty'">{{ quantity() }}</strong>
              <button type="button" class="sh-btn sh-btn-sm sh-btn-square" aria-label="Mais" [attr.data-ui]="'deposit-card-' + deposit().id + '-extract-plus-btn'" [disabled]="quantity() >= max()" (click)="step(1)">+</button>
              <button type="button" class="sh-btn-ghost" [attr.data-ui]="'deposit-card-' + deposit().id + '-extract-max-btn'" [disabled]="max() < 1 || quantity() >= max()" (click)="qty.set(max())">Máx</button>
            </span>
          </div>
          <button type="button" class="sh-btn sh-btn-alt sh-btn-block" [attr.data-ui]="'deposit-card-' + deposit().id + '-extract-btn'" [disabled]="max() < 1 || store.busy()" (click)="extract()">
            <i class="bi bi-gem"></i> Extrair {{ quantity() }} {{ quantity() === 1 ? 'ponto' : 'pontos' }}
          </button>
          @if (max() < 1) {
            <small class="sh-short d-block mt-1" [attr.data-ui]="'deposit-card-' + deposit().id + '-extract-note'">Energia de exploração insuficiente.</small>
          } @else {
            <small class="sh-muted d-block mt-1" [attr.data-ui]="'deposit-card-' + deposit().id + '-extract-note'">
              Gasta {{ quantity() }} de energia de exploração e rende até {{ units() }} {{ oreName() }} (+{{ xp() }} XP).
              Dá para extrair até {{ max() }} pontos agora.
            </small>
          }
        </div>
      }

      @if (deposit().status === 'Depleted') {
        <div class="sh-dep-extract" [attr.data-ui]="'deposit-card-' + deposit().id + '-depleted'">
          <small class="sh-muted d-block">Depósito esgotado.@if (craftable()) { Leve {{ oreName() }} à Oficina para lapidar.}</small>
          @if (craftable()) {
            <button type="button" class="sh-link" [attr.data-ui]="'deposit-card-' + deposit().id + '-workshop-link'" (click)="store.tab.set('workshop')">Ir à Oficina</button>
          }
        </div>
      }
    </section>
  `,
})
export class DepositCard {
  protected store = inject(GameStore);
  readonly deposit = input.required<Deposit>();
  /** Pede ao painel para abrir a tela de ataque deste depósito (recebe o `id`). */
  readonly attack = output<number>();

  protected element = computed(() => elementLook(this.deposit().element));
  protected tier = computed(() => tierLabel(this.deposit()));
  protected status = computed(() => depositStatusLabel(this.deposit().status));
  protected oreName = computed(() => oreLabel(this.deposit().oreType));
  protected oreColor = computed(() => oreColor(this.deposit().oreType));
  /** A oficina aceita lapidar este minério (catálogo do servidor). */
  protected craftable = computed(() => this.store.oreMap().get(this.deposit().oreType)?.craftable ?? false);

  protected percent(value: number, total: number): number {
    return total > 0 ? Math.min(100, (value / total) * 100) : 0;
  }

  protected countdown(iso: string): string {
    return formatDuration(Date.parse(iso) - this.store.nowMs());
  }

  // ---- Troca ----

  protected rerolls = computed(() => this.store.deposits()?.rerolls ?? null);
  protected rerollsAfford = computed(() => this.rerolls()?.canAfford ?? false);
  protected canRotate = computed(() => this.deposit().canRotate && this.rerollsAfford());
  protected rotateCost = computed(() => {
    const cost = this.rerolls()?.nextCost;
    return cost ? formatOres([cost]) : 'Grátis';
  });

  // ---- Ataque ----

  /** Por que não dá para atacar (os campos vêm do servidor; o limite de abertos é `deposits.maxOpen`). */
  protected attackNote = computed(() => {
    const d = this.deposit();
    const block = this.store.deposits();
    if (d.defenseCurrent <= 0) return 'A defesa já foi derrubada.';
    if (d.status === 'Sealed' && block && block.openCount >= block.maxOpen) {
      return `Limite de depósitos abertos (${block.openCount}/${block.maxOpen}). Esgote um antes de abrir outro.`;
    }
    return 'Não é possível atacar este depósito agora.';
  });

  /** Gemas lapidadas que o jogador tem e que levam vantagem elemental sobre este depósito. */
  protected advantage = computed(() => {
    const el = this.deposit().element;
    const seen = new Set<string>();
    const out: { ore: OreType; stage: ItemStage }[] = [];
    for (const it of this.store.fullInventory()) {
      if (it.stage === 'Raw') continue;
      const info = this.store.oreMap().get(it.oreType);
      if (!info || !info.attack.some((a) => a.stage === it.stage && a.attack > 0)) continue;
      if (this.store.elementMultiplier(info.element, el) <= 1) continue;
      const key = `${it.oreType}-${it.stage}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ore: it.oreType, stage: it.stage });
    }
    return out;
  });
  protected advantageText = computed(() =>
    this.advantage()
      .map((a) => `${oreLabel(a.ore)} ${stageLabel(a.stage).toLowerCase()}`)
      .join(', '),
  );

  // ---- Extração ----

  protected qty = signal(1);

  /**
   * `times` da extração são PONTOS de energia de exploração. O máximo é o menor entre os pontos que esgotam o
   * estoque (`ceil(estoque / unitsPerEnergy)`), a energia ao vivo e o limite de 100.
   */
  protected max = computed(() => {
    const d = this.deposit();
    const untilEmpty = d.unitsPerEnergy > 0 ? Math.ceil(d.stockRemaining / d.unitsPerEnergy) : 0;
    const energy = Math.floor(this.store.exploreLive()?.energy ?? 0);
    return Math.max(0, Math.min(untilEmpty, energy, MAX_TIMES));
  });
  protected quantity = computed(() => Math.max(1, Math.min(this.qty(), this.max() || 1)));
  /** Estimativa: o servidor extrai só o que resta no estoque (o último ponto pode render menos). */
  protected units = computed(() => Math.min(this.deposit().stockRemaining, this.quantity() * this.deposit().unitsPerEnergy));
  protected xp = computed(() => this.quantity() * this.deposit().xpPerEnergy);

  protected step(delta: number): void {
    this.qty.set(Math.max(1, Math.min(this.max(), this.quantity() + delta)));
  }

  protected async extract(): Promise<void> {
    const times = this.quantity();
    if (this.max() < times) return;
    await this.store.mineDeposit(this.deposit().id, times);
  }
}
