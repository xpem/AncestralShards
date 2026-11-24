import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AttackRequest, AttackResult, ClaimMissionResult, CollectCartResult, Combat, CraftedStage, CraftResult, DailyClaimResult, DailyMission, DailyMissionType, DailyState,
  DepositsState, Element, GemType, InventoryItem, ItemStage, WorkshopRecipe, DistributeSkillResult, MineCartUpgrade, MineDepositResult, MineState, Mission, MissionType,
  NextMine, MineSlots, OreAmount, OreInfo, OreType, Player, ProductionOption, RotateDepositResult, SetProductionResult, ShardsState, Skill, SkillType, UnlockMineResult,
  UpgradeCartResult,
} from '../models/shards.model';
import { ShardsApi } from './shards-api';
import { oreLabel, stageLabel } from '../shared/ore-info';
export { stageLabel };
import { describeError, messageForCode } from './shards-errors';

/** Única constante do front: limite de `times` por requisição (contrato, seção 8). */
export const MAX_TIMES = 100;

/** Pausa entre as requisições de mineração por clique: ~20 a cada 10 s, abaixo do limite de 30. */
const MINE_FLUSH_MS = 500;
const RETRY_429_MS = 2500;

export interface MineView extends MineState {
  /** Instante (relógio do servidor, ms) em que `cartAmount` valia. */
  asOfMs: number;
}

export type GameTab = 'mines' | 'deposits' | 'workshop' | 'progress';

export interface Notice {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

/** Resumo do último lote de mineração, para a tela mostrar o que acabou de acontecer. */
export interface MineSummary {
  id: number;
  drops: OreAmount[];
  doubleDrops: number;
  xpGained: number;
  levelUp: boolean;
  times: number;
  /** Os `drops` foram para o vagonete (a coleta os passa ao inventário). */
  toCart: boolean;
}

export interface EnergyLive {
  energy: number;
  /** Quando chega o próximo ponto (ms, relógio do servidor); `null` com a energia cheia. */
  nextAtMs: number | null;
}

@Injectable({ providedIn: 'root' })
export class GameStore {
  private api = inject(ShardsApi);

  // ---- Relógio ----
  private readonly tick = signal(Date.now());
  private readonly offsetMs = signal(0);
  /** Agora, no relógio do servidor (corrige um relógio de dispositivo errado). */
  readonly nowMs = computed(() => this.tick() + this.offsetMs());

  // ---- Estado vindo da API ----
  readonly loaded = signal(false);
  readonly player = signal<Player | null>(null);
  readonly skills = signal<Skill[]>([]);
  readonly inventory = signal<OreAmount[]>([]);
  readonly mines = signal<MineView[]>([]);
  readonly missions = signal<Mission[]>([]);
  /** Missões do dia; `null` até resgatar a Missão 1. */
  readonly daily = signal<DailyState | null>(null);
  readonly nextMine = signal<NextMine | null>(null);
  readonly productions = signal<ProductionOption[]>([]);
  readonly mineSlots = signal<MineSlots | null>(null);
  readonly cartUpgrades = signal<MineCartUpgrade[]>([]);
  readonly workshop = signal<WorkshopRecipe[]>([]);
  /** Catálogo de minérios (elemento, ataque e defesa por estágio). Vem do servidor. */
  readonly ores = signal<OreInfo[]>([]);
  readonly combat = signal<Combat | null>(null);
  /** Depósitos da semana; `null` enquanto a skill Workshop está no nível 0 (esconde a seção inteira). */
  readonly deposits = signal<DepositsState | null>(null);
  /** Inventário completo (todos os estágios); só muda com o craft, então vem de `GET /inventory`. */
  readonly fullInventory = signal<InventoryItem[]>([]);

  // ---- Navegação ----
  readonly tab = signal<GameTab>('mines');

