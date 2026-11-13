import { Component, inject } from '@angular/core';
import { GameStore } from '../../../services/game.store';
import { oreColor, oreLabel } from '../../../shared/ore-info';

@Component({
  selector: 'app-inventory',
  template: `
    <section class="sh-card" data-ui="inventory">
      <h2 class="sh-title">Inventário</h2>
      @if (store.inventory().length === 0) {
        <p class="sh-muted mb-0" data-ui="inventory-empty">Vazio. Minere para começar.</p>
      } @else {
        <ul class="sh-chips" data-ui="inventory-list">
          @for (item of store.inventory(); track item.oreType) {
            <li class="sh-chip" [attr.data-ui]="'inventory-item-' + item.oreType">
              <span class="sh-dot" [style.background]="color(item.oreType)"></span>
              {{ label(item.oreType) }}
              <small class="sh-muted">Bruto</small>
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
  protected color = oreColor;
  protected label = oreLabel;
}
