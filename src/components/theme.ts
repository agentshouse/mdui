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

export const markdownStyles = `
  :host {
    display: block;
    min-width: 0;
    color-scheme: var(--md-color-scheme, light dark);
    background: var(--md-background, light-dark(#fff, #121820));
    color: var(--md-text, light-dark(#20252b, #e8ebef));
    border-radius: .5rem;
    padding: 1rem;
    font: 1rem/1.6 system-ui, sans-serif;
    overflow-wrap: anywhere;
  }
  * { box-sizing: border-box; }
  article > :first-child { margin-top: 0; }
  article > :last-child { margin-bottom: 0; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.4em 0 .6em; }
  h1 { font-size: 2rem; }
  h2 { font-size: 1.65rem; }
  h3 { font-size: 1.35rem; }
  p, ul, ol, blockquote, details, .scroll { margin: 1rem 0; }
  ul, ol { padding-inline-start: 1.5rem; }
  a { color: var(--md-link, light-dark(#1759bc, #92bbff)); text-underline-offset: .15em; }
  :focus-visible { outline: 3px solid var(--md-focus, light-dark(#1759bc, #92bbff)); outline-offset: 3px; }
  blockquote { margin-inline: 0; padding-inline-start: 1rem; border-inline-start: 3px solid var(--md-border, light-dark(#74808c, #8b99a7)); }
  details { border: 1px solid var(--md-border, light-dark(#74808c, #8b99a7)); border-radius: .35rem; padding: .65rem; }
  summary { cursor: pointer; font-weight: 600; }
  details > :last-child { margin-bottom: 0; }
  code { font: .9em/1.6 ui-monospace, monospace; background: var(--md-surface, light-dark(#f2f5f8, #1d232b)); border-radius: .25rem; padding: .1em .25em; }
  pre { margin: 0; padding: .75rem; white-space: pre; overflow-wrap: normal; }
  pre code { background: transparent; padding: 0; }
  .scroll { max-width: 100%; overflow: auto; border-radius: .35rem; background: var(--md-surface, light-dark(#f2f5f8, #1d232b)); }
  table { width: 100%; border-collapse: collapse; overflow-wrap: normal; }
  th, td { padding: .6rem; border: 1px solid var(--md-border, light-dark(#74808c, #8b99a7)); }
  th { font-weight: 600; }
  .resource { display: inline-block; padding: .5rem .75rem; border: 1px dashed var(--md-border, light-dark(#74808c, #8b99a7)); border-radius: .35rem; }
  input { accent-color: var(--md-focus, light-dark(#1759bc, #92bbff)); }
  hr { border: 0; border-top: 1px solid var(--md-border, light-dark(#74808c, #8b99a7)); }
`;

export const viewStyles = `
  :host {
    display: block;
    min-width: 0;
    color-scheme: var(--md-color-scheme, light dark);
    background: var(--md-background, light-dark(#fff, #121820));
    padding: .75rem;
    border-radius: .5rem;
    color: var(--md-text, light-dark(#20252b, #e8ebef));
    font: 1rem/1.5 system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  h1, h2 { line-height: 1.25; overflow-wrap: anywhere; }
  h1 { font-size: 1.35rem; margin: 0 0 .75rem; }
  h2 { font-size: 1.1rem; margin: 0 0 .5rem; }
  .reason {
    color: var(--md-error, light-dark(#a32222, #ffb3ac));
    margin: 0 0 .75rem;
  }
  .reason:empty { display: none; }
  .fields, .part, .panel, .structure, .actions { display: grid; gap: .5rem; min-width: 0; margin: 0 0 1rem; }
  textarea {
    color: inherit;
    font: inherit;
    width: 100%;
    min-width: 0;
    min-height: 8rem;
    border: 1px solid var(--md-border, light-dark(#74808c, #8b99a7));
    border-radius: .35rem;
    background: var(--md-surface, light-dark(#fff, #1d232b));
    padding: .55rem .7rem;
    resize: vertical;
  }
  .error, .current, .refusal { margin: 0; overflow-wrap: anywhere; }
  .error, .refusal { color: var(--md-error, light-dark(#a32222, #ffb3ac)); }
  .error:empty { display: none; }
  .current { font-size: .875rem; }
  .refusal { white-space: pre-wrap; margin: 0 0 .75rem; }
  button, summary {
    color: inherit;
    font: inherit;
    border: 1px solid var(--md-border, light-dark(#74808c, #8b99a7));
    border-radius: .35rem;
    background: var(--md-surface, light-dark(#fff, #1d232b));
    padding: .55rem .7rem;
    min-height: 2.75rem;
    max-width: 100%;
  }
  button { width: 100%; text-align: start; }
  :focus-visible { outline: 3px solid var(--md-focus, light-dark(#1759bc, #92bbff)); outline-offset: 3px; }
  details {
    border: 1px solid var(--md-border, light-dark(#74808c, #8b99a7));
    border-radius: .35rem;
    padding: .65rem;
    min-width: 0;
  }
  summary { cursor: pointer; font-weight: 600; }
  .revisions, .links { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
  .absence { margin: .5rem 0 0; }
`;

