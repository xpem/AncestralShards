import { Component, OnInit, computed, inject } from '@angular/core';
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
    <section class="sh-card sh-plate" id="oficina">
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

      <div class="sh-grid sh-pair mt-3">
        @for (r of store.workshop(); track r.stage) {
          <article class="sh-recipe">
            <div class="sh-row">
              <h3 class="sh-recipe-title">{{ stageName(r.stage) }}</h3>
              @if (!r.skillAllows) {
                <button type="button" class="sh-tag sh-tag-btn sh-tag-lock" title="Ir às habilidades" (click)="store.tab.set('progress')">
                  <i class="bi bi-lock"></i> Oficina nv. {{ r.level }}
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
                  <span class="d-flex align-items-center gap-2">
                    <span class="sh-gem" [style.background]="info[g.oreType].color"></span>
                    <strong>{{ label(g.oreType) }}</strong>
                    <span class="sh-muted">({{ g.available }})</span>
                  </span>
                  <span class="d-flex align-items-center gap-1">
                    <button type="button" class="sh-btn sh-btn-sm" [disabled]="c.reason !== null"
                            (click)="craft(r, g, 1)">Lapidar</button>
                    <button type="button" class="sh-btn sh-btn-sm" [disabled]="batch(r, g).reason !== null"
                            [attr.aria-label]="'Lapidar ' + batchSize + ' vezes'" (click)="craft(r, g, batchSize)">×{{ batchSize }}</button>
                  </span>
                </div>
                @if (c.reason) {
                  <small class="sh-short d-block sh-craft-note">{{ c.reason }}</small>
                } @else {
                  <small class="sh-muted d-block sh-craft-note">Gasta {{ spend(r, g, 1) }}</small>
                  @if (batch(r, g).reason; as why) {
                    <small class="sh-muted d-block">×{{ batchSize }}: {{ why }}</small>
                  }
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
  /** Tamanho do lote do botão ×N (apresentação; o limite real de `times` é MAX_TIMES). */
  protected readonly batchSize = 5;

  protected rows = computed(() => {
    const by = new Map<OreType, { stage: ItemStage; quantity: number }[]>();
    for (const it of this.store.fullInventory()) {
      // Minérios fora do enum conhecido (ex.: dados antigos com valores sem uso) não têm como ser exibidos.
      if (!(it.oreType in ORE_INFO) || !STAGES.includes(it.stage)) continue;
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

  protected batch(r: WorkshopRecipe, g: WorkshopGem): Check {
    return this.check(r, g, this.batchSize);
  }

  /** Valida `times` lapidações e diz o motivo exato de não poder (o servidor continua sendo a palavra final). */
  protected check(r: WorkshopRecipe, g: WorkshopGem, times = 1): Check {
    let max = Math.min(MAX_TIMES, Math.floor(g.available / r.inputQuantity));
    for (const c of r.cost) max = Math.min(max, Math.floor(this.store.quantityOf(c.oreType) / c.quantity));
    max = Math.max(0, max);

    const fail = (reason: string): Check => ({ times, max, reason });
    if (!r.skillAllows) return fail(`Libere com a habilidade Oficina (nível ${r.level}).`);
    if (this.store.crafting()) return fail('Lapidando...');
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

  protected craft(r: WorkshopRecipe, g: WorkshopGem, times: number): void {
    if (this.check(r, g, times).reason) return;
    void this.store.craft(g.oreType as GemType, r.stage as Crafted, times);
  }
}
