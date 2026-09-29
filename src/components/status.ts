import type { SyncStatus } from '@agentshouse/mdruntime';
import type { MdRuntimeClient } from '@agentshouse/mdruntime/client';
import { observation, refusalParts, returnedKinds } from './runtime.js';
import { locale } from './locale.js';
import { adopt, statusStyles } from './theme.js';

const states = {
  pending: 'Pending',
  syncing: 'Syncing',
  synced: 'Synced',
} as const;

export class SyncStatusIndicator extends HTMLElement {
  private runtime: MdRuntimeClient | undefined;
  private unobserve: (() => void) | undefined;
  private readonly root = this.attachShadow({ mode: 'open' });

  bind(runtime: MdRuntimeClient): void {
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
    this.unobserve = observation(this.runtime.observe('sync-status'), (status) =>
      this.present(status),
    );
  }

  private present(status: SyncStatus): void {
    adopt(this.root, statusStyles);
    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-label', 'Sync Status');
    const state = document.createElement('p');
    state.className = 'state';
    state.textContent = states[status.state];
    region.append(state);
    for (const entry of status.attentionRequired) {
      const attention = document.createElement('p');
      attention.className = 'attention';
      attention.textContent = returnedKinds[entry.returned.kind];
      region.append(attention);
      if (!('code' in entry.returned)) continue;
      for (const part of refusalParts(entry.returned)) {
        const text = document.createElement('p');
        text.className = 'attention';
        text.textContent = part;
        region.append(text);
      }
    }
    if (status.reset !== null) {
      const reset = document.createElement('p');
      reset.textContent = status.reset;
      region.append(reset);
    }
    if (status.lastCompleted !== null) {
      const completed = document.createElement('p');
      completed.append('Last completed ');
      const time = document.createElement('time');
      time.dateTime = status.lastCompleted;
      time.textContent = new Intl.DateTimeFormat(locale, {
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
    this.root.replaceChildren(region);
  }
}

customElements.define('md-sync-status', SyncStatusIndicator);
