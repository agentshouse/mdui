import { micromark } from 'micromark';
import { markdownProfile } from './profile.js';
function escapeText(value) {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function filterRawHtml(source, resources) {
    const markers = new Map();
    const prefix = crypto.randomUUID();
    const marked = source.replace(/<(\/?)(details|summary)(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi, (tag, closing, name)=>{
        const template = document.createElement('template');
        template.innerHTML = tag;
        const open = !closing && name.toLowerCase() === 'details' && template.content.firstElementChild?.hasAttribute('open');
        const marker = `${prefix}-${markers.size}`;
        markers.set(marker, `<${closing}${name.toLowerCase()}${open ? ' open' : ''}>`);
        return `<!--${marker}-->`;
    });
    const template = document.createElement('template');
    template.innerHTML = marked;
    function clean(node) {
        if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? '');
        if (node.nodeType === Node.COMMENT_NODE) return markers.get(node.textContent ?? '') ?? '';
        if (node instanceof Element && [
            'script',
            'style',
            'template',
            'textarea',
            'title',
            'xmp',
            'iframe',
            'noembed',
            'noframes',
            'plaintext'
        ].includes(node.localName)) return '';
        if (node instanceof Element && [
            'img',
            'video',
            'audio',
            'source',
            'track',
            'object',
            'embed',
            'link',
            'image'
        ].includes(node.localName)) {
            for (const attribute of [
                'src',
                'srcset',
                'poster',
                'data',
                'href',
                'xlink:href'
            ]){
                const destination = node.getAttribute(attribute);
                if (!destination) continue;
                const image = node.localName === 'img' && attribute === 'src';
                resources.push({
                    kind: image ? 'image' : 'resource',
                    destination,
                    label: image ? node.getAttribute('alt') ?? '' : node.localName,
                    ...attribute === 'srcset' ? {
                        attribute
                    } : {}
                });
            }
        }
        return Array.from(node.childNodes, clean).join('');
    }
    return clean(template.content);
}
function rawHtmlFilter(resources) {
    return {
        enter: {
            htmlFlow () {
                this.buffer();
            },
            htmlText () {
                this.buffer();
            }
        },
        exit: {
            htmlFlow (token) {
                this.resume();
                this.raw(filterRawHtml(this.sliceSerialize(token), resources));
            },
            htmlText (token) {
                this.resume();
                this.raw(filterRawHtml(this.sliceSerialize(token), resources));
            }
        }
    };
}
export function renderMarkdown(source) {
    const resources = [];
    const template = document.createElement('template');
    template.innerHTML = micromark(source, {
        ...markdownProfile,
        allowDangerousProtocol: true,
        htmlExtensions: [
            ...markdownProfile.htmlExtensions,
            rawHtmlFilter(resources)
        ]
    });
    const tags = new Set([
        'p',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'blockquote',
        'pre',
        'code',
        'em',
        'strong',
        'del',
        'ul',
        'ol',
        'li',
        'hr',
        'br',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'input',
        'details',
        'summary',
        'a'
    ]);
    function copy(node) {
        if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '');
        if (!(node instanceof Element)) return document.createDocumentFragment();
        if (node.localName === 'img') {
            const reference = {
                kind: 'image',
                destination: node.getAttribute('src') ?? '',
                label: node.getAttribute('alt') ?? '',
                ...node.hasAttribute('title') ? {
                    title: node.getAttribute('title')
                } : {}
            };
            resources.push(reference);
            const placeholder = document.createElement('span');
            placeholder.setAttribute('role', 'img');
            placeholder.setAttribute('aria-label', reference.label || 'Image');
            placeholder.textContent = reference.label || 'Image';
            placeholder.className = 'resource';
            return placeholder;
        }
        if (!tags.has(node.localName)) return document.createDocumentFragment();
        const element = document.createElement(node.localName);
        if (node.localName === 'input') {
            element.setAttribute('type', 'checkbox');
            element.setAttribute('disabled', '');
            if (node.hasAttribute('checked')) element.setAttribute('checked', '');
            element.setAttribute('aria-label', node.parentElement?.textContent?.trim() || 'Task');
        }
        if (node.localName === 'details' && node.hasAttribute('open')) element.setAttribute('open', '');
        if (node.localName === 'ol' && node.hasAttribute('start')) element.setAttribute('start', node.getAttribute('start'));
        if ([
            'th',
            'td'
        ].includes(node.localName) && [
            'left',
            'center',
            'right'
        ].includes(node.getAttribute('align') ?? '')) element.setAttribute('align', node.getAttribute('align'));
        if (node.localName === 'a') {
            element.setAttribute('href', node.getAttribute('href') ?? '');
            if (node.hasAttribute('title')) element.setAttribute('title', node.getAttribute('title'));
        }
        for (const child of node.childNodes)element.append(copy(child));
        return element;
    }
    const content = document.createDocumentFragment();
    for (const node of template.content.childNodes)content.append(copy(node));
    return {
        content,
        resources
    };
}
