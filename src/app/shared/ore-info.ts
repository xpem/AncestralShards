import { CraftedStage, Element, ItemStage, OreType } from '../models/shards.model';

/** Só apresentação (nome e cor). Nada de balanceamento aqui. */
export interface OreLook { label: string; color: string; }

export const ORE_INFO: Record<OreType, OreLook> = {
  Quartz: { label: 'Quartzo', color: '#d9d4e8' },
  Sapphire: { label: 'Safira', color: '#4f7cff' },
  Ruby: { label: 'Rubi', color: '#ff4f6d' },
  Emerald: { label: 'Esmeralda', color: '#3fd08a' },
  Amethyst: { label: 'Ametista', color: '#b06cff' },
};

const FALLBACK_ORE: OreLook = { label: '', color: '#a8977d' };

/** Aparência de um minério; um valor que o front ainda não conhece não pode quebrar a tela. */
export const oreLook = (o: string): OreLook => (ORE_INFO as Record<string, OreLook | undefined>)[o] ?? { ...FALLBACK_ORE, label: o };
export const oreLabel = (o: OreType): string => oreLook(o).label;
export const oreColor = (o: OreType): string => oreLook(o).color;

/** Elementos: só nome, ícone e cor (as regras vêm de `state.ores` e `state.combat`). */
export interface ElementLook { label: string; icon: string; color: string; }
const ELEMENT_INFO: Record<Element, ElementLook> = {
  Neutral: { label: 'Neutro', icon: 'bi-circle', color: '#d9d4e8' },
  Fire: { label: 'Fogo', icon: 'bi-fire', color: '#ff7a45' },
  Water: { label: 'Água', icon: 'bi-droplet-fill', color: '#4fb4ff' },
  Wind: { label: 'Vento', icon: 'bi-wind', color: '#7fe3c4' },
};
export const elementLook = (e: string): ElementLook =>
  (ELEMENT_INFO as Record<string, ElementLook | undefined>)[e] ?? { label: e, icon: 'bi-question-circle', color: '#a8977d' };

const STAGE_LABEL: Record<ItemStage, string> = { Raw: 'Bruto', Polished: 'Polido', Faceted: 'Facetado' };
export const stageLabel = (s: ItemStage): string => STAGE_LABEL[s] ?? s;
export const CRAFTED_STAGES: CraftedStage[] = ['Polished', 'Faceted'];

/** Multiplicadores como texto: 1,5 -> "×1,5". */
export const formatMultiplier = (m: number): string => `×${String(m).replace('.', ',')}`;
