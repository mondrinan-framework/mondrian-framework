/**
 * @param values the array to map over
 * @param mapper a mapping function that may return `undefined`
 * @returns a new array where each element has been mapped with `mapper` and all values mapped to `undefined` are
 *          discarted
 */
export function filterMap<A, B>(values: A[], mapper: (_: A) => B | undefined): B[] {
  const mappedValues = []
  for (const value of values) {
    const mappedValue = mapper(value)
    if (mappedValue !== undefined) {
      mappedValues.push(mappedValue)
    }
  }
  return mappedValues
}

/**
 * @param object the object to map over
 * @param mapper a mapping function that takes as input the name of a field and the corresponding value and maps it to
 *               a value of type `B` or `undefined`
 * @returns a new object with the same fields where each value is mapped using the mapping function, any value mapped to
 *          `undefined` is discarded and the corresponding field is dropped from the new object
 */
export function filterMapObject<A, B>(
  object: Record<string, A>,
  mapper: (fieldName: string, fieldValue: A) => B | undefined,
): Record<string, B> {
  const mappedObject: { [key: string]: B } = {}
  for (const [fieldName, fieldValue] of Object.entries(object)) {
    const mappedValue = mapper(fieldName, fieldValue)
    if (mappedValue !== undefined) {
      mappedObject[fieldName] = mappedValue
    }
  }
  return mappedObject
}

/**
 * @param keyValuePairs a list of key-value pairs
 * @param lookup the key to lookup
 * @returns true if the `keyValuePairs` list contains the `lookup` key
 */
export function containsKey<A, B>(keyValuePairs: [A, B][], lookup: A): boolean {
  return keyValuePairs.some(([key, _]) => key === lookup)
}

/**
 * Given an object type returns an object with the same structure but where each field is optional.
 */
export type OptionalFields<R extends Record<string, any>> = { [Key in keyof R]?: R[Key] }

/**
 * Turns the nullable keys of an object in optional fields leaving other fields untouched.
 * @example ```ts
 *          UndefinedToOptionalFields<{ field1: number | undefined, field2: boolean }>
 *          // -> { field2: boolean } & { field1?: number | undefined }
 *          ```
 */
// prettier-ignore
export type UndefinedToOptionalFields<R extends Record<string, any>> =
  { [Key in NonNullableKeys<R>]: R[Key] } &
  { [Key in NullableKeys<R>]?: R[Key] }

type NullableKeys<T> = { [Key in keyof T]: undefined extends T[Key] ? Key : never }[keyof T]
type NonNullableKeys<T> = { [Key in keyof T]: undefined extends T[Key] ? never : Key }[keyof T]
