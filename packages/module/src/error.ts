import { security } from '.'
import { model } from '@mondrian-framework/model'
import { capitalise, mapObject } from '@mondrian-framework/utils'

type ErrorsDefinition = { [K in string]: { [F in string]: model.Type | string } }
/**
 * Generic error type with a standard structure.
 * { message: string, details: T }
 */
type Error<Es extends ErrorsDefinition> = {
  [K in keyof Es]: model.ObjectType<
    model.Mutability.Immutable,
    Pick<Es[K], NonStringKeys<Es[K]>> extends infer Ts extends model.Types ? Ts : {}
  >
}

type NonStringKeys<T extends { [K in string]: model.Type | string }> = {
  [K in keyof T]: T[K] extends string ? never : K
}[keyof T]

/**
 * Defines an error type in a standard way.
 *
 * Example:
 * ```ts
 * import { error, functions } from '@mondrian-framework/module'
 * import { model } from '@mondrian-framework/model'
 *
 * const errors = error.define({
 *   unauthorized: { message: 'Unauthorised access.' },
 *   tooManyRequests: { message: 'Too many requests.', details: model.object({ count: model.number(), max: model.number() }) }
 * })
 *
 * const f = functions.define({
 *   input: model.string(),
 *   output: model.string(),
 *   errors,
 * }).implement({
 *   async body({ input }) {
 *     if (input === '???') {
 *       return result.fail({ tooManyRequests: { details: { count: 10, max: 5 } } })
 *     }
 *     //...
 *     return result.fail({ unauthorized: {} })
 *   })
 * })
 * ```
 */
export function define<const Es extends ErrorsDefinition>(
  errors: Es,
  options?: { capitalizeErrorNames?: boolean },
): Error<Es> {
  return mapObject(errors, (errorCode, fields) => {
    const type = model.object(
      mapObject(fields, (_, field) =>
        typeof field === 'string' ? model.literal(field, { allowUndefinedValue: true }) : field,
      ),
      { name: options?.capitalizeErrorNames ? capitalise(`${errorCode}Error`) : `${errorCode}Error` },
    )
    return type as any
  }) as Error<Es>
}

export const standard = {
  BadInput: model.object(
    {
      message: model.literal('Bad input.', { allowUndefinedValue: true }),
      from: model.enumeration(['input', 'retrieve'], { description: 'The source of the error.' }),
      errors: model
        .union({
          decodingError: model.object(
            {
              path: model.string({ description: 'The path of the input that caused the error.' }),
              expected: model.string({ description: 'The expected type.' }),
              got: model.unknown({ description: 'The actual value.' }).optional(),
              variants: model.array(model.string(), { description: 'The variants that caused the error' }).optional(),
            },
            {
              name: 'DecodingError',
              description: "Error that occurs when the input doesn't match the expected type.",
            },
          ),
          validationError: model.object(
            {
              path: model.string({ description: 'The path of the input that caused the error.' }),
              assertion: model.string({ description: 'The failure reason.' }),
              got: model.unknown({ description: 'The actual value.' }).optional(),
              variants: model.array(model.string(), { description: 'The variants that caused the error' }).optional(),
            },
            {
              name: 'ValidationError',
              description: "Error that occurs when the input doesn't match the expected semantic.",
            },
          ),
        })
        .array(),
    },
    {
      name: 'BadInputError',
      description: "Error that occurs when the input doesn't match the expected format.",
    },
  ),
  UnauthorizedAccess: model.object(
    {
      message: model.literal('Unauthorized access.'),
      details: () => security.PolicyViolation,
    },
    {
      name: 'UnauthorizedAccessError',
      description: 'Error that occurs when a subject is not authorized to access a resource.',
    },
  ),
}
