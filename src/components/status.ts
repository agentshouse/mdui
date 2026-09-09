import type { MdRuntime, SyncStatus } from '@agentshouse/mdruntime';
import { statusStyles } from './theme.js';

const states = {
  pending: 'Pending',
  syncing: 'Syncing',
  synced: 'Synced',
} as const;

export class SyncStatusIndicator extends HTMLElement {
  private runtime: MdRuntime | undefined;
  private unobserve: (() => void) | undefined;
  private readonly root = this.attachShadow({ mode: 'open' });

  bind(runtime: MdRuntime): void {
    this.runtime = runtime;
    this.watch();
  }

  connectedCallback(): void {
    this.watch();
  }

  disconnectedCallback(): void {
    this.unobserve?.();
    this.unobserve = undefined;
  }

  private watch(): void {
    this.unobserve?.();
    this.unobserve = undefined;
    if (!this.isConnected || this.runtime === undefined) return;
    this.unobserve = this.runtime.observe('sync-status', (status) => this.present(status));
  }

  private present(status: SyncStatus): void {
    const style = document.createElement('style');
    style.textContent = statusStyles;
    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-label', 'Sync Status');
    const state = document.createElement('p');
    state.className = 'state';
    state.textContent = states[status.state];
    region.append(state);
    if (status.attentionRequired) {
      const attention = document.createElement('p');
      attention.className = 'attention';
      attention.textContent = 'Attention required';
      region.append(attention);
    }
    if (status.lastCompleted !== null) {
      const completed = document.createElement('p');
      completed.append('Last completed ');
      const time = document.createElement('time');
      time.dateTime = status.lastCompleted;
      time.textContent = new Intl.DateTimeFormat(navigator.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(status.lastCompleted));
      completed.append(time);
      region.append(completed);
    }
    if (status.providerUnreachable && status.state === 'pending') {
      const pending = document.createElement('p');
      pending.textContent = 'Changes remain Pending';
      region.append(pending);
    }
    this.root.replaceChildren(style, region);
  }
}

customElements.define('md-sync-status', SyncStatusIndicator);
