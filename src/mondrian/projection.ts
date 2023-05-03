import { LazyType, boolean, object, optional, union } from './type-system'
import { assertNever, lazyToType } from './utils'

export type Projection<T> = T extends Date
  ? true | undefined
  : T extends (infer E)[]
  ? Projection<E>
  : T extends object
  ?
      | {
          [K in keyof T]?: Projection<T[K]> | true
        }
      | true
  : true | undefined

export type GenericProjection = true | { [K in string]?: true | GenericProjection }

export function getProjectionType(type: LazyType): LazyType {
  if (typeof type === 'function') {
    return () => lazyToType(getProjectionType(lazyToType(type)))
  }
  if (
    type.kind === 'boolean' ||
    type.kind === 'string' ||
    type.kind === 'number' ||
    type.kind === 'null' ||
    type.kind === 'enumerator' ||
    type.kind === 'custom' ||
    type.kind === 'literal'
  ) {
    return boolean()
  }
  if (type.kind === 'object') {
    return union({
      first: boolean(),
      second: object(
        Object.fromEntries(
          Object.entries(type.type).map(([k, v]) => {
            const t = getProjectionType(v)
            return [k, optional(t)]
          }),
        ),
        { strict: true },
      ),
    })
  }
  if (type.kind === 'array-decorator' || type.kind === 'optional-decorator' || type.kind === 'default-decorator') {
    return getProjectionType(type.type)
  }
  if (type.kind === 'union-operator') {
    const subProjection = Object.entries(type.types).flatMap(([k, t]) => {
      if (lazyToType(t).kind !== 'object') {
        return []
      }
      return [[k, optional(getProjectionType(t))]] as const
    })
    return union({ all: boolean(), object: object(Object.fromEntries(subProjection), { strict: true }) })
  }
  assertNever(type)
}