export const statusStyles = `
  :host {
    display: block;
    min-width: 0;
    color-scheme: var(--md-color-scheme, light dark);
    background: var(--md-background, light-dark(#fff, #121820));
    padding: .75rem;
    border-radius: .5rem;
    color: var(--md-text, light-dark(#20252b, #e8ebef));
    font: 1rem/1.5 system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  [role='status'] { display: grid; gap: .35rem; overflow-wrap: anywhere; }
  p { margin: 0; }
  .state { font-weight: 600; }
  .attention { color: var(--md-error, light-dark(#a32222, #ffb3ac)); }
`;

export const appStyles = `
  #app {
    display: block;
    min-width: 0;
    color-scheme: var(--md-color-scheme, light dark);
    background: var(--md-background, light-dark(#fff, #121820));
    color: var(--md-text, light-dark(#20252b, #e8ebef));
    font: 1rem/1.5 system-ui, sans-serif;
    padding: .75rem;
    overflow-wrap: anywhere;
  }
  #app * { box-sizing: border-box; }
  #app header {
    display: flex;
    flex-wrap: wrap;
    gap: .75rem;
    align-items: start;
    margin-bottom: 1rem;
  }
  #app nav[aria-label='Screens'] { display: flex; flex-wrap: wrap; gap: .35rem; min-width: 0; }
  #app h1 { font-size: 1.35rem; line-height: 1.25; margin: 0 0 .75rem; }
  #app h2 { font-size: 1.1rem; line-height: 1.25; margin: 0 0 .5rem; }
  #app h3 { font-size: 1rem; margin: .5rem 0 .35rem; }
  #app p, #app pre { margin: 0 0 .75rem; }
  #app pre {
    white-space: pre-wrap;
    background: var(--md-surface, light-dark(#fff, #1d232b));
    border: 1px solid var(--md-border, light-dark(#74808c, #8b99a7));
    border-radius: .35rem;
    padding: .55rem .7rem;
  }
  #app ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .35rem; }
  #app ul ul { margin: .35rem 0 0 .75rem; }
  #app article { min-width: 0; margin: 0 0 1rem; }
  #app form { display: grid; gap: .5rem; margin: 0 0 1rem; }
  #app label { display: grid; gap: .35rem; font-weight: 600; min-width: 0; }
  #app input, #app select, #app button {
    color: inherit;
    font: inherit;
    border: 1px solid var(--md-border, light-dark(#74808c, #8b99a7));
    border-radius: .35rem;
    background: var(--md-surface, light-dark(#fff, #1d232b));
    padding: .55rem .7rem;
    min-height: 2.75rem;
    max-width: 100%;
  }
  #app input, #app select { width: 100%; min-width: 0; }
  #app :focus-visible { outline: 3px solid var(--md-focus, light-dark(#1759bc, #92bbff)); outline-offset: 3px; }
`;
