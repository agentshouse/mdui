import type { MdType, TypesResult } from '@agentshouse/mdruntime';
import type { Observation } from '@agentshouse/mdruntime/client';

export function mdTypes(result: TypesResult | undefined): readonly MdType[] {
  return result === undefined || result.status === 'unavailable' ? [] : result.types;
}

export function observation<T>(
  start: Promise<Observation<T>>,
  receive: (value: T) => void,
): () => void {
  let stop: (() => void) | undefined;
  let closed = false;
  void start.then((handle) => {
    if (closed) {
      handle.close();
      return;
    }
    receive(handle.current());
    const unsubscribe = handle.subscribe(receive);
    stop = () => {
      unsubscribe();
      handle.close();
    };
  });
  return () => {
    closed = true;
    stop?.();
  };
}

export const returnedKinds = {
  conflicted: 'Conflicted',
  rejected: 'Rejected',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
} as const;

export const queueStates = {
  waiting: 'Waiting',
  submitted: 'Submitted',
  reset: 'Reset',
} as const;

export function refusalParts(refusal: {
  code: string;
  fields: Readonly<Record<string, unknown>>;
}): string[] {
  return [
    refusal.code,
    ...Object.entries(refusal.fields).flatMap(([name, value]) => [
      name,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]),
  ];
}
