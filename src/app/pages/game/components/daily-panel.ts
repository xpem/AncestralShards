import { Component, computed, inject } from '@angular/core';
import { DailyMission, MissionReward } from '../../../models/shards.model';
import { GameStore } from '../../../services/game.store';
import { formatHm } from '../../../shared/format';
import { oreLabel } from '../../../shared/ore-info';

@Component({
  selector: 'app-daily-panel',
  template: `
    @if (store.daily(); as d) {
      <section class="sh-card sh-plate">
        <div class="sh-row">
          <h2 class="sh-title"><i class="bi bi-calendar-check me-2"></i>Missões do dia</h2>
          <span class="sh-muted" title="Tempo até o próximo dia">
            <i class="bi bi-hourglass-split"></i> {{ countdown() }}
          </span>
        </div>
        <p class="sh-muted mb-2">
          @if (d.streak.days > 0) {
            🔥 {{ d.streak.days }}/{{ d.streak.cycleDays }}
          } @else {
            Sem sequência
          }
        </p>

        @for (m of d.missions; track m.type) {
          <article class="sh-quest" [class.done]="m.status === 'Completed'" [style.opacity]="m.status === 'Claimed' ? 0.55 : null">
            <div class="sh-row">
              <h3 class="sh-quest-title">{{ m.name }}</h3>
              @if (m.status === 'Claimed') {
                <span class="sh-tag">Resgatada</span>
              } @else if (m.status === 'Completed') {
                <span class="sh-tag ok">Concluída</span>
              } @else {
                <span class="sh-muted">{{ m.progress }}/{{ m.goal }}</span>
              }
            </div>
            <p class="sh-quest-desc">{{ m.description }}</p>
            @if (m.status === 'Active') {
              <div class="sh-bar thin">
                <div class="sh-bar-fill mission" [style.width.%]="percent(m)"></div>
              </div>
            }
            <small class="sh-reward"><i class="bi bi-stars"></i> Recompensa: {{ reward(m.reward) }}</small>
            @if (m.status === 'Completed') {
              <button type="button" class="sh-btn sh-btn-alt sh-btn-block" [disabled]="store.busy()" (click)="store.claimDaily(m.type)">
                <i class="bi bi-gift"></i> Resgatar
              </button>
            }
          </article>
        }

        <article class="sh-quest" [class.done]="d.chest.canClaim">
          <div class="sh-row">
            <h3 class="sh-quest-title"><i class="bi bi-box2-heart me-1"></i>Baú do dia</h3>
            @if (d.chest.claimed) {
              <span class="sh-tag">Aberto</span>
            }
          </div>
          @if (d.chest.claimed) {
            <p class="sh-quest-desc">Baú aberto. Volte amanhã.</p>
          }
          <small class="sh-reward">
            <i class="bi bi-stars"></i> {{ d.chest.claimed ? 'Amanhã' : 'Recompensa' }}: {{ reward(d.chest.reward) }}
            @if (lastCycleDay()) {
              <strong> · Amanhã: baú em dobro</strong>
            }
          </small>
          @if (!d.chest.claimed) {
            <button type="button" class="sh-btn sh-btn-alt sh-btn-block" [disabled]="store.busy() || !d.chest.canClaim"
                    (click)="store.claimDailyChest()">
              <i class="bi bi-box2-heart"></i> Abrir baú
            </button>
          }
        </article>
      </section>
    }
  `,
})
export class DailyPanel {
  protected store = inject(GameStore);

  protected readonly countdown = computed(() => {
    const d = this.store.daily();
    return d ? formatHm(Date.parse(d.resetsAtUtc) - this.store.nowMs()) : '';
  });

  /** Hoje fecha o penúltimo dia do ciclo: o baú de amanhã é o do último dia. */
  protected lastCycleDay(): boolean {
    const s = this.store.daily()?.streak;
    return !!s && s.days + 1 === s.cycleDays;
  }

  protected percent(m: DailyMission): number {
    return m.goal > 0 ? Math.min(100, (m.progress / m.goal) * 100) : 0;
  }

  protected reward(r: MissionReward): string {
    const parts: string[] = [];
    if (r.xp > 0) parts.push(`${r.xp} XP`);
    for (const o of r.ores) parts.push(`${o.quantity} ${oreLabel(o.oreType)}`);
    return parts.length ? parts.join(' + ') : '—';
  }
}
