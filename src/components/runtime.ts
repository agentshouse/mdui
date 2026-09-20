import type { MdType, TypesResult } from '@agentshouse/mdruntime';

export function mdTypes(result: TypesResult | undefined): readonly MdType[] {
  return result === undefined || result.status === 'unavailable' ? [] : result.types;
}

export function observation(start: Promise<() => void>): () => void {
  let stop: (() => void) | undefined;
  let closed = false;
  void start.then((end) => {
    if (closed) {
      end();
      return;
    }
    stop = end;
  });
  return () => {
    closed = true;
    stop?.();
  };
}

export function refusalParts(refusal: {
  code: string;
  fields: Readonly<Record<string, unknown>>;
}): string[] {
  return [
    refusal.code,
    ...Object.values(refusal.fields).map((value) =>
      typeof value === 'string' ? value : JSON.stringify(value),
    ),
  ];
}
