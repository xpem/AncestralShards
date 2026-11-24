import { Component, inject } from '@angular/core';
import { Skill } from '../../../models/shards.model';
import { GameStore } from '../../../services/game.store';
import { requirementText } from '../../../shared/deposit-info';

/** Só apresentação; os níveis, o máximo e os pré-requisitos vêm da API. */
const SKILL_INFO: Record<string, { label: string; description: string } | undefined> = {
  DoubleDrop: { label: 'Drop duplo', description: 'Chance de render um minério extra ao minerar.' },
  MineSlots: { label: 'Minas', description: 'Cada ponto libera espaço para mais uma mina.' },
  Workshop: { label: 'Oficina', description: 'Nível 1 libera polir gemas; nível 2 libera facetar.' },
  CartCapacity: { label: 'Vagonete', description: 'Libera a ampliação do vagonete, até este nível, em cada mina.' },
  Deposits: { label: 'Depósitos', description: 'Cada nível libera os minérios de uma raridade a mais nas ofertas semanais.' },
};

@Component({
  selector: 'app-skills',
  template: `
    @if (store.skills().length > 0) {
      <section class="sh-card sh-plate" id="habilidades" data-ui="skills">
        <div class="sh-row mb-2">
          <h2 class="sh-title mb-0">Habilidades</h2>
          <span class="sh-tag sh-tag-points" data-ui="skills-points">{{ points() }} {{ points() === 1 ? 'ponto' : 'pontos' }}</span>
        </div>
        @for (sk of store.skills(); track sk.type) {
          <article class="sh-skill" [attr.data-ui]="'skill-' + sk.type">
            <div class="sh-skill-main">
              <div class="sh-skill-name">
                {{ info[sk.type]?.label ?? sk.type }}
                <span class="sh-skill-level">{{ sk.level }}/{{ sk.maxLevel }}</span>
                @if (locked(sk)) {
                  <i class="bi bi-lock-fill ms-1" title="Bloqueada" [attr.data-ui]="'skill-' + sk.type + '-lock'"></i>
                }
              </div>
              <div class="sh-segs" aria-hidden="true">
                @for (i of segments(sk.maxLevel); track i) {
                  <span class="sh-seg" [class.on]="i < sk.level"></span>
                }
              </div>
              @if (info[sk.type]?.description; as desc) {
                <p class="sh-muted mb-0">{{ desc }}</p>
              }
              @if (reason(sk); as why) {
                <small class="sh-short d-block" [attr.data-ui]="'skill-' + sk.type + '-requirement'">{{ why }}</small>
              }
            </div>
            <button type="button" class="sh-btn sh-btn-square" [attr.aria-label]="locked(sk) ? 'Habilidade bloqueada' : 'Evoluir habilidade'"
                    [attr.data-ui]="'skill-' + sk.type + '-upgrade-btn'" [disabled]="points() < 1 || sk.level >= sk.maxLevel || locked(sk) || store.busy()"
                    (click)="store.distributeSkill(sk.type)">
              <i class="bi" [class]="locked(sk) ? 'bi-lock-fill' : 'bi-plus-lg'"></i>
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

  /** Pré-requisito do próximo nível ainda não atendido (o servidor responderia `SkillLocked`). */
  protected locked = (sk: Skill): boolean => sk.level < sk.maxLevel && sk.nextRequirement?.met === false;

  /** Motivo do cadeado, ou o que o próximo nível exige quando já está liberado. */
  protected reason(sk: Skill): string | null {
    const req = sk.nextRequirement;
    if (!req || sk.level >= sk.maxLevel) return null;
    const need = requirementText(req);
    if (!need) return null;
    return req.met ? null : `Nível ${sk.level + 1} exige ${need}.`;
  }
}
