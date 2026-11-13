import { Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../services/game.store';
import { energyCaption } from '../../../shared/energy';

@Component({
  selector: 'app-energy-bar',
  template: `
    @if (player(); as p) {
      <section class="sh-card" data-ui="energy-bar">
        <div class="sh-row">
          <h2 class="sh-title mb-0"><i class="bi bi-lightning-charge energy-icon me-1"></i>Energia</h2>
          <strong class="sh-count" data-ui="energy-count">{{ store.availableEnergy() }}/{{ p.maxEnergy }}</strong>
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
    return p ? energyCaption(this.store.energyLive(), p.maxEnergy, p.secondsPerEnergy, this.store.nowMs()) : '';
  });
}
