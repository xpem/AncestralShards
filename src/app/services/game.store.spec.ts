import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AttackResult, Deposit, DepositsState, DailyMission, DailyState, Mission, Player } from '../models/shards.model';
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

  // ---- Depósitos / exploração ----

  const player = (over: Partial<Player> = {}): Player => ({
    level: 1, experience: 0, experienceToNextLevel: 10, skillPoints: 0,
    energy: 100, maxEnergy: 100, secondsPerEnergy: 216, nextEnergyAtUtc: null,
    exploreEnergy: 10, exploreMaxEnergy: 72, exploreSecondsPerEnergy: 1200, nextExploreEnergyAtUtc: null, ...over,
  });
  const deposit = (over: Partial<Deposit> = {}): Deposit => ({
    id: 1, slot: 1, oreType: 'Ruby', rarity: 1, tier: 'Light', element: 'Fire', defenseCurrent: 100, defenseMax: 100, stockRemaining: 50, stockMax: 50,
    status: 'Sealed', canRotate: true, canAttack: true, canMine: false, counterRatio: 0.05, expiresAtUtc: null, unitsPerEnergy: 4, xpPerEnergy: 1, ...over,
  });
  const block = (items: Deposit[], over: Partial<DepositsState> = {}): DepositsState => ({
    weekStart: '2026-11-09', resetsAtUtc: '2026-11-16T03:00:00Z', openCount: 0, maxOpen: 3, unlockedTier: 1, maxTier: 3,
    rerolls: { used: 0, freeLeft: 1, nextCost: null, canAfford: true }, items, ...over,
  });

  it('skill() acha a skill pelo tipo e traz o pré-requisito do servidor', () => {
    store.skills.set([
      { type: 'Workshop', level: 0, maxLevel: 2, nextRequirement: { minPlayerLevel: 10, requiresSkill: null, requiresSkillLevel: 0, met: true } },
      { type: 'Deposits', level: 0, maxLevel: 3, nextRequirement: { minPlayerLevel: 14, requiresSkill: 'Workshop', requiresSkillLevel: 1, met: false } },
    ]);
    expect(store.skill('Deposits')?.nextRequirement?.met).toBe(false);
    expect(store.skill('MineSlots')).toBeUndefined();
  });

  it('distributeSkill com SkillLocked avisa e refaz o state (o ponto não foi gasto)', async () => {
    const http = TestBed.inject(HttpTestingController);
    const done = store.distributeSkill('Deposits');
    await Promise.resolve();
    http.expectOne('/api/Shards/skills/distribute').flush({ code: 'SkillLocked', message: 'x' }, { status: 400, statusText: 'Bad Request' });
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/Shards/state').flush(stateStub());
    expect(await done).toBeNull();
    expect(store.notice()?.kind).toBe('error');
    expect(store.notice()?.text).toContain('não foi gasto');
  });

  it('exploreLive regenera como a energia normal e trava no máximo', () => {
    const now = Date.parse('2026-11-13T12:00:00Z');
    setNow(store, now);
    store.player.set(player({ exploreEnergy: 10, nextExploreEnergyAtUtc: '2026-11-13T12:00:00Z' }));
    expect(store.exploreLive()).toEqual({ energy: 11, nextAtMs: now + 1200_000 });

    setNow(store, now + 3 * 1200_000);
    expect(store.exploreLive()!.energy).toBe(14);

    setNow(store, now + 1000 * 1200_000);
    expect(store.exploreLive()).toEqual({ energy: 72, nextAtMs: null });
  });

  it('elementMultiplier lê a matriz do servidor e vale 1 para par ausente', () => {
    store.combat.set({ energyPerCounterPoint: 3, effectiveness: [{ attacker: 'Fire', defender: 'Wind', multiplier: 1.5 }] });
    expect(store.elementMultiplier('Fire', 'Wind')).toBe(1.5);
    expect(store.elementMultiplier('Wind', 'Fire')).toBe(1);
    expect(store.elementMultiplier('Fire', 'Fire')).toBe(1);
  });

  it('depositsBadge conta os prontos para extrair', () => {
    store.deposits.set(block([deposit({ id: 1, canMine: true }), deposit({ id: 2 })]));
    expect(store.depositsBadge()).toBe(1);
    store.deposits.set(null);
    expect(store.depositsBadge()).toBe(0);
  });

  it('ataque: aplica player, inventário por estágio (e o bruto derivado), depósitos e missões da resposta', async () => {
    const http = TestBed.inject(HttpTestingController);
    store.missions.set([mission('FirstAttack', 'Active')]);

    const done = store.attackDeposit(1, { attackers: [{ ore: 'Ruby', stage: 'Faceted', quantity: 4 }] });
    await Promise.resolve();
    const req = http.expectOne('/api/Shards/deposits/1/attack');
    expect(req.request.body.preview).toBe(false);
    const res: Partial<AttackResult> = {
      preview: false, canConfirm: true, blocker: null, broken: true, damageDealt: 100, energyCost: 0,
      inventory: { items: [{ oreType: 'Quartz', stage: 'Raw', quantity: 7 }, { oreType: 'Ruby', stage: 'Faceted', quantity: 6 }] },
      player: player({ exploreEnergy: 5 }),
      deposits: block([deposit({ status: 'Open', defenseCurrent: 0, canAttack: false, canMine: true })], { openCount: 1 }),
      deposit: deposit({ status: 'Open', defenseCurrent: 0 }),
      missions: [mission('FirstAttack', 'Completed')],
    };
    req.flush(res);
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/Shards/state').flush({ ...stateStub(player({ exploreEnergy: 5 })), deposits: res.deposits });
    await done;

    expect(store.inventory()).toEqual([{ oreType: 'Quartz', quantity: 7 }]);
    expect(store.fullInventory().length).toBe(2);
    expect(store.player()!.exploreEnergy).toBe(5);
    expect(store.deposits()!.openCount).toBe(1);
    expect(store.missions()[0].status).toBe('Completed');
    expect(store.depositsBadge()).toBe(1);
  });

  function stateStub(me: Player = player()) {
    return {
      serverTimeUtc: '2026-11-13T12:00:00Z', player: me, skills: [], inventory: [{ oreType: 'Quartz', quantity: 7 }], mines: [],
      missions: [mission('FirstAttack', 'Completed')], nextMine: null, productions: [], mineSlots: { used: 0, total: 1 }, cartUpgrades: [], workshop: [],
      ores: [], combat: { effectiveness: [], energyPerCounterPoint: 3 }, daily: null, deposits: null,
    };
  }

  it('extração: atualiza só as linhas Raw do inventário completo e mantém as lapidadas', async () => {
    const http = TestBed.inject(HttpTestingController);
    store.ores.set((['Quartz', 'Ruby', 'Sapphire', 'Emerald', 'Amethyst'] as const).map((oreType) => ({ oreType, kind: 'Gem', element: 'Wind', craftable: true, attack: [], defense: [] })));
    store.fullInventory.set([
      { oreType: 'Quartz', stage: 'Raw', quantity: 1 },
      { oreType: 'Ruby', stage: 'Faceted', quantity: 2 },
    ]);
    const done = store.mineDeposit(1, 10);
    await Promise.resolve();
    const req = http.expectOne('/api/Shards/deposits/1/mine');
    expect(req.request.body).toEqual({ times: 10 });   // `times` são PONTOS de energia de exploração
    req.flush({
      units: 10, drops: [{ oreType: 'Amethyst', quantity: 10 }], xpGained: 10, levelUp: false, energyCost: 10, depleted: false,
      deposit: deposit({ status: 'Open', defenseCurrent: 0, canMine: true }), inventory: [{ oreType: 'Quartz', quantity: 1 }, { oreType: 'Amethyst', quantity: 10 }],
      player: player(), deposits: block([]), missions: [],
    });
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/Shards/state').flush(stateStub());
    await done;

    expect(store.fullInventory().map((i) => `${i.oreType}:${i.stage}:${i.quantity}`)).toEqual(['Quartz:Raw:1', 'Ruby:Faceted:2', 'Amethyst:Raw:10']);
  });

  // ---- Mineração → vagonete ----

  const NOW = Date.parse('2026-11-13T12:00:00Z');
  const cartMine = (cartAmount: number) => ({
    mineNumber: 1, production: 'Quartz' as const, cartLevel: 0, cartCapacity: 100, cartAmount, cartFullAtUtc: null, oresPerMinute: 0, asOfMs: NOW,
  });
  const mineResponse = (cart?: ReturnType<typeof cartMine>) => ({
    drops: [{ oreType: 'Quartz', quantity: 10 }], doubleDrops: 0, xpGained: 10, levelUp: false, player: player({ energy: 90 }), missions: [], dailyMissions: [],
    ...(cart ? { cart: { ...cart, asOfMs: undefined } } : {}),
  });

  it('minerar só aceita o que cabe no vagonete e recusa com ele cheio', () => {
    setNow(store, NOW);
    store.player.set(player());
    store.mines.set([cartMine(95)]);
    expect(store.mine(1, 10)).toBe(5);
    expect(store.mine(1, 10)).toBe(0);
    expect(store.notice()?.text).toBe('O vagonete está cheio. Colete antes de minerar.');
  });

  it('com `cart` na resposta, os drops vão para o vagonete e não para o inventário', async () => {
    const http = TestBed.inject(HttpTestingController);
    setNow(store, NOW);
    store.player.set(player());
    store.inventory.set([{ oreType: 'Quartz', quantity: 7 }]);
    store.mines.set([cartMine(0)]);
    store.mine(1, 10);
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/Shards/mines/1/mine').flush(mineResponse(cartMine(10)));
    await new Promise((r) => setTimeout(r));

    expect(store.inventory()).toEqual([{ oreType: 'Quartz', quantity: 7 }]);
    expect(store.cartNow(store.mines()[0])).toBe(10);
    expect(store.lastMine()?.toCart).toBe(true);
  });

  it('servidor antigo (sem `cart`) continua somando ao inventário', async () => {
    const http = TestBed.inject(HttpTestingController);
    setNow(store, NOW);
    store.player.set(player());
    store.inventory.set([{ oreType: 'Quartz', quantity: 7 }]);
    store.mines.set([cartMine(0)]);
    store.mine(1, 10);
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/Shards/mines/1/mine').flush(mineResponse());
    await new Promise((r) => setTimeout(r));

    expect(store.inventory()).toEqual([{ oreType: 'Quartz', quantity: 17 }]);
    expect(store.lastMine()?.toCart).toBe(false);
  });

  it('na virada da semana reconsulta o state uma vez', async () => {
    const http = TestBed.inject(HttpTestingController);
    store.deposits.set(block([deposit()], { resetsAtUtc: '2026-11-16T03:00:00Z' }));
    setNow(store, Date.parse('2026-11-16T03:00:01Z'));
    (store as unknown as { checkRollovers(): void }).checkRollovers();
    (store as unknown as { checkRollovers(): void }).checkRollovers();
    await new Promise((r) => setTimeout(r));
    const calls = http.match('/api/Shards/state');
    expect(calls.length).toBe(1);
    calls[0].flush(stateStub());
    await new Promise((r) => setTimeout(r));
    expect(http.match('/api/Shards/state').length).toBe(0);
  });
});

/** Fixa o relógio da store (o `nowMs` soma o `tick` e o desvio do servidor). */
function setNow(store: GameStore, ms: number): void {
  const s = store as unknown as { tick: { set(v: number): void }; offsetMs: { set(v: number): void } };
  s.tick.set(ms);
  s.offsetMs.set(0);
}
