import { result, path } from './index'

/**
 * The options that can be used when validating a type:
 * - `errorReportingStrategy` its possible values are:
 *   - `"stopAtFirstError"`: the validation process will stop and fail at the
 *      first error it encounters
 *   - `"allErrors"`: the validation process will try to gather as much errors
 *     as possible before failing
 */
export type Options = {
  readonly errorReportingStrategy?: 'allErrors' | 'stopAtFirstError'
}

/**
 * The default recommended options to be used in the validation process.
 */
export const defaultOptions: Required<Options> = {
  errorReportingStrategy: 'stopAtFirstError',
}

/**
 * Fills the given options with the default values for the missing fields.
 */
export function fillOptions(options: Options | undefined): Required<Options> {
  if (options?.errorReportingStrategy != null) {
    return options as Required<Options>
  }
  return defaultOptions
}

/**
 * The result of the validation process: it could either be `true` in case of success or
 * an array of {@link Error validation errors} in case of failure.
 */
export type Result = result.Result<true, Error[]>

/**
 * An error that may take place in the validation process:
 *  - `assertion`: a string describing the assertion that failed
 *  - `got`: is the value that broke the assertion
 *  - `path`: is the path where the failure took place
 *  - `variants` is an optional field that is used to signal in which union variants the error took place
 *     the value is the variant name since they are tagged.
 *
 * @example Consider the following error:
 *          ```ts
 *          { assertion: "number should be < 10", got: 11, path: "$[1].foo" }
 *          ```
 *          Let's see step by step what this means:
 *          - `assertion: "number should be < 10"` the validation expected to find a number lower than 10
 *          - `got: 11` but it got a value `11`, which is not < 10
 *          - `path: "$[1].foo"` the error took place while validating a field called `foo`
 *            in an object at index 1 of an array
 */
export type Error = {
  path: path.Path
  assertion: string
  got: unknown
  variants?: string[]
}

/**
 * @returns a {@link Result validation result} that always succeeds with the literal `true`
 */
export const succeed: () => result.Ok<true> = () => result.ok(true)

/**
 * @param errors the errors that made the validation process fail
 * @returns a {@link Result `Result`} that fails with the given array of errors.
 *          Most of the times, unless you explicitly need to fail with multiple errors,
 *          {@link fail `fail`} is the function that will best suit your needs
 * @example this function can be useful when implementing validators for custom types.
 *          Consider this custom validation function:
 *          ```ts
 *          function alwaysFail(_value: unknown): validation.Result {
 *            const errors = [
 *              { assertion: "foo", got: null, path: path.root },
 *              { assertion: "bar", got: null, path: path.root },
 *            ]
 *            return validation.failWithErrors(errors)
 *          }
 *          ```
 *          This validator always fails with a default list of errors
 */
export const failWithErrors = (errors: Error[]): result.Failure<Error[]> => result.fail(errors)

/**
 * @param assertion the assertion that failed
 * @param got the actual value that broke the assertion
 * @returns a {@link Result `Result`} that fails with a single error with an empty path and the provided
 *          `assertion` and `got` values
 * @example this function can be handy when implementing validators for custom types. Consider this
 *          validator function that validates non-empty lists:
 *          ```ts
 *          function validateNonEmpty<A>(list: A[]): validation.Result {
 *            return list.length > 0
 *              ? validator.succeed()
 *              : validator.fail("the list should have at least one item", list)
 *          }
 *          validateNonEmpty([])
 *          // -> [{ assertion: "the list should have at least one item", got: [], path: path.root }]
 *          ```
 */
export function fail(assertion: string, got: unknown): result.Failure<Error[]> {
  return failWithErrors([{ assertion, got, path: path.root }])
}

export function buildValidator<T>(
  errorMap: Record<string, (value: T) => unknown>,
): (value: T, options: Required<Options>) => Result {
  const validator = new Validator(errorMap)
  return (value, options) => validator.apply(value, options)
}

/**
 * Performs a check with the given check map by handling the errorReportingStrategy of the validation options.
 * @param value The value to validate
 * @param errorMap The map of checks to perform, the key is used as error message, the value is a function that determine if there is a validatio error
 * @param options the validation options
 * @returns a validation result
 */
export class Validator<T> {
  private readonly errorMap: [string, (value: T) => unknown][]

  constructor(errorMap: Record<string, (value: T) => unknown>) {
    this.errorMap = Object.entries(errorMap)
  }

  isEmpty() {
    return this.errorMap.length === 0
  }

  apply(value: T, options: Required<Options>) {
    if (options.errorReportingStrategy === 'allErrors') {
      const errors: Error[] = []
      for (const [errorMessage, condition] of this.errorMap) {
        if (condition(value)) {
          errors.push(...fail(errorMessage, value).error)
        }
      }
      if (errors.length > 0) {
        return failWithErrors(errors)
      } else {
        return succeed()
      }
    } else {
      for (const [errorMessage, condition] of this.errorMap) {
        if (condition(value)) {
          return fail(errorMessage, value)
        }
      }
      return succeed()
    }
  }
}
