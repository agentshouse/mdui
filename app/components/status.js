import { observation, queueKinds, refusalParts } from './runtime.js';
import { adopt, statusStyles } from './theme.js';
const states = {
    pending: 'Pending',
    syncing: 'Syncing',
    synced: 'Synced'
};
export class SyncStatusIndicator extends HTMLElement {
    runtime;
    unobserve;
    root = this.attachShadow({
        mode: 'open'
    });
    bind(runtime) {
        this.runtime = runtime;
        this.watch();
    }
    connectedCallback() {
        this.watch();
    }
    disconnectedCallback() {
        this.unobserve?.();
        this.unobserve = undefined;
    }
    watch() {
        this.unobserve?.();
        this.unobserve = undefined;
        if (!this.isConnected || this.runtime === undefined) return;
        this.unobserve = observation(this.runtime.observe('sync-status', (status)=>this.present(status)));
    }
    present(status) {
        adopt(this.root, statusStyles);
        const region = document.createElement('div');
        region.setAttribute('role', 'status');
        region.setAttribute('aria-label', 'Sync Status');
        const state = document.createElement('p');
        state.className = 'state';
        state.textContent = states[status.state];
        region.append(state);
        for (const entry of status.attentionRequired){
            const attention = document.createElement('p');
            attention.className = 'attention';
            attention.textContent = queueKinds[entry.outcome];
            region.append(attention);
            if (entry.refusal === null) continue;
            for (const part of refusalParts(entry.refusal)){
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
            time.textContent = new Intl.DateTimeFormat(navigator.language, {
                dateStyle: 'medium',
                timeStyle: 'short'
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