  /** Abre a aba de progresso e rola até as habilidades (o bloco só existe nessa aba). */
  goToSkills(): void {
    this.tab.set('progress');
    setTimeout(() => document.getElementById('habilidades')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  /** Pontos de habilidade, missões e diárias para resgatar e o baú do dia pronto. */
  readonly progressBadge = computed(() => {
    const d = this.daily();
    return (
      (this.player()?.skillPoints ?? 0) +
      this.missions().filter((m) => m.status === 'Completed').length +
      (d ? d.missions.filter((m) => m.status === 'Completed').length + (d.chest.canClaim ? 1 : 0) : 0)
    );
  });

  /** Depósitos abertos com a defesa derrubada e estoque: prontos para extrair. */
  readonly depositsBadge = computed(() => this.deposits()?.items.filter((d) => d.canMine).length ?? 0);

  /** Há uma lapidação em andamento (bloqueia só os botões da Oficina; as ações já são serializadas pela fila). */
  readonly crafting = signal(false);

  // ---- Feedback ----
  readonly notice = signal<Notice | null>(null);
  readonly lastMine = signal<MineSummary | null>(null);
  private readonly queued = signal(0);

  // ---- Mineração em lote ----
  private readonly pending = signal<Record<number, number>>({});
  private readonly inFlight = signal(0);
  /** Minerações em voo por mina (o vagonete só reflete o resultado quando a resposta chega). */
  private readonly flying = signal<Record<number, number>>({});
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- Controle interno ----
  private chain: Promise<unknown> = Promise.resolve();
  private seq = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  /** Dia das diárias e semana dos depósitos já recarregados na virada (evita repetir o `load()` a cada segundo). */
  private rolloverDay: string | null = null;
  private rolloverWeek: string | null = null;
  private onVisibility = () => {
    if (document.visibilityState === 'visible') void this.load();
  };

  /** Há ação na fila, minerações aguardando envio ou requisição em andamento. */
  readonly busy = computed(() => this.queued() > 0 || this.inFlight() > 0 || Object.keys(this.pending()).length > 0);

  // ---- Derivados ao vivo ----
  readonly energyLive = computed<EnergyLive | null>(() => {
    const p = this.player();
    return p ? regenerate(p.energy, p.maxEnergy, p.secondsPerEnergy, p.nextEnergyAtUtc, this.nowMs()) : null;
  });

  /** Energia de exploração ao vivo (mesma regra da energia normal). */
  readonly exploreLive = computed<EnergyLive | null>(() => {
    const p = this.player();
    return p ? regenerate(p.exploreEnergy, p.exploreMaxEnergy, p.exploreSecondsPerEnergy, p.nextExploreEnergyAtUtc, this.nowMs()) : null;
  });

  /** Energia livre para novas minerações (desconta o que já está na fila ou em voo). */
  readonly availableEnergy = computed(() => {
    const live = this.energyLive();
    if (!live) return 0;
    const queued = Object.values(this.pending()).reduce((a, b) => a + b, 0);
    return Math.max(0, live.energy - queued - this.inFlight());
  });

  readonly inventoryMap = computed(() => {
    const map = new Map<OreType, number>();
    for (const item of this.inventory()) map.set(item.oreType, item.quantity);
    return map;
  });

  quantityOf(ore: OreType): number {
    return this.inventoryMap().get(ore) ?? 0;
  }

  readonly oreMap = computed(() => new Map(this.ores().map((o) => [o.oreType, o] as const)));

  /** A skill pelo tipo (`undefined` se o servidor ainda não a lista). */
  skill(type: SkillType): Skill | undefined {
    return this.skills().find((s) => s.type === type);
  }

  /** Quantas gemas de um estágio o jogador tem (inventário completo, por estágio). */
  gemQuantity(ore: OreType, stage: ItemStage): number {
    return this.fullInventory().find((i) => i.oreType === ore && i.stage === stage)?.quantity ?? 0;
  }

  /** Multiplicador do ataque do elemento `attacker` contra a defesa do `defender` (par ausente vale 1). Só informativo: o servidor calcula o dano. */
  elementMultiplier(attacker: Element, defender: Element): number {
    return this.combat()?.effectiveness.find((e) => e.attacker === attacker && e.defender === defender)?.multiplier ?? 1;
  }

  /** Minério estimado no vagonete agora (o servidor arredonda para baixo: mostre "≈"). */
  cartNow(mine: MineView): number {
    const grown = ((this.nowMs() - mine.asOfMs) / 60000) * mine.oresPerMinute;
    // O drop em dobro pode passar da capacidade; nunca esconda o que o servidor já informou.
    const ceiling = Math.max(mine.cartCapacity, mine.cartAmount);
    return Math.min(ceiling, Math.max(0, Math.floor(mine.cartAmount + grown)));
  }

  /** Quantas minerações ainda cabem no vagonete (desconta as que já estão na fila ou em voo para esta mina). */
  cartSpace(mine: MineView): number {
    const reserved = (this.pending()[mine.mineNumber] ?? 0) + (this.flying()[mine.mineNumber] ?? 0);
    return Math.max(0, mine.cartCapacity - this.cartNow(mine) - reserved);
  }

  // ---- Ciclo de vida ----
  start(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      this.tick.set(Date.now());
      this.checkRollovers();
    }, 1000);
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.load();
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** Na virada do dia (diárias) ou da semana (ofertas de depósito) o servidor só cria o novo no `GET /state`: reconsulta uma vez. */
  private checkRollovers(): void {
    const now = this.nowMs();
    const d = this.daily();
    const w = this.deposits();
    const dayDue = !!d && this.rolloverDay !== d.day && now >= Date.parse(d.resetsAtUtc);
    const weekDue = !!w && this.rolloverWeek !== w.weekStart && now >= Date.parse(w.resetsAtUtc);
    if (dayDue) this.rolloverDay = d.day;
    if (weekDue) this.rolloverWeek = w.weekStart;
    if (dayDue || weekDue) void this.load();
  }

  /** Recarrega o `GET /Shards/state` (na fila, para não correr com ações em andamento). */
  load(): Promise<void> {
    return this.enqueue(async () => {
      try {
        await this.fetchState();
      } catch (e) {
        this.fail(e);
      }
    });
  }

  // ---- Mineração ----

  /** Pede `times` minerações. Os cliques se juntam e saem num único POST. Devolve quantas foram aceitas. */
  mine(mineNumber: number, times = 1): number {
    const mine = this.mines().find((m) => m.mineNumber === mineNumber);
    if (!mine) return 0;
    // O que se minera vai para o vagonete: só cabe o que tem espaço (coletar libera).
    const space = this.cartSpace(mine);
    const accepted = Math.min(times, this.availableEnergy(), space);
    if (accepted <= 0) {
      this.notify('error', space <= 0 ? messageForCode('CartFull') : 'Energia insuficiente.');
      return 0;
    }
    this.pending.update((p) => ({ ...p, [mineNumber]: (p[mineNumber] ?? 0) + accepted }));
    // Lote grande sai já; clique avulso espera um instante para se juntar aos próximos.
    this.scheduleFlush(times > 1 ? 0 : MINE_FLUSH_MS);
    return accepted;
  }

  private scheduleFlush(delay: number): void {
    if (this.flushTimer) {
      if (delay > 0) return;
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.enqueue(() => this.flushPending());
    }, delay);
  }

