export type OreType = 'Quartz' | 'Ruby' | 'Sapphire' | 'Emerald';
export type SkillType = 'DoubleDrop' | 'MineSlots' | 'CartCapacity' | 'Workshop';
export type ItemStage = 'Raw' | 'Polished' | 'Faceted';
export type GemType = Exclude<OreType, 'Quartz'>;
export type MissionType = 'FirstPickaxe' | 'Specialization' | 'OperationalExpansion' | 'FirstGem';
export type MissionStatus = 'Active' | 'Completed' | 'Claimed';

export interface OreAmount { oreType: OreType; quantity: number; }
export interface Drop { oreType: OreType; chance: number; xp: number; }   // chance de 0 a 1

export interface Player {
  level: number; experience: number; experienceToNextLevel: number; skillPoints: number;
  energy: number; maxEnergy: number; secondsPerEnergy: number; nextEnergyAtUtc: string | null;
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
export interface NextMine { mineNumber: number; cost: OreAmount[]; canAfford: boolean; hasSlot: boolean; }
export interface NextCartUpgrade { level: number; capacity: number; cost: OreAmount[]; canAfford: boolean; skillAllows: boolean; }
export interface MineCartUpgrade { mineNumber: number; cartLevel: number; next: NextCartUpgrade | null; }   // next null = nível máximo
export interface MineSlots { used: number; total: number; }               // total nunca fica abaixo de used
export interface ProductionOption { focus: OreType; switchCost: OreAmount[]; drops: Drop[]; canAfford: boolean; }

export interface InventoryItem { oreType: OreType; stage: ItemStage; quantity: number; }
export interface InventoryRes { items: InventoryItem[]; }
export interface WorkshopGem { oreType: GemType; available: number; canAfford: boolean; }
export interface WorkshopRecipe {
  stage: Exclude<ItemStage, 'Raw'>; level: number; inputQuantity: number; cost: OreAmount[];
  skillAllows: boolean; gems: WorkshopGem[];
}
export interface CraftRequest { gem: GemType; stage: Exclude<ItemStage, 'Raw'>; times?: number; }
export interface CraftResult { crafted: InventoryItem; spent: InventoryItem[]; inventory: InventoryRes; }

export interface ShardsState {
  serverTimeUtc: string; player: Player; skills: Skill[]; inventory: OreAmount[]; mines: MineState[];
  missions: Mission[]; nextMine: NextMine | null; productions: ProductionOption[]; mineSlots: MineSlots;
  cartUpgrades: MineCartUpgrade[];
  workshop: WorkshopRecipe[];
}
export interface MineRequest { times?: number; }                       // body opcional
export interface MineResult { drops: OreAmount[]; doubleDrops: number; xpGained: number; levelUp: boolean; player: Player; missions: Mission[]; }
export interface CollectCartResult { collected: OreAmount[]; total: number; cart: MineState; inventory: OreAmount[]; }
export interface SetProductionRequest { focus: OreType; }
export interface SetProductionResult { mine: MineState; collected: OreAmount[]; spent: OreAmount[]; inventory: OreAmount[]; missions: Mission[]; }
export interface UpgradeCartResult { mine: MineState; collected: OreAmount[]; spent: OreAmount[]; inventory: OreAmount[]; }
export interface UnlockMineResult { mine: MineState; inventory: OreAmount[]; missions: Mission[]; }
export interface DistributeSkillRequest { skillType: SkillType; }
export interface DistributeSkillResult { skills: Skill[]; skillPoints: number; missions: Mission[]; }
export interface ClaimMissionResult { rewards: MissionReward; levelUp: boolean; player: Player; inventory: OreAmount[]; missions: Mission[]; }
export interface ShardsError { code: string; message: string; }
export interface AuthTokens { token: string; refreshToken: string; }
