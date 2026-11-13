export type OreType = 'Quartz' | 'Ruby' | 'Sapphire' | 'Emerald' | 'Amethyst';
export type OreKind = 'Currency' | 'Gem' | 'Exclusive';
export type Element = 'Neutral' | 'Fire' | 'Water' | 'Wind';
export type SkillType = 'DoubleDrop' | 'MineSlots' | 'CartCapacity' | 'Workshop';
export type ItemStage = 'Raw' | 'Polished' | 'Faceted';
export type GemType = Exclude<OreType, 'Quartz'>;
/** Estágios que atacam, defendem e saem da oficina (bruto não conta). */
export type CraftedStage = Exclude<ItemStage, 'Raw'>;
export type MissionType =
  | 'FirstPickaxe' | 'Specialization' | 'OperationalExpansion' | 'FirstGem'
  | 'CartTraining' | 'CartUpgrade' | 'OpenWorkshop' | 'FirstPolish' | 'FirstFacet'
  | 'Diversification' | 'Collector' | 'PolishBatch' | 'FullSet' | 'FacetBatch'
  | 'ThirdMine' | 'FullCart' | 'DoubleLuck' | 'FirstAttack' | 'VaultOpened' | 'Extractor';
export type DailyMissionType = 'Login' | 'Energy' | 'Cart' | 'Quartz' | 'Gems' | 'Polish' | 'Facet';
export type MissionStatus = 'Active' | 'Completed' | 'Claimed';

export interface OreAmount { oreType: OreType; quantity: number; }
export interface Drop { oreType: OreType; chance: number; xp: number; }   // chance de 0 a 1

export interface Player {
  level: number; experience: number; experienceToNextLevel: number; skillPoints: number;
  energy: number; maxEnergy: number; secondsPerEnergy: number; nextEnergyAtUtc: string | null;
  /** Segunda barra: só o contra-ataque e a extração de depósitos a gastam. */
  exploreEnergy: number; exploreMaxEnergy: number; exploreSecondsPerEnergy: number; nextExploreEnergyAtUtc: string | null;
}
export interface Skill { type: SkillType; level: number; maxLevel: number; }
export interface MineState {
  mineNumber: number; production: OreType; cartLevel: number; cartCapacity: number; cartAmount: number;
  cartFullAtUtc: string | null; oresPerMinute: number;
}
export interface MissionReward { xp: number; ores: OreAmount[]; }
export interface Mission {
  type: MissionType; name: string; description: string; status: MissionStatus;
  progress: number; goal: number; reward: MissionReward;
}
export interface DailyMission {
  type: DailyMissionType; name: string; description: string; status: MissionStatus;
  progress: number; goal: number; reward: MissionReward;
}
export interface DailyChest { claimed: boolean; canClaim: boolean; reward: MissionReward; }   // reward = do PRÓXIMO baú
export interface DailyStreak { days: number; cycleDays: number; }                              // days = 0 se quebrou
export interface DailyState {
  day: string;                 // 'yyyy-MM-dd' (dia do jogo, vira em resetsAtUtc)
  resetsAtUtc: string;
  missions: DailyMission[];
  chest: DailyChest;
  streak: DailyStreak;
}
export interface DailyClaimResult {
  rewards: MissionReward; levelUp: boolean; player: Player; inventory: OreAmount[]; daily: DailyState;
}
export interface NextMine { mineNumber: number; cost: OreAmount[]; canAfford: boolean; hasSlot: boolean; }
export interface NextCartUpgrade { level: number; capacity: number; cost: OreAmount[]; canAfford: boolean; skillAllows: boolean; }
export interface MineCartUpgrade { mineNumber: number; cartLevel: number; next: NextCartUpgrade | null; }   // next null = nível máximo
export interface MineSlots { used: number; total: number; }               // total nunca fica abaixo de used
export interface ProductionOption { focus: OreType; switchCost: OreAmount[]; drops: Drop[]; canAfford: boolean; }

export interface InventoryItem { oreType: OreType; stage: ItemStage; quantity: number; }
export interface InventoryRes { items: InventoryItem[]; }
export interface WorkshopGem { oreType: GemType; available: number; canAfford: boolean; }
export interface WorkshopRecipe {
  stage: CraftedStage; level: number; inputQuantity: number; cost: OreAmount[];
  skillAllows: boolean; gems: WorkshopGem[];
}
export interface CraftRequest { gem: GemType; stage: CraftedStage; times?: number; }
export interface CraftResult {
  crafted: InventoryItem; spent: InventoryItem[]; inventory: InventoryRes; missions: Mission[]; dailyMissions: DailyMission[];
}

// ---- Catálogo e combate (state.ores / state.combat) ----
export interface OreAttack { stage: ItemStage; attack: number; }
export interface OreDefense { stage: ItemStage; defense: number; }
export interface OreInfo {
  oreType: OreType; kind: OreKind; element: Element; craftable: boolean;
  attack: OreAttack[]; defense: OreDefense[];
}
export interface Effectiveness { attacker: Element; defender: Element; multiplier: number; }   // par ausente vale 1
export interface Combat { effectiveness: Effectiveness[]; energyPerCounterPoint: number; }