  private async flushPending(): Promise<void> {
    const rest = { ...this.pending() };
    const total = Object.values(rest).reduce((a, b) => a + b, 0);
    if (total === 0) return;
    this.pending.set({});
    this.inFlight.set(total);
    this.flying.set(rest);

    const summary: MineSummary = { id: ++this.seq, drops: [], doubleDrops: 0, xpGained: 0, levelUp: false, times: 0, toCart: false };
    let failure: unknown = null;
    let completed: string | null = null;

    outer: for (const key of Object.keys(rest)) {
      const mineNumber = Number(key);
      while (rest[mineNumber] > 0) {
        const times = Math.min(rest[mineNumber], MAX_TIMES);
        try {
          const res = await this.withRetry(() => firstValueFrom(this.api.mine(mineNumber, times)));
          this.player.set(res.player);
          if (res.cart) {
            // Os minérios foram para o vagonete; o inventário só muda na coleta.
            this.applyCart(res.cart);
            summary.toCart = true;
          } else {
            this.addToInventory(res.drops);
          }
          completed = this.mergeBoth(res.missions, res.dailyMissions) ?? completed;
          summary.drops = sumOres(summary.drops, res.drops);
          summary.doubleDrops += res.doubleDrops;
          summary.xpGained += res.xpGained;
          summary.levelUp ||= res.levelUp;
          summary.times += times;
          rest[mineNumber] -= times;
          this.flying.update((f) => ({ ...f, [mineNumber]: rest[mineNumber] }));
          this.inFlight.update((n) => n - times);
        } catch (e) {
          failure = e;
          break outer;
        }
      }
    }

    this.inFlight.set(0);
    this.flying.set({});
    if (summary.times > 0) this.lastMine.set(summary);
    if (summary.levelUp) this.notify('success', 'Você subiu de nível!');
    this.announceCompleted(completed);
    if (!failure) return;

    this.fail(failure);
    if (describeError(failure).status === 429) {
      // Limite de requisições: devolve o que faltou à fila e tenta de novo daqui a pouco.
      this.pending.update((p) => {
        const next = { ...p };
        for (const [k, n] of Object.entries(rest)) if (n > 0) next[Number(k)] = (next[Number(k)] ?? 0) + n;
        return next;
      });
      this.scheduleFlush(RETRY_429_MS);
    } else {
      await this.safeFetch();
    }
  }

