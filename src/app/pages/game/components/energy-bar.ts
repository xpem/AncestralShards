import { Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../services/game.store';
import { formatDuration } from '../../../shared/format';

@Component({
  selector: 'app-energy-bar',
  template: `
    @if (player(); as p) {
      <section class="sh-card">
        <div class="sh-row">
          <h2 class="sh-title mb-0"><i class="bi bi-lightning-charge energy-icon me-1"></i>Energia</h2>
          <strong class="sh-count">{{ store.availableEnergy() }}/{{ p.maxEnergy }}</strong>
        </div>
        <div class="sh-bar" role="progressbar" [attr.aria-valuenow]="store.availableEnergy()" aria-valuemin="0" [attr.aria-valuemax]="p.maxEnergy">
          <div class="sh-bar-fill energy" [style.width.%]="percent()"></div>
        </div>
        <small class="sh-muted">{{ caption() }}</small>
      </section>
    }
  `,
})
export class EnergyBar {
  protected store = inject(GameStore);
  protected player = this.store.player;

  protected percent = computed(() => {
    const p = this.player();
    return p && p.maxEnergy > 0 ? (this.store.availableEnergy() / p.maxEnergy) * 100 : 0;
  });

  protected caption = computed(() => {
    const p = this.player();
    const live = this.store.energyLive();
    if (!p || !live || live.nextAtMs === null) return 'Energia cheia';
    const now = this.store.nowMs();
    const toNext = live.nextAtMs - now;
    const missingAfterNext = p.maxEnergy - live.energy - 1;
    const toFull = toNext + missingAfterNext * p.secondsPerEnergy * 1000;
    return `+1 em ${formatDuration(toNext)} · cheia em ${formatDuration(toFull)}`;
  });
}
