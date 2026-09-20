export type Addressed = 'rooms' | 'search' | 'file' | 'work' | 'log';

const ADDRESSED: readonly Addressed[] = ['rooms', 'search', 'file', 'work', 'log'];

export function addressed(value: string): value is Addressed {
  return (ADDRESSED as readonly string[]).includes(value);
}

function encodeSegments(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

export function fileSuffix(room: string, path: string): string {
  return `file/${encodeURIComponent(room)}/${encodeSegments(path)}`;
}

export function splitAddress(address: string): { path: string; search: string; hash: string } {
  const hashAt = address.indexOf('#');
  const hash = hashAt === -1 ? '' : address.slice(hashAt);
  const beforeHash = hashAt === -1 ? address : address.slice(0, hashAt);
  const queryAt = beforeHash.indexOf('?');
  const search = queryAt === -1 ? '' : beforeHash.slice(queryAt);
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  return { path, search, hash };
}

export function parseAddress(address: string): {
  screen: Addressed | null;
  room: string | null;
  path: string | null;
  search: string;
  hash: string;
  remainder: boolean;
} {
  const { path, search, hash } = splitAddress(address);
  const remainder = path !== '' && path !== '/';
  const body = path.startsWith('/') ? path.slice(1) : path;
  const segments = remainder ? body.split('/') : [];
  const head = segments[0];
  if (head === 'file') {
    let after: string[];
    try {
      after = segments.slice(1).map(decodeURIComponent);
    } catch (error) {
      if (!(error instanceof URIError)) throw error;
      return { screen: null, room: null, path: null, search, hash, remainder };
    }
    return {
      screen: 'file',
      room: after[0] ?? null,
      path: after.length > 1 ? after.slice(1).join('/') : null,
      search,
      hash,
      remainder,
    };
  }
  if (head !== undefined && addressed(head) && segments.length === 1) {
    return { screen: head, room: null, path: null, search, hash, remainder };
  }
  return { screen: null, room: null, path: null, search, hash, remainder };
}

export function composeAddress(
  suffix: string,
  extras: { search?: string; hash?: string } = {},
): string {
  const path = suffix === '' ? '/' : `/${suffix}`;
  return `${path}${extras.search ?? ''}${extras.hash ?? ''}`;
}
