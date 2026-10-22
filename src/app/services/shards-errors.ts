import { HttpErrorResponse } from '@angular/common/http';
import { ShardsError } from '../models/shards.model';

/** Mapa único `code` → texto amigável (contrato, seção 5). */
const MESSAGES: Record<string, string> = {
  PlayerNotFound: 'Jogador não encontrado.',
  MineNotFound: 'Você ainda não tem esta mina.',
  NotEnoughEnergy: 'Energia insuficiente.',
  CartEmpty: 'O vagonete está vazio.',
  NoSkillPoints: 'Sem pontos de habilidade.',
  SkillMaxLevel: 'A habilidade já está no máximo.',
  InvalidSkill: 'Habilidade inválida.',
  NotEnoughResources: 'Recursos insuficientes.',
  NoMoreMines: 'Não há mais minas disponíveis.',
  MineSlotsFull: 'Sem espaço para uma nova mina. Use um ponto de habilidade em Minas.',
  CartUpgradeLocked: 'Use um ponto de habilidade em Vagonete para liberar este nível.',
  CartMaxLevel: 'Vagonete no nível máximo.',
  MissionNotCompleted: 'A missão ainda não foi concluída.',
  MissionNotFound: 'Missão não encontrada.',
  MissionAlreadyClaimed: 'Recompensa já resgatada.',
  InvalidTimes: 'Quantidade inválida (1 a 100).',
  InvalidProduction: 'Tipo de produção inválido.',
  SameProduction: 'A mina já produz este minério.',
  InvalidGem: 'Gema inválida.',
  InvalidStage: 'Etapa de lapidação inválida.',
  WorkshopLocked: 'Libere esta lapidação com a habilidade Oficina.',
  DailyNotFound: 'Esta missão do dia não está mais disponível.',
  DailyNotCompleted: 'A missão do dia ainda não foi concluída.',
  DailyAlreadyClaimed: 'Recompensa do dia já resgatada.',
  ChestNotReady: 'Resgate todas as missões do dia para abrir o baú.',
  ChestAlreadyClaimed: 'O baú de hoje já foi resgatado.',
  ConcurrencyConflict: 'Tente novamente.',
};

export interface DescribedError {
  status: number;
  code: string | null;
  message: string;
}

const isShardsError = (body: unknown): body is ShardsError =>
  typeof body === 'object' && body !== null && typeof (body as ShardsError).code === 'string';

export function describeError(err: unknown): DescribedError {
  if (!(err instanceof HttpErrorResponse)) {
    return { status: 0, code: null, message: 'Erro inesperado. Tente novamente.' };
  }
  const { status } = err;
  if (status === 0) return { status, code: null, message: 'Sem conexão com o servidor.' };
  if (status === 401) return { status, code: null, message: 'Sessão expirada. Entre novamente.' };
  if (status === 429) return { status, code: null, message: 'Muitas ações em pouco tempo. Aguarde um instante.' };

  if (isShardsError(err.error)) {
    const { code, message } = err.error;
    return { status, code, message: MESSAGES[code] ?? message ?? 'Não foi possível concluir a ação.' };
  }
  // 400 sem `code` é do ASP.NET (JSON malformado): pedido inválido.
  if (status === 400) return { status, code: null, message: 'Pedido inválido.' };
  return { status, code: null, message: 'Erro inesperado. Tente novamente.' };
}