  // ---- Demais ações: aplica o que veio e refaz o state ----

  collectCart(mineNumber: number): Promise<CollectCartResult | null> {
    return this.act(async () => {
      const res = await this.withRetry(() => firstValueFrom(this.api.collectCart(mineNumber)));
      this.inventory.set(res.inventory);
      const completed = this.mergeBoth(res.missions, res.dailyMissions);
      await this.fetchState();
      this.notify('success', `Vagonete coletado: ${formatOres(res.collected)}.`);
      this.announceCompleted(completed);
      return res;
    });
  }

  setProduction(mineNumber: number, focus: OreType): Promise<SetProductionResult | null> {
    return this.act(async () => {
      const res = await this.withRetry(() => firstValueFrom(this.api.setProduction(mineNumber, focus)));
      this.inventory.set(res.inventory);
      this.mergeMissions(res.missions);
      await this.fetchState();
      this.notify('success', `Mina ${mineNumber} agora produz ${oreLabel(focus)}.`);
      return res;
    });
  }

  upgradeCart(mineNumber: number): Promise<UpgradeCartResult | null> {
    return this.act(async () => {
      const res = await this.withRetry(() => firstValueFrom(this.api.upgradeCart(mineNumber)));
      this.inventory.set(res.inventory);
      const completed = this.mergeMissions(res.missions);
      await this.fetchState();
      this.notify('success', `Vagonete da Mina ${mineNumber} ampliado para ${res.mine.cartCapacity}.`);
      this.announceCompleted(completed);
      return res;
    });
  }

  unlockMine(): Promise<UnlockMineResult | null> {
    return this.act(async () => {
      const res = await this.withRetry(() => firstValueFrom(this.api.unlockMine()));
      this.inventory.set(res.inventory);
      this.mergeMissions(res.missions);
      await this.fetchState();
      this.notify('success', `Mina ${res.mine.mineNumber} desbloqueada!`);
      return res;
    });
  }

  distributeSkill(skillType: SkillType): Promise<DistributeSkillResult | null> {
    return this.act(async () => {
      const res = await this.withRetry(() => firstValueFrom(this.api.distributeSkill(skillType)));
      this.skills.set(res.skills);
      this.player.update((p) => (p ? { ...p, skillPoints: res.skillPoints } : p));
      this.mergeMissions(res.missions);
      await this.fetchState();
      return res;
    });
  }

  loadFullInventory(): Promise<void> {
    return this.enqueue(async () => {
      try {
        this.fullInventory.set((await firstValueFrom(this.api.inventory())).items);
      } catch (e) {
        this.fail(e);
      }
    });
  }

