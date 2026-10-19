import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { GemType, ItemStage, OreAmount, OreType, WorkshopGem, WorkshopRecipe } from '../../../models/shards.model';
import { GameStore, MAX_TIMES, stageLabel } from '../../../services/game.store';
import { ORE_INFO, oreLabel } from '../../../shared/ore-info';

type Crafted = Exclude<ItemStage, 'Raw'>;
const STAGES: ItemStage[] = ['Raw', 'Polished', 'Faceted'];

/** Por que o botão está desabilitado (ou `null` se pode lapidar). */
interface Check {
  times: number;
  max: number;
  reason: string | null;
}

@Component({
  selector: 'app-workshop',
  template: `
    <section class="sh-card" id="oficina">
      <h2 class="sh-title">Gemas</h2>
      @if (rows().length === 0) {
        <p class="sh-muted">Nenhuma gema ainda.</p>
      } @else {
        <ul class="sh-chips">
          @for (row of rows(); track row.ore) {
            <li class="sh-chip">
              <span class="sh-dot" [style.background]="info[row.ore].color"></span>
              {{ label(row.ore) }}
              @for (c of row.cells; track c.stage) {
                <small class="sh-muted">{{ stageName(c.stage) }}</small> <strong>{{ c.quantity }}</strong>
              }
            </li>
          }
        </ul>
      }

      <h2 class="sh-title mt-3">Oficina de Lapidação</h2>
      <div class="sh-grid sh-pair">
        @for (r of store.workshop(); track r.stage) {
          <article class="sh-mission">
            <div class="sh-row">
              <strong>{{ stageName(r.stage) }}</strong>
              @if (!r.skillAllows) {
                <button type="button" class="sh-tag sh-tag-btn" (click)="store.tab.set('progress')">
                  Habilidade Oficina nível {{ r.level }} · ir às habilidades
                </button>
              }
            </div>
            <p class="sh-muted mb-2">
              {{ r.inputQuantity }}× {{ inputName(r) }} + {{ cost(r.cost, 1) }} → 1× {{ stageName(r.stage).toLowerCase() }}
            </p>
            @for (g of r.gems; track g.oreType) {
              @let c = check(r, g);
              <div class="sh-craft">
                <div class="sh-row">
                  <span>
                    <span class="sh-dot" [style.background]="info[g.oreType].color"></span> {{ label(g.oreType) }}
                    <span class="sh-muted">({{ g.available }})</span>
                  </span>
                  <span class="d-flex align-items-center gap-1">
                    <input type="number" inputmode="numeric" class="form-control form-control-sm" style="width: 4.5rem"
                           min="1" [max]="maxTimes" [value]="requested(r, g)"
                           [attr.aria-label]="'Quantidade de ' + label(g.oreType)"
                           (input)="setTimes(r, g, $any($event.target).value)" />
                    <button type="button" class="sh-btn sh-btn-sm" [disabled]="c.reason !== null"
                            (click)="craft(r, g)">Lapidar</button>
                  </span>
                </div>
                @if (c.reason) {
                  <small class="sh-short d-block">{{ c.reason }}</small>
                } @else {
                  <small class="sh-muted d-block">Gasta {{ spend(r, g, c.times) }}</small>
                }
                @if (r.skillAllows && c.max > 0) {
                  <button type="button" class="sh-link" (click)="setTimes(r, g, c.max)">Máximo: {{ c.max }}</button>
                }
              </div>
            }
          </article>
        }
      </div>
    </section>
  `,
})
export class Workshop implements OnInit {
  protected store = inject(GameStore);
  protected info = ORE_INFO;
  protected label = oreLabel;
  protected stageName = stageLabel;
  protected readonly maxTimes = MAX_TIMES;

  private readonly chosen = signal<Record<string, number>>({});

  protected rows = computed(() => {
    const by = new Map<OreType, { stage: ItemStage; quantity: number }[]>();
    for (const it of this.store.fullInventory()) {
      by.set(it.oreType, [...(by.get(it.oreType) ?? []), { stage: it.stage, quantity: it.quantity }]);
    }
    return [...by].map(([ore, cells]) => ({ ore, cells: cells.sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)) }));
  });

  ngOnInit(): void {
    void this.store.loadFullInventory();
  }

  protected inputName(r: WorkshopRecipe): string {
    const prev = STAGES[STAGES.indexOf(r.stage) - 1];
    return `gema ${stageLabel(prev).toLowerCase()}`;
  }

  protected cost(list: OreAmount[], times: number): string {
    return list.map((c) => `${c.quantity * times} ${oreLabel(c.oreType)}`).join(' + ');
  }

  protected spend(r: WorkshopRecipe, g: WorkshopGem, times: number): string {
    const gems = `${r.inputQuantity * times} ${oreLabel(g.oreType)} ${stageLabel(STAGES[STAGES.indexOf(r.stage) - 1]).toLowerCase()}`;
    return `${gems} + ${this.cost(r.cost, times)}`;
  }

  protected requested(r: WorkshopRecipe, g: WorkshopGem): number {
    return this.chosen()[this.key(r, g.oreType)] ?? 1;
  }

  protected setTimes(r: WorkshopRecipe, g: WorkshopGem, raw: string | number): void {
    const n = Math.floor(Number(raw));
    this.chosen.update((c) => ({ ...c, [this.key(r, g.oreType)]: Number.isFinite(n) ? n : 0 }));
  }

  /** Valida o pedido atual e diz o motivo exato de não poder lapidar (o servidor continua sendo a palavra final). */
  protected check(r: WorkshopRecipe, g: WorkshopGem): Check {
    const times = this.requested(r, g);
    let max = Math.min(MAX_TIMES, Math.floor(g.available / r.inputQuantity));
    for (const c of r.cost) max = Math.min(max, Math.floor(this.store.quantityOf(c.oreType) / c.quantity));
    max = Math.max(0, max);

    const fail = (reason: string): Check => ({ times, max, reason });
    if (!r.skillAllows) return fail(`Libere com a habilidade Oficina (nível ${r.level}).`);
    if (this.store.crafting()) return fail('Lapidando...');
    if (!Number.isInteger(times) || times < 1) return fail('Informe uma quantidade de 1 ou mais.');
    if (times > MAX_TIMES) return fail(`O limite é ${MAX_TIMES} por vez.`);

    const needGems = r.inputQuantity * times;
    if (g.available < needGems) {
      return fail(`Faltam gemas: precisa de ${needGems}, você tem ${g.available}.`);
    }
    for (const c of r.cost) {
      const need = c.quantity * times;
      const have = this.store.quantityOf(c.oreType);
      if (have < need) return fail(`Falta ${oreLabel(c.oreType)}: precisa de ${need}, você tem ${have}.`);
    }
    return { times, max, reason: null };
  }

  protected craft(r: WorkshopRecipe, g: WorkshopGem): void {
    const c = this.check(r, g);
    if (c.reason) return;
    void this.store.craft(g.oreType as GemType, r.stage as Crafted, c.times);
  }

  private key(r: WorkshopRecipe, ore: OreType): string {
    return `${r.stage}:${ore}`;
  }
}
