import { HttpErrorResponse } from '@angular/common/http';
import { SHARDS_ERROR_CODES } from '../models/shards.model';
import { describeError, messageForCode } from './shards-errors';

describe('shards-errors', () => {
  it('todo código do contrato tem texto amigável (e em português do jogo, não o código cru)', () => {
    for (const code of SHARDS_ERROR_CODES) {
      const text = messageForCode(code);
      expect(text).withContext(code).not.toBe('Não foi possível concluir a ação.');
      expect(text).withContext(code).not.toBe(code);
    }
  });

  it('código desconhecido usa a mensagem do servidor', () => {
    expect(messageForCode('AlgoNovo', 'Mensagem do servidor.')).toBe('Mensagem do servidor.');
    expect(messageForCode('AlgoNovo')).toBe('Não foi possível concluir a ação.');
  });

  it('traduz o corpo { code, message } de um 400', () => {
    const err = new HttpErrorResponse({ status: 400, error: { code: 'NotEnoughExploreEnergy', message: 'x' } });
    expect(describeError(err)).toEqual({ status: 400, code: 'NotEnoughExploreEnergy', message: messageForCode('NotEnoughExploreEnergy') });
  });

  it('429 e 409 mantêm o status para a store decidir', () => {
    expect(describeError(new HttpErrorResponse({ status: 429 })).status).toBe(429);
    expect(describeError(new HttpErrorResponse({ status: 409, error: { code: 'ConcurrencyConflict', message: '' } })).status).toBe(409);
  });
});
