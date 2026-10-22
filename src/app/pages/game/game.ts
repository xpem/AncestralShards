import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { GameStore, GameTab } from '../../services/game.store';
import { oreLabel } from '../../shared/ore-info';
import { DailyPanel } from './components/daily-panel';
import { EnergyBar } from './components/energy-bar';
import { NextMine } from './components/next-mine';
import { Skills } from './components/skills';
import { Inventory } from './components/inventory';
import { MineCard } from './components/mine-card';
import { MissionList } from './components/mission-list';
import { Workshop } from './components/workshop';
import { Toast } from './components/toast';

@Component({
  selector: 'app-game',
  imports: [DailyPanel, EnergyBar, Inventory, MineCard, MissionList, NextMine, Skills, Toast, Workshop],
  templateUrl: './game.html',
  styleUrl: './game.css',
})
export class Game implements OnInit, OnDestroy {
  protected auth = inject(AuthService);
  protected store = inject(GameStore);
  protected readonly tabs: { id: GameTab; label: string; icon: string }[] = [
    { id: 'mines', label: 'Minas', icon: 'bi-minecart-loaded' },
    { id: 'workshop', label: 'Oficina', icon: 'bi-gem' },
    { id: 'progress', label: 'Progresso', icon: 'bi-trophy' },
  ];

  protected xpPercent(): number {
    const p = this.store.player();
    if (!p) return 0;
    const total = p.experience + p.experienceToNextLevel;
    return total > 0 ? (p.experience / total) * 100 : 0;
  }

  ngOnInit(): void {
    this.store.start();
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  protected summary(): string {
    const l = this.store.lastMine();
    if (!l) return '';
    const drops = l.drops.map((d) => `+${d.quantity} ${oreLabel(d.oreType)}`).join(', ');
    const extra = l.doubleDrops > 0 ? ` · ${l.doubleDrops} em dobro` : '';
    return `${l.times}× minerado: ${drops} · +${l.xpGained} XP${extra}${l.levelUp ? ' · Subiu de nível!' : ''}`;
  }
}
