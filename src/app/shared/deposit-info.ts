import { Deposit, DepositStatus } from '../models/shards.model';

/** Só apresentação. O nome da faixa vem do servidor; sem tradução, cai no próprio nome (ou no número do slot). */
const TIER_LABEL: Record<string, string> = { Light: 'Leve', Medium: 'Média', Hard: 'Difícil' };
export const tierLabel = (d: Pick<Deposit, 'tier' | 'slot'>): string => TIER_LABEL[d.tier] ?? (d.tier || `Faixa ${d.slot}`);

const STATUS_LABEL: Record<DepositStatus, string> = { Sealed: 'Intocado', Open: 'Aberto', Depleted: 'Esgotado', Expired: 'Expirado' };
export const depositStatusLabel = (s: DepositStatus): string => STATUS_LABEL[s] ?? s;

/** Pontos de defesa/contra-ataque: até 2 casas, sem zeros sobrando. */
export const formatPoints = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');