// ---- Depósitos (minas finitas) ----
export type DepositStatus = 'Sealed' | 'Open' | 'Depleted' | 'Expired';
export interface Deposit {
  id: number; slot: number;
  /** Nome da faixa vindo da configuração (hoje Light, Medium, Hard); não presuma o conjunto. */
  tier: string;
  element: Element;
  defenseCurrent: number; defenseMax: number; stockRemaining: number; stockMax: number;
  status: DepositStatus; canRotate: boolean; canAttack: boolean; canMine: boolean;
  /** Contra-ataque por ponto de dano (0,05 = 5%). */
  counterRatio: number;
  expiresAtUtc: string | null;
  drops: Drop[];
}
export interface DepositRerolls { used: number; freeLeft: number; nextCost: OreAmount | null; canAfford: boolean; }
export interface DepositsState {
  weekStart: string; resetsAtUtc: string; openCount: number; maxOpen: number; energyPerExtraction: number;
  rerolls: DepositRerolls; items: Deposit[];
}
export interface RotateDepositResult { deposit: Deposit; spent: OreAmount | null; inventory: OreAmount[]; deposits: DepositsState; }

/** Pilha no CORPO do ataque (campo `ore`)... */
export interface GemStackRequest { ore: GemType; stage: CraftedStage; quantity: number; }
/** ...e na RESPOSTA (campo `oreType`). */
export interface GemStack { oreType: GemType; stage: CraftedStage; quantity: number; }
export interface AttackRequest { attackers: GemStackRequest[]; defenders?: GemStackRequest[]; preview?: boolean; }
export interface AttackResult {
  preview: boolean; canConfirm: boolean;
  /** Na prévia, código do erro que o ataque real daria (`NotEnoughResources`, `NotEnoughExploreEnergy` ou `TooManyOpenDeposits`). */
  blocker: ShardsErrorCode | null;
  defenseBefore: number; damageDealt: number; defenseAfter: number; broken: boolean;
  attackersUsed: GemStack[]; defendersUsed: GemStack[];
  counterAttack: number; absorbed: number; unabsorbed: number;
  energyCost: number; exploreEnergyAfter: number;
  deposit: Deposit; inventory: InventoryRes; player: Player; deposits: DepositsState; missions: Mission[];
}
export interface MineDepositRequest { times?: number; }
export interface MineDepositResult {
  units: number; drops: OreAmount[]; xpGained: number; levelUp: boolean; energyCost: number; depleted: boolean;
  deposit: Deposit; inventory: OreAmount[]; player: Player; deposits: DepositsState; missions: Mission[];
}

/** Códigos de erro do servidor (`{ code, message }`). */
export const SHARDS_ERROR_CODES = [
  'PlayerNotFound', 'MineNotFound', 'NotEnoughEnergy', 'CartEmpty', 'NoSkillPoints', 'SkillMaxLevel', 'InvalidSkill',
  'NotEnoughResources', 'NoMoreMines', 'MissionNotCompleted', 'MissionNotFound', 'InvalidTimes', 'ConcurrencyConflict',
  'MissionAlreadyClaimed', 'InvalidProduction', 'SameProduction', 'MineSlotsFull', 'CartUpgradeLocked', 'CartMaxLevel',
  'InvalidGem', 'InvalidStage', 'WorkshopLocked', 'DailyNotFound', 'DailyNotCompleted', 'DailyAlreadyClaimed',
  'ChestNotReady', 'ChestAlreadyClaimed', 'DepositNotFound', 'DepositNotRotatable', 'DepositExpired',
  'DepositDefenseBroken', 'DepositDepleted', 'TooManyOpenDeposits', 'NotEnoughExploreEnergy', 'InvalidAttack',
  'DepositDefenseActive',
] as const;
export type ShardsErrorCode = (typeof SHARDS_ERROR_CODES)[number];

export interface ShardsState {
  serverTimeUtc: string; player: Player; skills: Skill[]; inventory: OreAmount[]; mines: MineState[];
  missions: Mission[]; nextMine: NextMine | null; productions: ProductionOption[]; mineSlots: MineSlots;
  cartUpgrades: MineCartUpgrade[];
  workshop: WorkshopRecipe[];
  daily: DailyState | null;          // null até resgatar a Missão 1
  ores: OreInfo[];
  combat: Combat;
  deposits: DepositsState | null;    // null enquanto a skill Workshop está no nível 0
}
export interface MineRequest { times?: number; }                       // body opcional
export interface MineResult { drops: OreAmount[]; doubleDrops: number; xpGained: number; levelUp: boolean; player: Player; missions: Mission[]; dailyMissions: DailyMission[]; }
export interface CollectCartResult {
  collected: OreAmount[]; total: number; cart: MineState; inventory: OreAmount[]; missions: Mission[]; dailyMissions: DailyMission[];
}
export interface SetProductionRequest { focus: OreType; }
export interface SetProductionResult { mine: MineState; collected: OreAmount[]; spent: OreAmount[]; inventory: OreAmount[]; missions: Mission[]; }
export interface UpgradeCartResult { mine: MineState; collected: OreAmount[]; spent: OreAmount[]; inventory: OreAmount[]; missions: Mission[]; }
export interface UnlockMineResult { mine: MineState; inventory: OreAmount[]; missions: Mission[]; }
export interface DistributeSkillRequest { skillType: SkillType; }
export interface DistributeSkillResult { skills: Skill[]; skillPoints: number; missions: Mission[]; }
export interface ClaimMissionResult { rewards: MissionReward; levelUp: boolean; player: Player; inventory: OreAmount[]; missions: Mission[]; }
export interface ShardsError { code: ShardsErrorCode | string; message: string; }
export interface AuthTokens { token: string; refreshToken: string; }
