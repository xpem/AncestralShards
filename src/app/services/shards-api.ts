import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AttackRequest, AttackResult, ClaimMissionResult, CollectCartResult, MineDepositRequest, MineDepositResult, RotateDepositResult, CraftRequest, DailyClaimResult, DailyMissionType, CraftResult, InventoryRes, DistributeSkillRequest, DistributeSkillResult, MineRequest, MineResult,
  MissionType, OreType, SetProductionRequest, SetProductionResult, ShardsState, SkillType, UnlockMineResult, UpgradeCartResult,
} from '../models/shards.model';

/** As rotas do jogo (contrato, seção 3). Sem lógica: quem decide o que fazer com a resposta é a store. */
@Injectable({ providedIn: 'root' })
export class ShardsApi {
  private http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/Shards`;

  state(): Observable<ShardsState> {
    return this.http.get<ShardsState>(`${this.base}/state`);
  }

  mine(mineNumber: number, times?: number): Observable<MineResult> {
    const body: MineRequest | null = times === undefined ? null : { times };
    return this.http.post<MineResult>(`${this.base}/mines/${mineNumber}/mine`, body);
  }

  collectCart(mineNumber: number): Observable<CollectCartResult> {
    return this.http.post<CollectCartResult>(`${this.base}/mines/${mineNumber}/collect-cart`, null);
  }

  setProduction(mineNumber: number, focus: OreType): Observable<SetProductionResult> {
    const body: SetProductionRequest = { focus };
    return this.http.post<SetProductionResult>(`${this.base}/mines/${mineNumber}/production`, body);
  }

  upgradeCart(mineNumber: number): Observable<UpgradeCartResult> {
    return this.http.post<UpgradeCartResult>(`${this.base}/mines/${mineNumber}/upgrade-cart`, null);
  }

  unlockMine(): Observable<UnlockMineResult> {
    return this.http.post<UnlockMineResult>(`${this.base}/mines/unlock`, null);
  }

  distributeSkill(skillType: SkillType): Observable<DistributeSkillResult> {
    const body: DistributeSkillRequest = { skillType };
    return this.http.post<DistributeSkillResult>(`${this.base}/skills/distribute`, body);
  }

  inventory(): Observable<InventoryRes> {
    return this.http.get<InventoryRes>(`${this.base}/inventory`);
  }

  craft(body: CraftRequest): Observable<CraftResult> {
    return this.http.post<CraftResult>(`${this.base}/workshop/craft`, body);
  }

  claimMission(missionType: MissionType): Observable<ClaimMissionResult> {
    return this.http.post<ClaimMissionResult>(`${this.base}/missions/${missionType}/claim`, null);
  }

  claimDaily(type: DailyMissionType): Observable<DailyClaimResult> {
    return this.http.post<DailyClaimResult>(`${this.base}/daily/${type}/claim`, null);
  }

  claimDailyChest(): Observable<DailyClaimResult> {
    return this.http.post<DailyClaimResult>(`${this.base}/daily/chest/claim`, null);
  }

  rotateDeposit(id: number): Observable<RotateDepositResult> {
    return this.http.post<RotateDepositResult>(`${this.base}/deposits/${id}/rotate`, null);
  }

  /** Com `preview: true` nada é gravado e a resposta descreve o que aconteceria. */
  attackDeposit(id: number, body: AttackRequest): Observable<AttackResult> {
    return this.http.post<AttackResult>(`${this.base}/deposits/${id}/attack`, body);
  }

  mineDeposit(id: number, times?: number): Observable<MineDepositResult> {
    const body: MineDepositRequest | null = times === undefined ? null : { times };
    return this.http.post<MineDepositResult>(`${this.base}/deposits/${id}/mine`, body);
  }
}
