import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DailyMission, DailyState, Mission } from '../models/shards.model';
import { GameStore } from './game.store';

const reward = { xp: 1, ores: [] };
const mission = (type: Mission['type'], status: Mission['status']): Mission =>
  ({ type, name: type, description: '', status, progress: 0, goal: 1, reward });
const daily = (type: DailyMission['type'], status: DailyMission['status']): DailyMission =>
  ({ type, name: type, description: '', status, progress: 0, goal: 1, reward });

function dailyState(missions: DailyMission[], chestCanClaim = false): DailyState {
  return {
    day: '2026-10-21', resetsAtUtc: '2026-10-22T03:00:00Z', missions,
    chest: { claimed: false, canClaim: chestCanClaim, reward }, streak: { days: 0, cycleDays: 7 },
  };
}

describe('GameStore', () => {
  let store: GameStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
    store = TestBed.inject(GameStore);
  });

  it('mergeMissions remove as Claimed e avisa quando passa a Completed', () => {
    store.missions.set([mission('FirstPickaxe', 'Active'), mission('Specialization', 'Active')]);
    const name = store.mergeMissions([mission('FirstPickaxe', 'Completed')]);
    expect(name).toBe('FirstPickaxe');
    store.mergeMissions([mission('FirstPickaxe', 'Claimed'), mission('FirstGem', 'Active')]);
    expect(store.missions().map((m) => m.type)).toEqual(['Specialization', 'FirstGem']);
  });

  it('mergeDaily mantém as Claimed', () => {
    store.daily.set(dailyState([daily('Login', 'Completed'), daily('Energy', 'Active')]));
    store.mergeDaily([daily('Login', 'Claimed')]);
    expect(store.daily()!.missions.map((m) => m.status)).toEqual(['Claimed', 'Active']);
  });

  it('mergeDaily ignora quando não há diárias', () => {
    expect(store.mergeDaily([daily('Login', 'Completed')])).toBeNull();
    expect(store.daily()).toBeNull();
  });

  it('progressBadge soma diárias a resgatar e o baú pronto', () => {
    store.daily.set(dailyState([daily('Login', 'Completed'), daily('Energy', 'Active')], true));
    expect(store.progressBadge()).toBe(2);
  });
});
