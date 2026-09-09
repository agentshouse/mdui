export const fieldStyles = `
  :host {
    display: block;
    min-width: 0;
    color-scheme: var(--md-color-scheme, light dark);
    background: var(--md-background, light-dark(#fff, #121820));
    padding: .5rem;
    border-radius: .5rem;
    color: var(--md-text, light-dark(#20252b, #e8ebef));
    font: 1rem/1.5 system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  label, legend { display: block; font-weight: 600; margin-bottom: .35rem; overflow-wrap: anywhere; }
  input, textarea, select, button {
    color: inherit;
    font: inherit;
    border: 1px solid var(--md-border, light-dark(#74808c, #8b99a7));
    border-radius: .35rem;
    background: var(--md-surface, light-dark(#fff, #1d232b));
    padding: .55rem .7rem;
    min-height: 2.75rem;
    max-width: 100%;
  }
  input, textarea, select { width: 100%; min-width: 0; }
  textarea { resize: vertical; vertical-align: top; }
  :focus-visible { outline: 3px solid var(--md-focus, light-dark(#1759bc, #92bbff)); outline-offset: 3px; }
  :disabled { opacity: .65; }
  p { margin: .25rem 0 0; font-size: .875rem; overflow-wrap: anywhere; }
  .error { color: var(--md-error, light-dark(#a32222, #ffb3ac)); }
  .error:empty { display: none; }
  fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
  .item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: .75rem; margin-bottom: .75rem; }
  .item button { margin-top: 1.85rem; }
`;
