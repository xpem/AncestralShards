import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ClaimMissionResult, CollectCartResult, DistributeSkillRequest, DistributeSkillResult, MineRequest, MineResult,
  MissionType, OreType, SetProductionRequest, SetProductionResult, ShardsState, SkillType, UnlockMineResult, UpgradeCartResult,
} from '../models/shards.model';

/** As 8 rotas do jogo (contrato, seção 3). Sem lógica: quem decide o que fazer com a resposta é a store. */
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

  claimMission(missionType: MissionType): Observable<ClaimMissionResult> {
    return this.http.post<ClaimMissionResult>(`${this.base}/missions/${missionType}/claim`, null);
  }
}
