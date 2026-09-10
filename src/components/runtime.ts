import type { MdType, TypesResult } from '@agentshouse/mdruntime';

export function mdTypes(result: TypesResult): readonly MdType[] {
  return result.status === 'unavailable' ? [] : result.types;
}