  craft(gem: GemType, stage: Exclude<ItemStage, 'Raw'>, times: number): Promise<CraftResult | null> {
    this.crafting.set(true);
    return this.act(async () => {
      const res = await this.withRetry(() => firstValueFrom(this.api.craft({ gem, stage, times })));
      this.fullInventory.set(res.inventory.items);
      const completed = this.mergeBoth(res.missions, res.dailyMissions);
      await this.fetchState();
      this.notify('success', `Lapidado: ${res.crafted.quantity}× ${oreLabel(gem)} ${stageLabel(stage).toLowerCase()}.`);
      this.announceCompleted(completed);
      return res;
    }).finally(() => this.crafting.set(false));
  }

  // ---- Depósitos: aplica a resposta e refaz o state (workshop e `canAfford` dependem do inventário) ----

  rotateDeposit(id: number): Promise<RotateDepositResult | null> {
    return this.act(async () => {
      const res = await this.withRetry(() => firstValueFrom(this.api.rotateDeposit(id)));
      this.inventory.set(res.inventory);
      this.applyRawToFullInventory(res.inventory);
      this.deposits.set(res.deposits);
      await this.fetchState();
      this.notify('success', res.spent ? `Oferta trocada por ${formatOres([res.spent])}.` : 'Oferta trocada (grátis).');
      return res;
    });
  }

  attackDeposit(id: number, body: AttackRequest): Promise<AttackResult | null> {
    return this.act(async () => {
      const res = await this.withRetry(() => firstValueFrom(this.api.attackDeposit(id, { ...body, preview: false })));
      this.player.set(res.player);
      this.fullInventory.set(res.inventory.items);
      this.inventory.set(res.inventory.items.filter((i) => i.stage === 'Raw').map((i) => ({ oreType: i.oreType, quantity: i.quantity })));
      this.deposits.set(res.deposits);
      const completed = this.mergeMissions(res.missions);
      await this.fetchState();
      const cost = res.energyCost > 0 ? ` O contra-ataque custou ${res.energyCost} de energia de exploração.` : '';
      this.notify('success', (res.broken ? 'Defesa derrubada! Pronto para extrair.' : `Ataque causou ${res.damageDealt} de dano.`) + cost);
      this.announceCompleted(completed);
      return res;
    });
  }

  /** Prévia do ataque: não grava nada, então fica fora da fila de ações (quem chama descarta respostas velhas). */
  previewAttack(id: number, body: AttackRequest): Promise<AttackResult> {
    return firstValueFrom(this.api.attackDeposit(id, { ...body, preview: true }));
  }

  mineDeposit(id: number, times: number): Promise<MineDepositResult | null> {
    return this.act(async () => {
      const res = await this.withRetry(() => firstValueFrom(this.api.mineDeposit(id, times)));
      this.player.set(res.player);
      this.inventory.set(res.inventory);
      this.applyRawToFullInventory(res.inventory);
      this.deposits.set(res.deposits);
      const completed = this.mergeMissions(res.missions);
      await this.fetchState();
      const parts = [`Extraído: ${formatOres(res.drops)} (+${res.xpGained} XP).`];
      if (res.depleted) parts.push('Depósito esgotado.');
      if (res.levelUp) parts.push('Você subiu de nível!');
      this.notify('success', parts.join(' '));
      this.announceCompleted(completed);
      return res;
    });
  }

  claimMission(missionType: MissionType): Promise<ClaimMissionResult | null> {
    return this.act(async () => {
      const res = await this.withRetry(() => firstValueFrom(this.api.claimMission(missionType)));
      this.player.set(res.player);
      this.inventory.set(res.inventory);
      this.mergeMissions(res.missions);
      await this.fetchState();
      this.notify('success', res.levelUp ? 'Recompensa resgatada. Você subiu de nível!' : 'Recompensa resgatada.');
      return res;
    });
  }

