import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Drop, OreAmount, OreType, ProductionOption } from '../../../models/shards.model';
import { GameStore, MineView } from '../../../services/game.store';
import { ORE_INFO, oreLabel } from '../../../shared/ore-info';

@Component({
  selector: 'app-production-panel',
  template: `
    <div class="sh-prod">
      <p class="sh-muted mb-2">
        Escolha o que a mina produz. O vagonete é esvaziado antes da troca, com a produção atual.
      </p>

      @for (opt of store.productions(); track opt.focus) {
        <button type="button" class="sh-prod-opt" [class.current]="isCurrent(opt)" [class.selected]="selected() === opt.focus"
                [disabled]="isCurrent(opt) || store.busy()" (click)="selected.set(opt.focus)">
          <span class="sh-row">
            <span><span class="sh-dot" [style.background]="info[opt.focus].color"></span> <strong>{{ label(opt.focus) }}</strong></span>
            @if (isCurrent(opt)) {
              <span class="sh-tag ok">Atual</span>
            } @else {
              <span class="sh-muted" [class.sh-short]="!affordable(opt)">{{ cost(opt.switchCost) }}</span>
            }
          </span>
          <small class="sh-muted">{{ drops(opt.drops) }}</small>
        </button>
      }

      @if (selectedOption(); as opt) {
        <button type="button" class="sh-btn sh-btn-block" [disabled]="!canTry(opt) || store.busy()" (click)="confirm(opt)">
          <i class="bi bi-arrow-repeat"></i> Trocar para {{ label(opt.focus) }} ({{ cost(opt.switchCost) }})
        </button>
        @if (!canTry(opt)) {
          <small class="sh-short">Recursos insuficientes.</small>
        }
      }
    </div>
  `,
})
export class ProductionPanel {
  protected store = inject(GameStore);
  protected info = ORE_INFO;
  protected label = oreLabel;

  readonly mine = input.required<MineView>();
  readonly done = output<void>();

  protected selected = signal<OreType | null>(null);
  protected selectedOption = computed(() => this.store.productions().find((p) => p.focus === this.selected()) ?? null);

  protected isCurrent(opt: ProductionOption): boolean {
    return opt.focus === this.mine().production;
  }

  protected affordable(opt: ProductionOption): boolean {
    return opt.switchCost.every((c) => this.store.quantityOf(c.oreType) >= c.quantity);
  }

  // O que o vagonete entregar na troca também conta para o pagamento (o servidor decide):
  // só bloqueia quando nem o inventário nem um vagonete com minério poderiam cobrir.
  protected canTry(opt: ProductionOption): boolean {
    return this.affordable(opt) || this.store.cartNow(this.mine()) > 0;
  }

  protected cost(list: OreAmount[]): string {
    return list.length ? list.map((c) => `${c.quantity} ${oreLabel(c.oreType)}`).join(' + ') : 'Grátis';
  }

  protected drops(list: Drop[]): string {
    return list.map((d) => `${Math.round(d.chance * 100)}% ${oreLabel(d.oreType)} (+${d.xp} XP)`).join(' · ');
  }

  protected async confirm(opt: ProductionOption): Promise<void> {
    const res = await this.store.setProduction(this.mine().mineNumber, opt.focus);
    if (res) this.done.emit();
  }
}
