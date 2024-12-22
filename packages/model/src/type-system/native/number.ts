import { model, decoding, validation } from '../..'
import { BaseType } from './base'
import { JSONType } from '@mondrian-framework/utils'
import gen from 'fast-check'

/**
 * @param options the {@link NumberTypeOptions options} used to define the new `NumberType`
 * @throws if the `multipleOf` field of `options` is less than or equal to 0
 * @returns a {@link NumberType `NumberType`} with the given `options`
 * @example Imagine you have to deal with the measurements coming from a thermometer: those values can be thought of as
 *          floating point numbers. A model for such a data type could be defined like this:
 *
 *          ```ts
 *          type Measurement = Infer<typeof measurement>
 *          const measurement = number({
 *            name: "measurement",
 *            description: "a measurement coming from a thermometer",
 *          })
 *
 *          const exampleMeasurement: Measurement = 28.2
 *          ```
 */
export function number(options?: model.NumberTypeOptions): model.NumberType {
  return new NumberTypeImpl(options)
}

/**
 * @param options the {@link model.NumberTypeOptions} used to define the new `NumberType`
 * @returns a {@link model.NumberType} where the `isInteger` flag is set to true
 * @example Imagine you have to deal with the age of a users: it can be thought of as an integer number that can never
 *          be lower than zero. A model for such a data type could be defined like this:
 *
 *          ```ts
 *          type Age = model.Infer<typeof age>
 *          const age = model.integer({
 *            name: "age",
 *            description: "an age that is never negative",
 *            inclusiveMinimum: 0,
 *          })
 *
 *          const exampleAge: Age = 24
 *           ```
 */
export function integer(options?: model.NumberTypeOptions): model.NumberType {
  return number({ ...options, isInteger: true })
}

class NumberTypeImpl extends BaseType<model.NumberType> implements model.NumberType {
  readonly kind = model.Kind.Number
  private readonly validator: validation.Validator<number> | undefined

  protected getThis = () => this
  protected fromOptions = number

  constructor(options?: model.NumberTypeOptions) {
    super(options)
    const { maximum, minimum, exclusiveMaximum, exclusiveMinimum, isInteger } = options ?? {}
    const lowerBound = minimum && exclusiveMinimum ? Math.max(minimum, exclusiveMinimum) : (minimum ?? exclusiveMinimum)
    const upperBound = maximum && exclusiveMaximum ? Math.min(maximum, exclusiveMaximum) : (maximum ?? exclusiveMaximum)
    const exclude = lowerBound === exclusiveMinimum || upperBound === exclusiveMaximum
    if (
      Number.isNaN(maximum ?? 0) ||
      Number.isNaN(minimum ?? 0) ||
      Number.isNaN(exclusiveMaximum ?? 0) ||
      Number.isNaN(exclusiveMinimum ?? 0) ||
      !Number.isFinite(maximum ?? 0) ||
      !Number.isFinite(minimum ?? 0) ||
      !Number.isFinite(exclusiveMaximum ?? 0) ||
      !Number.isFinite(exclusiveMinimum ?? 0)
    ) {
      throw new Error(`maximum, minimum, exclusiveMaximum, exclusiveMinimum shouldn't be NaN`)
    }
    if (lowerBound != null && upperBound != null) {
      if (exclude && lowerBound === upperBound) {
        throw new Error(
          `Lower bound (${lowerBound}) cannot be equal to upper bound (${upperBound})\nmin ${minimum}\nemin ${exclusiveMinimum}\nmax ${maximum}\nemax ${exclusiveMaximum}`,
        )
      }
      if (lowerBound > upperBound) {
        throw new Error(`Lower bound (${lowerBound}) must be lower or equal to the upper bound (${upperBound})`)
      }
      if (options?.isInteger && (!Number.isInteger(lowerBound) || !Number.isInteger(upperBound))) {
        throw new Error('On integer types lower bound and upper bound must be integer numbers')
      }
    }
    if (
      exclusiveMaximum != null &&
      exclusiveMinimum != null &&
      options?.isInteger &&
      exclusiveMaximum - exclusiveMinimum <= 1
    ) {
      throw new Error(
        `If both lower bound and upper bound are enabled on integer types the minimum difference between the two bounds must be greater than 1`,
      )
    }
    this.validator = new validation.Validator(
      //prettier-ignore
      {
        ...(maximum != null ? { [`number must be less than or equal to ${maximum}`]: (value) => !(value <= maximum) } : {}),
        ...(exclusiveMaximum != null ? { [`number must be less than to ${exclusiveMaximum}`]: (value) => !(value < exclusiveMaximum) } : {}),
        ...(minimum != null ? { [`number must be greater than or equal to ${minimum}`]: (value) => !(value >= minimum) } : {}),
        ...(exclusiveMinimum != null ? { [`number must be greater than ${exclusiveMinimum}`]: (value) => !(value > exclusiveMinimum) } : {}),
        ...(isInteger === true ? { [`number must be an integer`]: (value) => !Number.isInteger(value) } : {})
      },
    )
    if (this.validator.isEmpty()) {
      this.validator = undefined
    }
  }

