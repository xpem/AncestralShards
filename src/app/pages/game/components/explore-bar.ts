import { Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../services/game.store';
import { energyCaption } from '../../../shared/energy';

/** Segunda barra de energia: só o contra-ataque e a extração de depósitos a gastam. */
@Component({
  selector: 'app-explore-bar',
  template: `
    @if (store.player(); as p) {
      <section class="sh-card" data-ui="explore-bar">
        <div class="sh-row">
          <h2 class="sh-title mb-0"><i class="bi bi-compass me-1"></i>Exploração</h2>
          <strong class="sh-count" data-ui="explore-count">{{ live()?.energy ?? p.exploreEnergy }}/{{ p.exploreMaxEnergy }}</strong>
        </div>
        <div class="sh-bar" role="progressbar" aria-label="Energia de exploração" [attr.aria-valuenow]="live()?.energy ?? p.exploreEnergy" aria-valuemin="0" [attr.aria-valuemax]="p.exploreMaxEnergy">
          <div class="sh-bar-fill explore" [style.width.%]="percent()"></div>
        </div>
        <small class="sh-muted" data-ui="explore-caption">{{ caption() }}</small>
      </section>
    }
  `,
})
export class ExploreBar {
  protected store = inject(GameStore);
  protected live = this.store.exploreLive;

  protected percent = computed(() => {
    const p = this.store.player();
    const e = this.live()?.energy ?? p?.exploreEnergy ?? 0;
    return p && p.exploreMaxEnergy > 0 ? (e / p.exploreMaxEnergy) * 100 : 0;
  });

  protected caption = computed(() => {
    const p = this.store.player();
    return p ? energyCaption(this.live(), p.exploreMaxEnergy, p.exploreSecondsPerEnergy, this.store.nowMs(), 'Exploração cheia') : '';
  });
}
