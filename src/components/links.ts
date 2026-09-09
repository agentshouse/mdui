export interface PathDestination {
  path: string;
  fragment?: string;
}

const externalSchemes = new Set([
  'http:',
  'https:',
  'bitcoin:',
  'ftp:',
  'ftps:',
  'geo:',
  'im:',
  'irc:',
  'ircs:',
  'magnet:',
  'mailto:',
  'matrix:',
  'mms:',
  'news:',
  'nntp:',
  'openpgp4fpr:',
  'sftp:',
  'sip:',
  'sms:',
  'smsto:',
  'ssh:',
  'tel:',
  'urn:',
  'webcal:',
  'wtai:',
  'xmpp:',
]);

function externalLink(destination: string): boolean {
  const url = URL.parse(destination.startsWith('//') ? `https:${destination}` : destination);
  return url !== null && (externalSchemes.has(url.protocol) || /^web\+[a-z]+:$/.test(url.protocol));
}

function internalPath(destination: string, currentPath: string): PathDestination | undefined {
  if (!destination || !currentPath || /[\\\u0000-\u0020]/.test(destination)) return;
  const hash = destination.indexOf('#');
  const target = hash < 0 ? destination : destination.slice(0, hash);
  let pathname: string;
  let fragment: string | undefined;
  try {
    pathname = decodeURIComponent(target.split('?')[0]);
    fragment = hash < 0 ? undefined : decodeURIComponent(destination.slice(hash + 1));
  } catch {
    return;
  }
  if (
    /^[a-z][a-z\d+.-]*:/i.test(pathname) ||
    pathname.startsWith('/') ||
    /[\\\u0000-\u001f\u007f]/.test(pathname)
  )
    return;
  const segments = pathname ? currentPath.split('/').slice(0, -1) : currentPath.split('/');
  for (const part of pathname.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (segments.length === 0) return;
      segments.pop();
    } else segments.push(part);
  }
  if (segments.length === 0 || segments.some((part) => !part || part === '.' || part === '..'))
    return;
  return { path: segments.join('/'), ...(fragment === undefined ? {} : { fragment }) };
}

export function connectLinks(
  container: HTMLElement,
  room: string,
  path: string,
  open: (destination: PathDestination) => void,
): void {
  for (const link of container.querySelectorAll('a')) {
    const destination = link.getAttribute('href') ?? '';
    if (externalLink(destination)) {
      link.rel = 'noopener noreferrer';
      continue;
    }
    const target = room ? internalPath(destination, path) : undefined;
    if (!target) {
      link.replaceWith(...link.childNodes);
      continue;
    }
    link.setAttribute('href', '#');
    link.addEventListener('click', (event) => {
      event.preventDefault();
      open(target);
    });
    link.addEventListener('auxclick', (event) => {
      event.preventDefault();
      if (event.button === 1) open(target);
    });
  }
}
