import { EnergyLive } from '../services/game.store';
import { formatDuration } from './format';

/** Legenda de uma barra de energia: "+1 em 3 min · cheia em 1 h 02 min" ou "Energia cheia". */
export function energyCaption(live: EnergyLive | null, max: number, secondsPerPoint: number, nowMs: number, fullLabel = 'Energia cheia'): string {
  if (!live || live.nextAtMs === null) return fullLabel;
  const toNext = live.nextAtMs - nowMs;
  const missingAfterNext = max - live.energy - 1;
  const toFull = toNext + missingAfterNext * secondsPerPoint * 1000;
  return `+1 em ${formatDuration(toNext)} · cheia em ${formatDuration(toFull)}`;
}
