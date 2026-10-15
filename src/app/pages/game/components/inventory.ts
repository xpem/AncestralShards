import { Component, inject } from '@angular/core';
import { GameStore } from '../../../services/game.store';
import { ORE_INFO } from '../../../shared/ore-info';

@Component({
  selector: 'app-inventory',
  template: `
    <section class="sh-card">
      <h2 class="sh-title">Inventário</h2>
      @if (store.inventory().length === 0) {
        <p class="sh-muted mb-0">Vazio. Minere para começar.</p>
      } @else {
        <ul class="sh-chips">
          @for (item of store.inventory(); track item.oreType) {
            <li class="sh-chip">
              <span class="sh-dot" [style.background]="info[item.oreType].color"></span>
              {{ info[item.oreType].label }}
              <strong>{{ item.quantity }}</strong>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class Inventory {
  protected store = inject(GameStore);
  protected info = ORE_INFO;
}
