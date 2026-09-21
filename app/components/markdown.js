import { renderMarkdown } from './html.js';
import { connectLinks } from './links.js';
import { adopt, markdownStyles } from './theme.js';
export class MarkdownRenderer extends HTMLElement {
    static observedAttributes = [
        'text',
        'label',
        'room',
        'path'
    ];
    source = '';
    references = [];
    root = this.attachShadow({
        mode: 'open'
    });
    get text() {
        return this.source;
    }
    get resources() {
        return this.references.map((reference)=>({
                ...reference
            }));
    }
    set text(value) {
        this.source = value;
        this.render();
    }
    connectedCallback() {
        this.render();
    }
    attributeChangedCallback(name, _prior, value) {
        if (name === 'text') this.source = value ?? '';
        this.render();
    }
    render() {
        if (!this.isConnected) return;
        const article = document.createElement('article');
        article.setAttribute('aria-label', this.getAttribute('label') ?? 'Markdown');
        const { content, resources } = renderMarkdown(this.source);
        article.append(content);
        for (const wide of article.querySelectorAll('pre, table')){
            const region = document.createElement('div');
            region.setAttribute('role', 'region');
            region.setAttribute('aria-label', wide.localName === 'pre' ? 'Code block' : 'Table');
            region.tabIndex = 0;
            region.className = 'scroll';
            wide.replaceWith(region);
            region.append(wide);
        }
        const room = this.getAttribute('room') ?? '';
        const path = this.getAttribute('path') ?? '';
        connectLinks(article, room, path, (destination)=>this.dispatchEvent(new CustomEvent('open-path', {
                bubbles: true,
                composed: true,
                detail: {
                    room,
                    ...destination
                }
            })));
        this.references = resources;
        adopt(this.root, markdownStyles);
        this.root.replaceChildren(article);
        for (const reference of this.resources)this.dispatchEvent(new CustomEvent('resource-reference', {
            bubbles: true,
            composed: true,
            detail: {
                room,
                path,
                reference
            }
        }));
    }
}
customElements.define('md-markdown', MarkdownRenderer);
