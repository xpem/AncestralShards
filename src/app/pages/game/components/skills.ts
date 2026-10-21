import { Component, inject } from '@angular/core';
import { GameStore } from '../../../services/game.store';

/** Só apresentação; os níveis e o máximo vêm da API. */
const SKILL_INFO: Record<string, { label: string; description: string } | undefined> = {
  DoubleDrop: { label: 'Drop duplo', description: 'Chance de render um minério extra ao minerar.' },
  MineSlots: { label: 'Minas', description: 'Cada ponto libera espaço para mais uma mina.' },
  Workshop: { label: 'Oficina', description: 'Nível 1 libera polir gemas; nível 2 libera facetar.' },
  CartCapacity: { label: 'Vagonete', description: 'Libera a ampliação do vagonete, até este nível, em cada mina.' },
};

@Component({
  selector: 'app-skills',
  template: `
    @if (store.skills().length > 0) {
      <section class="sh-card sh-plate" id="habilidades">
        <div class="sh-row mb-2">
          <h2 class="sh-title mb-0">Habilidades</h2>
          <span class="sh-tag sh-tag-points">{{ points() }} {{ points() === 1 ? 'ponto' : 'pontos' }}</span>
        </div>
        @for (sk of store.skills(); track sk.type) {
          <article class="sh-skill">
            <div class="sh-skill-main">
              <div class="sh-skill-name">
                {{ info[sk.type]?.label ?? sk.type }}
                <span class="sh-skill-level">{{ sk.level }}/{{ sk.maxLevel }}</span>
              </div>
              <div class="sh-segs" aria-hidden="true">
                @for (i of segments(sk.maxLevel); track i) {
                  <span class="sh-seg" [class.on]="i < sk.level"></span>
                }
              </div>
              @if (info[sk.type]?.description; as desc) {
                <p class="sh-muted mb-0">{{ desc }}</p>
              }
            </div>
            <button type="button" class="sh-btn sh-btn-square" aria-label="Evoluir habilidade"
                    [disabled]="points() < 1 || sk.level >= sk.maxLevel || store.busy()"
                    (click)="store.distributeSkill(sk.type)">
              <i class="bi bi-plus-lg"></i>
            </button>
          </article>
        }
      </section>
    }
  `,
})
export class Skills {
  protected store = inject(GameStore);
  protected info = SKILL_INFO;
  protected segments = (n: number) => Array.from({ length: n }, (_, i) => i);
  protected points = () => this.store.player()?.skillPoints ?? 0;
}
