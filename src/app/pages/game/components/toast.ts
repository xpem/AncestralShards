import { Component, effect, inject, signal } from '@angular/core';
import { GameStore, Notice } from '../../../services/game.store';

@Component({
  selector: 'app-toast',
  template: `
    @if (shown(); as n) {
      <div class="sh-toast" [class.error]="n.kind === 'error'" [class.success]="n.kind === 'success'" role="status" (click)="shown.set(null)">
        {{ n.text }}
      </div>
    }
  `,
})
export class Toast {
  private store = inject(GameStore);
  protected shown = signal<Notice | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const n = this.store.notice();
      if (!n) return;
      this.shown.set(n);
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.shown.set(null), 3500);
    });
  }
}
