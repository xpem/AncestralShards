import { Deposit, DepositStatus, SkillRequirement, SkillType } from '../models/shards.model';

/** Só apresentação. O nome da faixa vem do servidor; sem tradução, cai no próprio nome (ou na raridade). */
const TIER_LABEL: Record<string, string> = { Light: 'Leve', Medium: 'Média', Hard: 'Difícil' };
export const tierLabel = (d: Pick<Deposit, 'tier' | 'rarity'>): string => TIER_LABEL[d.tier] ?? (d.tier || `Raridade ${d.rarity}`);

const STATUS_LABEL: Record<DepositStatus, string> = { Sealed: 'Intocado', Open: 'Aberto', Depleted: 'Esgotado', Expired: 'Expirado' };
export const depositStatusLabel = (s: DepositStatus): string => STATUS_LABEL[s] ?? s;

/** Pontos de defesa/contra-ataque: até 2 casas, sem zeros sobrando. */
export const formatPoints = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

/** Nome das skills para as mensagens de pré-requisito (só apresentação). */
export const SKILL_LABEL: Record<SkillType, string> = {
  DoubleDrop: 'Drop duplo', MineSlots: 'Minas', CartCapacity: 'Vagonete', Workshop: 'Oficina', Deposits: 'Depósitos',
};
export const skillLabel = (t: string): string => (SKILL_LABEL as Record<string, string | undefined>)[t] ?? t;

/** O que falta para o pré-requisito (ex.: "jogador nível 14 e Oficina nível 1"). Os números vêm do servidor. */
export function requirementText(r: SkillRequirement): string {
  const parts: string[] = [];
  if (r.minPlayerLevel > 0) parts.push(`jogador nível ${r.minPlayerLevel}`);
  if (r.requiresSkill) parts.push(`${skillLabel(r.requiresSkill)} nível ${r.requiresSkillLevel}`);
  return parts.join(' e ');
}