  claimDaily(type: DailyMissionType): Promise<DailyClaimResult | null> {
    return this.claimDailyWith(
      () => firstValueFrom(this.api.claimDaily(type)),
      'Recompensa do dia resgatada.',
      'Recompensa do dia resgatada. Você subiu de nível!',
    );
  }

  claimDailyChest(): Promise<DailyClaimResult | null> {
    return this.claimDailyWith(
      () => firstValueFrom(this.api.claimDailyChest()),
      'Baú do dia aberto.',
      'Baú do dia aberto. Você subiu de nível!',
    );
  }

  private claimDailyWith(call: () => Promise<DailyClaimResult>, ok: string, okLevelUp: string): Promise<DailyClaimResult | null> {
    return this.act(async () => {
      const streakBefore = this.daily()?.streak.days ?? 0;
      // Em erro (inclusive `DailyNotFound` com o dia virado) o `act` já refaz o state.
      const res = await this.withRetry(call);
      this.player.set(res.player);
      this.inventory.set(res.inventory);
      this.daily.set(res.daily);
      this.notify('success', res.levelUp ? okLevelUp : ok);
      if (res.daily.streak.days > streakBefore) this.notify('success', `Sequência de ${res.daily.streak.days} dias!`);
      return res;
    });
  }

  // ---- Internos ----

  private async fetchState(): Promise<void> {
    const received = Date.now();
    const s: ShardsState = await firstValueFrom(this.api.state());
    this.offsetMs.set(Date.parse(s.serverTimeUtc) - received);
    this.tick.set(received);
    const asOfMs = Date.parse(s.serverTimeUtc);

    this.player.set(s.player);
    this.skills.set(s.skills);
    this.inventory.set(s.inventory);
    this.mines.set(s.mines.map((m) => ({ ...m, asOfMs })));
    this.missions.set(s.missions);
    this.daily.set(s.daily ?? null);
    this.nextMine.set(s.nextMine);
    this.productions.set(s.productions);
    this.mineSlots.set(s.mineSlots ?? null);
    this.cartUpgrades.set(s.cartUpgrades ?? []);
    this.workshop.set(s.workshop ?? []);
    this.ores.set(s.ores ?? []);
    this.combat.set(s.combat ?? null);
    this.deposits.set(s.deposits ?? null);
    if (!s.deposits && this.tab() === 'deposits') this.tab.set('mines');
    this.loaded.set(true);
  }

  private async safeFetch(): Promise<void> {
    try {
      await this.fetchState();
    } catch (e) {
      this.fail(e);
    }
  }

  /** Executa uma ação na fila. Em erro, avisa, refaz o state e devolve `null`. */
  private act<T>(fn: () => Promise<T>): Promise<T | null> {
    return this.enqueue(async () => {
      try {
        return await fn();
      } catch (e) {
        this.fail(e);
        await this.safeFetch();
        return null;
      }
    });
  }