  protected encodeWithoutValidationInternal(value: number): JSONType {
    return value
  }

  protected validateInternal(value: number, options: Required<validation.Options>): validation.Result {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      return validation.fail(`Number must be different to NaN or Infinity`, value)
    }
    if (!this.validator) {
      return validation.succeed()
    }
    return this.validator.apply(value, options)
  }

  protected decodeWithoutValidationInternal(
    value: unknown,
    options: Required<decoding.Options>,
  ): decoding.Result<number> {
    if (typeof value === 'number') {
      return decoding.succeed(value)
    } else if (options.typeCastingStrategy === 'tryCasting' && typeof value === 'string') {
      return numberFromString(value)
    } else {
      return decoding.fail('number', value)
    }
  }

  arbitraryInternal(): gen.Arbitrary<number> {
    function doubleMatchingOptions(options: model.NumberTypeOptions): gen.Arbitrary<number> {
      const { minimum, exclusiveMinimum, maximum, exclusiveMaximum } = options
      const min = selectMinimumDouble(minimum, exclusiveMinimum)
      const max = selectMaximumDouble(maximum, exclusiveMaximum)
      return gen.double({ ...min, ...max, noNaN: true, noDefaultInfinity: true })
    }

    function integerMatchingOptions(options: model.NumberTypeOptions): gen.Arbitrary<number> {
      const { minimum, exclusiveMinimum, maximum, exclusiveMaximum } = options
      const min = selectMinimumInteger(minimum, exclusiveMinimum)
      const max = selectMaximumInteger(maximum, exclusiveMaximum)
      return gen.integer({ min, max })
    }

    function selectMinimumInteger(inclusive: number | undefined, exclusive: number | undefined): number | undefined {
      if (inclusive != null && exclusive != null) {
        if (inclusive > exclusive) {
          return inclusive
        } else {
          return exclusive + 1
        }
      } else if (inclusive != null) {
        return inclusive
      } else if (exclusive != null) {
        return exclusive + 1
      } else {
        return undefined
      }
    }

    function selectMaximumInteger(inclusive: number | undefined, exclusive: number | undefined): number | undefined {
      if (inclusive != null && exclusive != null) {
        if (inclusive < exclusive) {
          return inclusive
        } else {
          return exclusive - 1
        }
      } else if (inclusive != null) {
        return inclusive
      } else if (exclusive != null) {
        return exclusive - 1
      } else {
        return undefined
      }
    }

    function selectMinimumDouble(
      inclusive: number | undefined,
      exclusive: number | undefined,
    ): { minExcluded: boolean; min: number } | undefined {
      if (inclusive != null && exclusive != null) {
        if (inclusive > exclusive) {
          return { minExcluded: false, min: inclusive }
        } else {
          return { minExcluded: true, min: exclusive }
        }
      } else if (inclusive != null) {
        return { minExcluded: false, min: inclusive }
      } else if (exclusive != null) {
        return { minExcluded: true, min: exclusive }
      } else {
        return undefined
      }
    }

    function selectMaximumDouble(
      inclusive: number | undefined,
      exclusive: number | undefined,
    ): { maxExcluded: boolean; max: number } | undefined {
      if (inclusive != null && exclusive != null) {
        if (inclusive < exclusive) {
          return { maxExcluded: false, max: inclusive }
        } else {
          return { maxExcluded: true, max: exclusive }
        }
      } else if (inclusive != null) {
        return { maxExcluded: false, max: inclusive }
      } else if (exclusive != null) {
        return { maxExcluded: true, max: exclusive }
      } else {
        return undefined
      }
    }
    if (this.options) {
      return this.options.isInteger ? integerMatchingOptions(this.options) : doubleMatchingOptions(this.options)
    } else {
      return gen.double({ noNaN: true, noDefaultInfinity: true })
    }
  }
}

function numberFromString(string: string): decoding.Result<number> {
  const number = Number(string)
  if (Number.isNaN(number)) {
    return decoding.fail('number', string)
  } else {
    return decoding.succeed(number)
  }
}
