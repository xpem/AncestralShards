import { Component, inject } from '@angular/core';
import { Mission, MissionReward } from '../../../models/shards.model';
import { GameStore } from '../../../services/game.store';
import { oreLabel } from '../../../shared/ore-info';

@Component({
  selector: 'app-mission-list',
  template: `
    @if (store.missions().length > 0) {
      <section class="sh-card sh-plate">
        <h2 class="sh-title"><i class="bi bi-trophy me-2"></i>Missões</h2>
        @for (m of store.missions(); track m.type) {
          <article class="sh-quest" [class.done]="m.status === 'Completed'">
            <div class="sh-row">
              <h3 class="sh-quest-title">{{ m.name }}</h3>
              @if (m.status === 'Completed') {
                <span class="sh-tag ok">Concluída</span>
              } @else {
                <span class="sh-muted">{{ m.progress }}/{{ m.goal }}</span>
              }
            </div>
            <p class="sh-quest-desc">{{ m.description }}</p>
            <div class="sh-bar thin">
              <div class="sh-bar-fill mission" [style.width.%]="percent(m)"></div>
            </div>
            <small class="sh-reward"><i class="bi bi-stars"></i> Recompensa: {{ reward(m.reward) }}</small>
            @if (m.status === 'Completed') {
              <button type="button" class="sh-btn sh-btn-alt sh-btn-block" [disabled]="store.busy()" (click)="store.claimMission(m.type)">
                <i class="bi bi-gift"></i> Resgatar
              </button>
            }
          </article>
        }
      </section>
    }
  `,
})
export class MissionList {
  protected store = inject(GameStore);

  protected percent(m: Mission): number {
    return m.goal > 0 ? Math.min(100, (m.progress / m.goal) * 100) : 0;
  }

  protected reward(r: MissionReward): string {
    const parts: string[] = [];
    if (r.xp > 0) parts.push(`${r.xp} XP`);
    for (const o of r.ores) parts.push(`${o.quantity} ${oreLabel(o.oreType)}`);
    return parts.length ? parts.join(' + ') : 'título (em breve)';
  }
}