  /** Um `409 ConcurrencyConflict` repete a ação uma vez (contrato, seção 5). */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (describeError(e).status === 409) return await fn();
      throw e;
    }
  }

  /** Ações em série: a resposta de uma nunca é atropelada pelo `state` de outra. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    this.queued.update((n) => n + 1);
    const run = this.chain.then(fn);
    this.chain = run.catch(() => undefined).finally(() => this.queued.update((n) => n - 1));
    return run;
  }

  /** Trocar e extrair devolvem só o minério bruto: atualiza as linhas `Raw` do inventário completo e mantém os estágios lapidados. */
  private applyRawToFullInventory(raw: OreAmount[]): void {
    const order = this.ores().map((o) => o.oreType);
    const rank = (o: OreType) => (order.includes(o) ? order.indexOf(o) : order.length);
    const stages: ItemStage[] = ['Raw', 'Polished', 'Faceted'];
    const rawItems: InventoryItem[] = raw.filter((r) => r.quantity > 0).map((r) => ({ oreType: r.oreType, stage: 'Raw', quantity: r.quantity }));
    this.fullInventory.update((items) =>
      [...items.filter((i) => i.stage !== 'Raw'), ...rawItems].sort((a, b) => rank(a.oreType) - rank(b.oreType) || stages.indexOf(a.stage) - stages.indexOf(b.stage)),
    );
  }

  /** Troca o vagonete da mina pelo que o servidor devolveu (`cartAmount` vale agora). */
  private applyCart(cart: MineState): void {
    const asOfMs = this.nowMs();
    this.mines.update((list) => list.map((m) => (m.mineNumber === cart.mineNumber ? { ...cart, asOfMs } : m)));
  }

  private addToInventory(drops: OreAmount[]): void {
    this.inventory.update((inv) => sumOres(inv, drops));
  }

  /** Mescla por `type`: troca a existente, remove `Claimed`, adiciona a nova (contrato, seção 4). Devolve a última que passou a `Completed`. */
  mergeMissions(changed: Mission[] | undefined): string | null {
    if (!changed?.length) return null;
    const before = this.missions();
    this.missions.update((list) => {
      const next = [...list];
      for (const m of changed) {
        const i = next.findIndex((x) => x.type === m.type);
        if (m.status === 'Claimed') {
          if (i >= 0) next.splice(i, 1);
        } else if (i >= 0) next[i] = m;
        else next.push(m);
      }
      return next;
    });
    return newlyCompleted(before, changed);
  }

  /** Mescla as diárias por `type`. Diferente do tutorial, `Claimed` NÃO sai da lista até a virada do dia. */
  mergeDaily(changed: DailyMission[] | undefined): string | null {
    const d = this.daily();
    if (!d || !changed?.length) return null;
    const missions = [...d.missions];
    for (const m of changed) {
      const i = missions.findIndex((x) => x.type === m.type);
      if (i >= 0) missions[i] = m;
      else missions.push(m);
    }
    this.daily.set({ ...d, missions });
    return newlyCompleted(d.missions, changed);
  }

  private mergeBoth(missions: Mission[] | undefined, daily: DailyMission[] | undefined): string | null {
    const a = this.mergeMissions(missions);
    const b = this.mergeDaily(daily);
    return b ?? a;
  }

  /** O `notice` é um slot único: em lote, só a última conclusão aparece. */
  private announceCompleted(name: string | null): void {
    if (name) this.notify('info', `Missão concluída: ${name}`);
  }

  private fail(err: unknown): void {
    this.notify('error', describeError(err).message);
  }

  notify(kind: Notice['kind'], text: string): void {
    this.notice.set({ id: ++this.seq, kind, text });
  }
}

/** Nome da última missão de `changed` que estava ativa e passou a `Completed`. */
function newlyCompleted(before: { type: string; status: string }[], changed: { type: string; name: string; status: string }[]): string | null {
  let name: string | null = null;
  for (const m of changed) {
    if (m.status === 'Completed' && before.find((x) => x.type === m.type)?.status !== 'Completed') name = m.name;
  }
  return name;
}

/** Energia ao vivo a partir do último valor do servidor e de quando chega o próximo ponto. */
function regenerate(energy: number, max: number, secondsPer: number, nextAtUtc: string | null, nowMs: number): EnergyLive {
  if (!nextAtUtc) return { energy, nextAtMs: null };
  const next = Date.parse(nextAtUtc);
  if (nowMs < next) return { energy, nextAtMs: next };

  const stepMs = secondsPer * 1000;
  const gained = 1 + Math.floor((nowMs - next) / stepMs);
  const live = Math.min(max, energy + gained);
  return { energy: live, nextAtMs: live >= max ? null : next + gained * stepMs };
}

function sumOres(base: OreAmount[], extra: OreAmount[]): OreAmount[] {
  const out = base.map((o) => ({ ...o }));
  for (const e of extra) {
    const found = out.find((o) => o.oreType === e.oreType);
    if (found) found.quantity += e.quantity;
    else out.push({ ...e });
  }
  return out;
}

export function formatOres(list: OreAmount[]): string {
  return list.length ? list.map((o) => `${o.quantity} ${oreLabel(o.oreType)}`).join(', ') : 'nada';
}
