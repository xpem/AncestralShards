import { Component, computed, inject } from '@angular/core';
import { GameStore } from '../../../services/game.store';
import { oreLabel } from '../../../shared/ore-info';

@Component({
  selector: 'app-next-mine',
  template: `
    @if (next(); as n) {
      <section class="sh-card">
        <div class="sh-row">
          <h2 class="sh-title mb-0">Mina {{ n.mineNumber }}</h2>
          <span class="sh-tag">À venda</span>
        </div>
        <ul class="sh-chips mt-2">
          @for (c of n.cost; track c.oreType) {
            <li class="sh-chip" [class.sh-short]="store.quantityOf(c.oreType) < c.quantity">
              {{ label(c.oreType) }}
              <strong>{{ store.quantityOf(c.oreType) }}/{{ c.quantity }}</strong>
            </li>
          }
        </ul>
        @if (!n.hasSlot) {
          <p class="sh-muted mt-2 mb-2">Sem espaço para uma nova mina. Use um ponto de habilidade em Minas.</p>
          <button type="button" class="sh-btn sh-btn-block" (click)="goToSkills()">
            <i class="bi bi-arrow-up-circle"></i> Ir para habilidades
          </button>
        } @else {
          @if (missing(); as m) {
            <p class="sh-muted mt-2 mb-2">Faltam {{ m }}.</p>
          }
          <button type="button" class="sh-btn sh-btn-block" [disabled]="!canAfford() || store.busy()" (click)="store.unlockMine()">
            <i class="bi bi-unlock"></i> Desbloquear Mina {{ n.mineNumber }}
          </button>
        }
      </section>
    }
  `,
})
export class NextMine {
  protected store = inject(GameStore);
  protected next = this.store.nextMine;
  protected label = oreLabel;

  // Usa o inventário local (atualiza a cada mineração); o servidor valida de novo ao comprar.
  protected canAfford = computed(() => {
    const n = this.next();
    return !!n && n.hasSlot && n.cost.every((c) => this.store.quantityOf(c.oreType) >= c.quantity);
  });

  /** Quanto falta de cada minério para pagar a mina (vazio se já dá). */
  protected missing = computed(() => {
    const n = this.next();
    if (!n) return '';
    return n.cost
      .map((c) => ({ c, diff: c.quantity - this.store.quantityOf(c.oreType) }))
      .filter((x) => x.diff > 0)
      .map((x) => `${x.diff} ${oreLabel(x.c.oreType)}`)
      .join(', ');
  });

  protected goToSkills(): void {
    document.getElementById('habilidades')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
