import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ClaimMissionResult, CollectCartResult, CraftResult, GemType, InventoryItem, ItemStage, WorkshopRecipe, DistributeSkillResult, MineCartUpgrade, MineState, Mission, MissionType, NextMine,
  MineSlots, OreAmount, OreType, Player, ProductionOption, SetProductionResult, ShardsState, Skill, SkillType, UnlockMineResult, UpgradeCartResult,
} from '../models/shards.model';
import { ShardsApi } from './shards-api';
import { oreLabel } from '../shared/ore-info';
import { describeError } from './shards-errors';

/** Única constante do front: limite de `times` por requisição (contrato, seção 8). */
export const MAX_TIMES = 100;

/** Pausa entre as requisições de mineração por clique: ~20 a cada 10 s, abaixo do limite de 30. */
const MINE_FLUSH_MS = 500;
const RETRY_429_MS = 2500;

export interface MineView extends MineState {
  /** Instante (relógio do servidor, ms) em que `cartAmount` valia. */
  asOfMs: number;
}

export type GameTab = 'mines' | 'workshop' | 'progress';

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
  readonly nextMine = signal<NextMine | null>(null);
  readonly productions = signal<ProductionOption[]>([]);
  readonly mineSlots = signal<MineSlots | null>(null);
  readonly cartUpgrades = signal<MineCartUpgrade[]>([]);
  readonly workshop = signal<WorkshopRecipe[]>([]);
  /** Inventário completo (todos os estágios); só muda com o craft, então vem de `GET /inventory`. */
  readonly fullInventory = signal<InventoryItem[]>([]);

  // ---- Navegação ----
  readonly tab = signal<GameTab>('mines');
  /** Pontos de habilidade para gastar ou missões para resgatar. */
  readonly progressBadge = computed(
    () => (this.player()?.skillPoints ?? 0) + this.missions().filter((m) => m.status === 'Completed').length,
  );

  /** Há uma lapidação em andamento (bloqueia só os botões da Oficina; as ações já são serializadas pela fila). */
  readonly crafting = signal(false);

  // ---- Feedback ----
  readonly notice = signal<Notice | null>(null);
  readonly lastMine = signal<MineSummary | null>(null);
  private readonly queued = signal(0);

  // ---- Mineração em lote ----
  private readonly pending = signal<Record<number, number>>({});
  private readonly inFlight = signal(0);
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- Controle interno ----
  private chain: Promise<unknown> = Promise.resolve();
  private seq = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private onVisibility = () => {
    if (document.visibilityState === 'visible') void this.load();
  };

  /** Há ação na fila, minerações aguardando envio ou requisição em andamento. */
  readonly busy = computed(() => this.queued() > 0 || this.inFlight() > 0 || Object.keys(this.pending()).length > 0);

  // ---- Derivados ao vivo ----
  readonly energyLive = computed<EnergyLive | null>(() => {
    const p = this.player();
    if (!p) return null;
    if (!p.nextEnergyAtUtc) return { energy: p.energy, nextAtMs: null };

    const next = Date.parse(p.nextEnergyAtUtc);
    const now = this.nowMs();
    if (now < next) return { energy: p.energy, nextAtMs: next };

    const stepMs = p.secondsPerEnergy * 1000;
    const gained = 1 + Math.floor((now - next) / stepMs);
    const energy = Math.min(p.maxEnergy, p.energy + gained);
    return { energy, nextAtMs: energy >= p.maxEnergy ? null : next + gained * stepMs };
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

  /** Minério estimado no vagonete agora (o servidor arredonda para baixo: mostre "≈"). */
  cartNow(mine: MineView): number {
    const grown = ((this.nowMs() - mine.asOfMs) / 60000) * mine.oresPerMinute;
    return Math.min(mine.cartCapacity, Math.max(0, Math.floor(mine.cartAmount + grown)));
  }

  // ---- Ciclo de vida ----
  start(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.tick.set(Date.now()), 1000);
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.load();
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
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
    const accepted = Math.min(times, this.availableEnergy());
    if (accepted <= 0) {
      this.notify('error', 'Energia insuficiente.');
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

    const summary: MineSummary = { id: ++this.seq, drops: [], doubleDrops: 0, xpGained: 0, levelUp: false, times: 0 };
    let failure: unknown = null;

    outer: for (const key of Object.keys(rest)) {
      const mineNumber = Number(key);
      while (rest[mineNumber] > 0) {
        const times = Math.min(rest[mineNumber], MAX_TIMES);
        try {
          const res = await this.withRetry(() => firstValueFrom(this.api.mine(mineNumber, times)));
          this.player.set(res.player);
          this.addToInventory(res.drops);
          this.mergeMissions(res.missions);
          summary.drops = sumOres(summary.drops, res.drops);
          summary.doubleDrops += res.doubleDrops;
          summary.xpGained += res.xpGained;
          summary.levelUp ||= res.levelUp;
          summary.times += times;
          rest[mineNumber] -= times;
          this.inFlight.update((n) => n - times);
        } catch (e) {
          failure = e;
          break outer;
        }
      }
    }

    this.inFlight.set(0);
    if (summary.times > 0) this.lastMine.set(summary);
    if (summary.levelUp) this.notify('success', 'Você subiu de nível!');
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
      await this.fetchState();
      this.notify('success', `Vagonete coletado: ${formatOres(res.collected)}.`);
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
      await this.fetchState();
      this.notify('success', `Vagonete da Mina ${mineNumber} ampliado para ${res.mine.cartCapacity}.`);
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
      await this.fetchState();
      this.notify('success', `Lapidado: ${res.crafted.quantity}× ${oreLabel(gem)} ${stageLabel(stage).toLowerCase()}.`);
      return res;
    }).finally(() => this.crafting.set(false));
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
    this.nextMine.set(s.nextMine);
    this.productions.set(s.productions);
    this.mineSlots.set(s.mineSlots ?? null);
    this.cartUpgrades.set(s.cartUpgrades ?? []);
    this.workshop.set(s.workshop ?? []);
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

  private addToInventory(drops: OreAmount[]): void {
    this.inventory.update((inv) => sumOres(inv, drops));
  }

  /** Mescla por `type`: troca a existente, remove `Claimed`, adiciona a nova (contrato, seção 4). */
  private mergeMissions(changed: Mission[]): void {
    if (changed.length === 0) return;
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
  }

  private fail(err: unknown): void {
    this.notify('error', describeError(err).message);
  }

  notify(kind: Notice['kind'], text: string): void {
    this.notice.set({ id: ++this.seq, kind, text });
  }
}

export const stageLabel = (s: ItemStage): string => ({ Raw: 'Bruto', Polished: 'Polido', Faceted: 'Facetado' })[s];

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
