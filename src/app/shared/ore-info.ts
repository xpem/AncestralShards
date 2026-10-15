import { OreType } from '../models/shards.model';

/** Só apresentação (nome e cor). Nada de balanceamento aqui. */
export const ORE_INFO: Record<OreType, { label: string; color: string }> = {
  Quartz: { label: 'Quartzo', color: '#d9d4e8' },
  Sapphire: { label: 'Safira', color: '#4f7cff' },
  Ruby: { label: 'Rubi', color: '#ff4f6d' },
  Emerald: { label: 'Esmeralda', color: '#3fd08a' },
};

export const oreLabel = (o: OreType): string => ORE_INFO[o]?.label ?? o;
