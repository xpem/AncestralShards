import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { OreAmount } from '../../../models/shards.model';
import { GameStore, formatOres } from '../../../services/game.store';
import { formatDuration } from '../../../shared/format';
import { elementLook, formatMultiplier } from '../../../shared/ore-info';
import { AttackPanel } from './attack-panel';
import { DepositCard } from './deposit-card';
import { ExploreBar } from './explore-bar';

/** Aba de depósitos: barra de exploração, ofertas da semana, depósitos em andamento e a tela de ataque. */
@Component({
  selector: 'app-deposits-panel',
  imports: [AttackPanel, DepositCard, ExploreBar],
  template: `
    @if (store.deposits(); as d) {
      @if (attacking(); as dep) {
        <app-attack-panel [deposit]="dep" (closed)="attackingId.set(null)" />
      } @else {
        <app-explore-bar />

        <section class="sh-card sh-plate" data-ui="deposits-panel">
          <div class="sh-row">
            <h2 class="sh-title mb-0"><i class="bi bi-box-seam me-2"></i>Depósitos</h2>
            <span class="sh-muted" title="Tempo até as ofertas mudarem" data-ui="deposits-countdown">
              <i class="bi bi-hourglass-split"></i> {{ countdown() }}
            </span>
          </div>
          <p class="sh-muted mt-2 mb-1" data-ui="deposits-open">Abertos {{ d.openCount }}/{{ d.maxOpen }}</p>
          <p class="sh-muted mb-1" data-ui="deposits-rerolls">
            @if (d.rerolls.freeLeft > 0) {
              {{ d.rerolls.freeLeft }} {{ d.rerolls.freeLeft === 1 ? 'troca grátis' : 'trocas grátis' }} nesta semana
            } @else if (d.rerolls.nextCost; as cost) {
              Próxima troca: {{ formatCost(cost) }}
            }
          </p>
          <button type="button" class="sh-link" data-ui="deposits-guide-btn" [attr.aria-expanded]="showGuide()" (click)="showGuide.set(!showGuide())">
            {{ showGuide() ? 'Esconder' : 'Ver' }} guia de elementos
          </button>
          @if (showGuide()) {
            <ul class="sh-guide" data-ui="deposits-guide">
              @for (g of guide(); track g.text) {
                <li><i class="bi" [class]="g.icon" [style.color]="g.color"></i> {{ g.text }}</li>
              }
            </ul>
          }
        </section>

        <h3 class="sh-attack-head" data-ui="deposits-offers-title">Ofertas da semana</h3>
        @if (offers().length === 0) {
          <p class="sh-muted" data-ui="deposits-offers-empty">Nenhuma oferta intocada. Novas ofertas chegam quando a semana virar.</p>
        } @else {
          <div class="sh-grid sh-trio" data-ui="deposits-offers">
            @for (dep of offers(); track dep.id) {
              <app-deposit-card [deposit]="dep" (attack)="attackingId.set($event)" />
            }
          </div>
        }

        @if (ongoing().length > 0) {
          <h3 class="sh-attack-head" data-ui="deposits-ongoing-title">Em andamento</h3>
          <div class="sh-grid sh-trio" data-ui="deposits-ongoing">
            @for (dep of ongoing(); track dep.id) {
              <app-deposit-card [deposit]="dep" (attack)="attackingId.set($event)" />
            }
          </div>
        }
      }
    }
  `,
})
export class DepositsPanel implements OnInit {
  protected store = inject(GameStore);
  protected attackingId = signal<number | null>(null);
  protected showGuide = signal(false);

  /** Só abre a tela de ataque enquanto o servidor ainda diz que dá para atacar (fecha sozinha ao derrubar a defesa). */
  protected attacking = computed(() => {
    const id = this.attackingId();
    const dep = id === null ? null : (this.store.deposits()?.items.find((x) => x.id === id) ?? null);
    return dep && dep.canAttack ? dep : null;
  });

  protected offers = computed(() => this.store.deposits()?.items.filter((x) => x.status === 'Sealed') ?? []);
  protected ongoing = computed(() => this.store.deposits()?.items.filter((x) => x.status !== 'Sealed' && x.status !== 'Expired') ?? []);

  protected countdown = computed(() => {
    const d = this.store.deposits();
    return d ? formatDuration(Date.parse(d.resetsAtUtc) - this.store.nowMs()) : '';
  });

  /** Os pares com vantagem lidos da matriz do servidor (não presume 3 elementos nem ciclo fechado). */
  protected guide = computed(() =>
    (this.store.combat()?.effectiveness ?? [])
      .filter((e) => e.multiplier > 1)
      .map((e) => {
        const a = elementLook(e.attacker);
        return { icon: a.icon, color: a.color, text: `${a.label} vence ${elementLook(e.defender).label} (${formatMultiplier(e.multiplier)})` };
      }),
  );

  protected formatCost = (cost: OreAmount): string => formatOres([cost]);

  ngOnInit(): void {
    void this.store.loadFullInventory();
  }
}
