import { Component, computed, inject, input, signal } from '@angular/core';
import { formatOres, GameStore, MineView } from '../../../services/game.store';
import { formatDuration } from '../../../shared/format';
import { ORE_INFO, oreLabel } from '../../../shared/ore-info';
import { ProductionPanel } from './production-panel';

@Component({
  selector: 'app-mine-card',
  imports: [ProductionPanel],
  template: `
    <section class="sh-card mine-card" [style.--ore]="oreColor()">
      <div class="sh-row">
        <h2 class="sh-title mb-0">Mina {{ mine().mineNumber }}</h2>
        <button type="button" class="sh-tag sh-tag-btn" [attr.aria-expanded]="showProduction()" (click)="showProduction.set(!showProduction())">
          {{ production() }} <i class="bi" [class.bi-chevron-down]="!showProduction()" [class.bi-chevron-up]="showProduction()"></i>
        </button>
      </div>

      @if (showProduction()) {
        <app-production-panel [mine]="mine()" (done)="showProduction.set(false)" />
      }

      <div class="sh-row mt-3">
        <span class="sh-muted">Vagonete</span>
        <strong class="mine-count">≈ {{ cart() }} / {{ mine().cartCapacity }}</strong>
      </div>
      <div class="sh-bar" role="progressbar" [attr.aria-valuenow]="cart()" aria-valuemin="0" [attr.aria-valuemax]="mine().cartCapacity">
        <div class="sh-bar-fill cart" [style.width.%]="percent()"></div>
      </div>
      <small class="sh-muted">{{ cartCaption() }}</small>

      <div class="mine-upgrade">
        <div class="sh-row">
          <span class="mine-upgrade-title">Vagonete <b>nv. {{ mine().cartLevel }}</b></span>
          @if (upgrade(); as up) {
            @if (up.next) {
              <button type="button" class="sh-btn-ghost" [disabled]="!canUpgrade() || store.busy()"
                      (click)="store.upgradeCart(mine().mineNumber)">
                <i class="bi bi-arrow-up-circle"></i> Ampliar
              </button>
            } @else {
              <span class="sh-tag ok">nível máximo</span>
            }
          }
        </div>
        @if (upgrade()?.next; as next) {
          <small class="sh-muted d-block mt-2">
            Nv. {{ next.level }}: capacidade {{ next.capacity }} · custo {{ costText() }}
          </small>
          @if (!next.skillAllows) {
            <small class="sh-muted d-block">
              Use um ponto de habilidade em Vagonete para liberar este nível.
              <a href="#habilidades" (click)="goToSkills($event)">Ver habilidades</a>
            </small>
          } @else if (!next.canAfford) {
            <small class="sh-short d-block">Faltam {{ missingText() }}.</small>
          }
        }
      </div>

      <div class="sh-actions">
        <button type="button" class="sh-btn" [disabled]="store.availableEnergy() < 1" (click)="store.mine(mine().mineNumber)">
          <i class="bi bi-hammer"></i> Minerar
        </button>
        <button type="button" class="sh-btn sh-btn-x10" [disabled]="store.availableEnergy() < 1" (click)="store.mine(mine().mineNumber, 10)">
          ×10
        </button>
        <button type="button" class="sh-btn sh-btn-alt" [disabled]="cart() < 1 || store.busy()" (click)="store.collectCart(mine().mineNumber)">
          <i class="bi bi-box-seam"></i> Coletar
        </button>
      </div>
    </section>
  `,
})
export class MineCard {
  protected store = inject(GameStore);
  readonly mine = input.required<MineView>();
  protected showProduction = signal(false);

  protected oreColor = computed(() => ORE_INFO[this.mine().production]?.color ?? 'var(--line-2)');
  protected production = computed(() => oreLabel(this.mine().production));
  protected cart = computed(() => this.store.cartNow(this.mine()));
  protected percent = computed(() => {
    const cap = this.mine().cartCapacity;
    return cap > 0 ? (this.cart() / cap) * 100 : 0;
  });

  protected upgrade = computed(() => this.store.cartUpgrades().find((u) => u.mineNumber === this.mine().mineNumber) ?? null);
  protected canUpgrade = computed(() => {
    const next = this.upgrade()?.next;
    return !!next && next.skillAllows && next.canAfford;
  });
  protected costText = computed(() => formatOres(this.upgrade()?.next?.cost ?? []));
  protected missingText = computed(() => {
    const cost = this.upgrade()?.next?.cost ?? [];
    const missing = cost
      .map((c) => ({ oreType: c.oreType, quantity: c.quantity - this.store.quantityOf(c.oreType) }))
      .filter((c) => c.quantity > 0);
    return formatOres(missing);
  });

  protected goToSkills(ev: Event): void {
    ev.preventDefault();
    document.getElementById('habilidades')?.scrollIntoView({ behavior: 'smooth' });
  }

  protected cartCaption = computed(() => {
    const m = this.mine();
    if (this.cart() >= m.cartCapacity) return 'Vagonete cheio: a mineração automática está parada.';
    if (!m.cartFullAtUtc) return 'Esta mina não produz sozinha.';
    return `Enche em ${formatDuration(Date.parse(m.cartFullAtUtc) - this.store.nowMs())}`;
  });
}
