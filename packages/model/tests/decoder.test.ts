import { decoding, model, path, validation, result } from '../src'
import { assertFailure, assertOk } from './testing-utils'
import { test, fc as gen } from '@fast-check/vitest'
import { areSameArray } from '@mondrian-framework/utils'
import { describe, expect, vi } from 'vitest'

function compareDecoderErrors(one: decoding.Error[], other: decoding.Error[]): boolean {
  const compareSingleErrors = (one: decoding.Error, other: decoding.Error) => {
    const expectedAreEqual = one.expected === other.expected
    const gotAreEqual = one.got === other.got || (Number.isNaN(one.got) && Number.isNaN(other.got))
    const pathsAreEqual = one.path === other.path
    return expectedAreEqual && gotAreEqual && pathsAreEqual
  }
  return areSameArray(one, other, compareSingleErrors)
}

const number = gen.oneof(gen.integer(), gen.double(), gen.float())
const nonString = gen.anything().filter((value) => typeof value !== 'string')
const nonBoolean = gen.anything().filter((value) => typeof value !== 'boolean')
const nonNumber = gen.anything().filter((value) => typeof value !== 'number')
const nonNull = gen.anything().filter((value) => value !== null)
const nonUndefinedAndNonNull = gen.anything().filter((value) => value !== undefined && value !== null)
const nonArray = gen.anything().filter((value) => !(value instanceof Array))
const nonObject = gen.anything().filter((value) => !(typeof value === 'object'))
const nonDate = gen
  .anything()
  .filter(
    (value) => !(value instanceof Date || (typeof value === 'string' && !Number.isNaN(new Date(value).valueOf()))),
  )
const nonTimestamp = gen
  .anything()
  .filter(
    (value) =>
      (typeof value !== 'number' || value > 8640000000000000 || value < -8640000000000000) && !(value instanceof Date),
  )

export function checkError(result: decoding.Result<any>, expectedError: decoding.Error[]): void {
  const error = assertFailure(result)
  const isExpectedError = compareDecoderErrors(error, expectedError)
  expect(isExpectedError).toBe(true)
}

export function checkValue<A>(result: result.Result<A, any>, expectedValue: A): void {
  const value = assertOk(result)
  expect(value).toEqual(expectedValue)
}

describe.concurrent('decoding.decodeWithoutValidation', () => {
  describe.concurrent('boolean value', () => {
    const Model = model.boolean()

    describe.concurrent('without casting', () => {
      const options = { typeCastingStrategy: 'expectExactTypes' } as const

      test.prop([nonBoolean])('fails on non booleans', (value) => {
        const result = Model.decodeWithoutValidation(value, options)
        const expectedError = [{ expected: 'boolean', got: value, path: path.root }]
        checkError(result, expectedError)
      })

      test.prop([gen.boolean()])('can decode booleans', (boolean) => {
        const result = Model.decodeWithoutValidation(boolean, options)
        checkValue(result, boolean)
      })
    })

    describe.concurrent('with casting', () => {
      const options = { typeCastingStrategy: 'tryCasting' } as const

      test('can decode the strings "true" and "false"', () => {
        checkValue(Model.decodeWithoutValidation('true', options), true)
        checkValue(Model.decodeWithoutValidation('false', options), false)
      })

      test('decodes 0 as false', () => {
        checkValue(Model.decodeWithoutValidation(0, options), false)
      })

      test.prop([number.filter((n) => n !== 0)])('decodes non-zero number as true', (n) => {
        checkValue(Model.decodeWithoutValidation(n, options), true)
      })
    })
  })

  describe.concurrent('number value', () => {
    const Model = model.number()

    describe.concurrent('without casting', () => {
      const options = { typeCastingStrategy: 'expectExactTypes' } as const

      test.prop([nonNumber])('fails on non numbers', (value) => {
        const result = Model.decodeWithoutValidation(value, options)
        const expectedError = [{ expected: 'number', got: value, path: path.root }]
        checkError(result, expectedError)
      })

      test.prop([number])('can decode numbers', (n) => {
        checkValue(Model.decodeWithoutValidation(n, options), n)
      })

      test('can decode NaN', () => {
        const result = Model.decodeWithoutValidation(NaN, options)
        if (result.isFailure || !Number.isNaN(result.value)) {
          expect.fail('should work on NaN')
        }
      })
    })

    describe.concurrent('with casting', () => {
      const options = { typeCastingStrategy: 'tryCasting' } as const

      test('works with +-0 strings', () => {
        checkValue(Model.decodeWithoutValidation('+0', options), 0)
        checkValue(Model.decodeWithoutValidation('-0', options), -0)
      })

      test.prop([number.filter((n) => n !== 0 && !Number.isNaN(n))])('can decode number strings', (n) => {
        checkValue(Model.decodeWithoutValidation(n.toString(), options), n)
      })

      test('still fails with non number strings', () => {
        for (const value of ['foo', 'bar', '1.1 not a number']) {
          const result = Model.decodeWithoutValidation(value, options)
          const expectedError = [{ expected: 'number', got: value, path: path.root }]
          checkError(result, expectedError)
        }
      })
    })
  })

  describe.concurrent('string value', () => {
    const Model = model.string()

    describe.concurrent('without casting', () => {
      const options = { typeCastingStrategy: 'expectExactTypes' } as const

      test.prop([nonString])('fails on non strings', (value) => {
        const result = Model.decodeWithoutValidation(value, options)
        const expectedError = [{ expected: 'string', got: value, path: path.root }]
        checkError(result, expectedError)
      })

      test.prop([gen.string()])('can decode strings', (string) => {
        checkValue(Model.decodeWithoutValidation(string, options), string)
      })
    })

    describe.concurrent('with casting', () => {
      const options = { typeCastingStrategy: 'tryCasting' } as const

      test.prop([number])('can decode numbers as strings', (number) => {
        const result = Model.decodeWithoutValidation(number, options)
        checkValue(result, number.toString())
      })

      test.prop([gen.boolean()])('can decode booleans as strings', (boolean) => {
        const result = Model.decodeWithoutValidation(boolean, options)
        checkValue(result, boolean ? 'true' : 'false')
      })
    })
  })

  describe.concurrent('literal value', () => {
    describe.concurrent('literal number', () => {
      const options = { typeCastingStrategy: 'expectExactTypes' } as const
      const literalValue = 1
      const Model = model.literal(literalValue)

      test('can decode the exact same literal', () => {
        checkValue(Model.decodeWithoutValidation(literalValue, options), literalValue)
      })

      test.prop([number.filter((n) => n !== literalValue)])('fails on numbers that are not the literal', (n) => {
        const result = Model.decodeWithoutValidation(n, options)
        const expectedError = [{ expected: 'literal (1)', got: n, path: path.root }]
        checkError(result, expectedError)
      })

      test.prop([nonNumber])('fails on non number values', (value) => {
        const result = Model.decodeWithoutValidation(value, options)
        const expectedError = [{ expected: 'literal (1)', got: value, path: path.root }]
        checkError(result, expectedError)
      })
    })

    describe.concurrent('literal string', () => {
      const options = { typeCastingStrategy: 'expectExactTypes' } as const
      const literalValue = 'mondrian'
      const Model = model.literal(literalValue)

      test('can decode the exact same literal', () => {
        checkValue(Model.decodeWithoutValidation(literalValue, options), literalValue)
      })

      test.prop([gen.string().filter((s) => s !== literalValue)])(
        'fails on strings that are not the literal',
        (string) => {
          const result = Model.decodeWithoutValidation(string, options)
          const expectedError = [{ expected: 'literal (mondrian)', got: string, path: path.root }]
          checkError(result, expectedError)
        },
      )

      test.prop([nonString])('fail on non string values', (value) => {
        const result = Model.decodeWithoutValidation(value, options)
        const expectedError = [{ expected: 'literal (mondrian)', got: value, path: path.root }]
        checkError(result, expectedError)
      })
    })

    describe.concurrent('literal boolean', () => {
      const options = { typeCastingStrategy: 'expectExactTypes' } as const
      const literalValue = true
      const Model = model.literal(literalValue)

      test('can decode the exact same literal', () => {
        checkValue(Model.decodeWithoutValidation(literalValue, options), literalValue)
      })

      test.prop([gen.boolean().filter((b) => b !== literalValue)])(
        'fails on booleans that are not the literal',
        (boolean) => {
          const result = Model.decodeWithoutValidation(boolean, options)
          const expectedError = [{ expected: 'literal (true)', got: boolean, path: path.root }]
          checkError(result, expectedError)
        },
      )

      test.prop([nonBoolean])('fails on non boolean values', (value) => {
        const result = Model.decodeWithoutValidation(value, options)
        const expectedError = [{ expected: 'literal (true)', got: value, path: path.root }]
        checkError(result, expectedError)
      })
    })

    describe.concurrent('literal null', () => {
      const literalValue = null
      const Model = model.null()

      describe.concurrent('without casting', () => {
        const options = { typeCastingStrategy: 'expectExactTypes' } as const

        test('can decode the exact same literal', () => {
          checkValue(Model.decodeWithoutValidation(literalValue, options), literalValue)
        })

        test.prop([nonNull])('fails on non null values', (value) => {
          const result = Model.decodeWithoutValidation(value, options)
          const expectedError = [{ expected: 'null', got: value, path: path.root }]
          checkError(result, expectedError)
        })
      })

      describe.concurrent('with casting', () => {
        const options = { typeCastingStrategy: 'tryCasting' } as const

        test('can decode the "null" string as the null literal', () => {
          checkValue(Model.decodeWithoutValidation('null', options), null)
        })

        test.prop([gen.string().filter((s) => s !== 'null')])('fails on other strings', (string) => {
          const result = Model.decodeWithoutValidation(string, options)
          const expectedError = [{ expected: 'null', got: string, path: path.root }]
          checkError(result, expectedError)
        })
      })
    })

    describe.concurrent('literal undefined', () => {
      const literalValue = undefined
      const Model = model.undefined()

      describe.concurrent('without casting', () => {
        const options = { typeCastingStrategy: 'expectExactTypes' } as const

        test('can decode the exact same literal', () => {
          checkValue(Model.decodeWithoutValidation(literalValue, options), literalValue)
        })

        test.prop([nonUndefinedAndNonNull])('fails on non undefiend and null values', (value) => {
          const result = Model.decodeWithoutValidation(value, options)
          const expectedError = [{ expected: 'undefined', got: value, path: path.root }]
          checkError(result, expectedError)
        })
      })

      test('can decode null as undefined', () => {
        checkValue(Model.decodeWithoutValidation(null), undefined)
      })

      test('allowUndefinedValue option should decode as value if undefined is encountered', () => {
        const l = model.literal('test', { allowUndefinedValue: true })
        const value = l.decode(undefined)
        expect(value.isOk && value.value).toBe('test')
      })
    })
  })

  describe.concurrent('enum variant', () => {
    const variants = ['one', 'two', 'three'] as const
    const Model = model.enumeration(variants)

    test.prop([gen.constantFrom(...variants)])('can decode its variants', (variant) => {
      checkValue(Model.decodeWithoutValidation(variant), variant)
    })

    const nonVariant = gen.string().filter((s) => !(variants as readonly string[]).includes(s))
    test.prop([nonVariant])('fails on non variant strings', (string) => {
      const result = Model.decodeWithoutValidation(string)
      const expectedError = [{ expected: 'enum ("one" | "two" | "three")', got: string, path: path.root }]
      checkError(result, expectedError)
    })

    test.prop([nonString])('fails on non strings', (value) => {
      const result = Model.decodeWithoutValidation(value)
      const expectedError = [{ expected: 'enum ("one" | "two" | "three")', got: value, path: path.root }]
      checkError(result, expectedError)
    })
  })

  describe.concurrent('datetime value', () => {
    const Model = model.datetime()

    describe.concurrent('without casting', () => {
      const options = { typeCastingStrategy: 'expectExactTypes' } as const

      test.prop([nonDate])('fails on non dates', (value) => {
        const result = Model.decodeWithoutValidation(value, options)
        const expectedError = [{ expected: 'ISO date', got: value, path: path.root }]
        checkError(result, expectedError)
      })
      test.prop([
        gen.oneof(
          gen.date(),
          gen.date().map((d) => d.toISOString()),
        ),
      ])('can decode dates', (date) => {
        const result = Model.decodeWithoutValidation(date, options)
        checkValue(result, typeof date === 'string' ? new Date(date) : date)
      })
    })

    describe.concurrent('with casting', () => {
      const options = { typeCastingStrategy: 'tryCasting' } as const
      test.prop([
        gen.oneof(
          gen.date(),
          gen.date().map((d) => d.toISOString()),
          gen.date().map((d) => d.getTime().toString()),
          gen.date().map((d) => d.getTime()),
        ),
      ])('can decode unixtime', (date) => {
        const result = Model.decodeWithoutValidation(date, options)
        checkValue(
          result,
          date instanceof Date
            ? date
            : typeof date === 'number'
              ? new Date(date)
              : Number.isNaN(Number(date))
                ? new Date(date)
                : new Date(Number(date)),
        )
      })
    })
  })

  describe.concurrent('timestamp value', () => {
    const Model = model.timestamp()

    describe.concurrent('without casting', () => {
      const options = { typeCastingStrategy: 'expectExactTypes' } as const

      test.prop([nonTimestamp])('fails on non timestamp', (value) => {
        const result = Model.decodeWithoutValidation(value, options)
        const expectedError = [{ expected: 'timestamp', got: value, path: path.root }]
        checkError(result, expectedError)
      })

      test.prop([
        gen.oneof(
          gen.date(),
          gen.date().map((d) => d.getTime()),
        ),
      ])('can decode dates', (date) => {
        const result = Model.decodeWithoutValidation(date, options)
        checkValue(result, typeof date === 'number' ? new Date(date) : date)
      })
    })

    describe.concurrent('with casting', () => {
      const options = { typeCastingStrategy: 'tryCasting' } as const

      test.prop([
        gen.oneof(
          gen.date(),
          gen.date().map((d) => d.toISOString()),
          gen.date().map((d) => d.getTime().toString()),
          gen.date().map((d) => d.getTime()),
        ),
      ])('can decode unixtime', (date) => {
        const result = Model.decodeWithoutValidation(date, options)
        checkValue(
          result,
          date instanceof Date
            ? date
            : typeof date === 'number'
              ? new Date(date)
              : Number.isNaN(Number(date))
                ? new Date(date)
                : new Date(Number(date)),
        )
      })
    })
  })

  describe.concurrent('unknown value', () => {
    const Model = model.unknown()
    test.prop([gen.anything()])('can always decode anything', (anything) => {
      const result = Model.decodeWithoutValidation(anything)
      checkValue(result, anything)
    })
  })

  describe.concurrent('never value', () => {
    const Model = model.never()
    test.prop([gen.anything()])('can never decode anything', (anything) => {
      const result = Model.decodeWithoutValidation(anything)
      const expectedError = [{ expected: 'never', got: anything, path: path.root }]
      checkError(result, expectedError)
    })
  })

  describe.concurrent('record value', () => {
    const Model = model.record(model.number())
    describe.concurrent('without casting', () => {
      const options = { typeCastingStrategy: 'expectExactTypes' } as const

      test.prop([nonObject])('fails on non object', (value) => {
        const result = Model.decodeWithoutValidation(value, options)
        const expectedError = [{ expected: 'object', got: value, path: path.root }]
        checkError(result, expectedError)
      })

      test.prop([gen.array(gen.tuple(gen.string(), nonNumber), { minLength: 1 }).map(Object.fromEntries)])(
        'fails on records of non number',
        (value) => {
          const result = Model.decodeWithoutValidation(value, options)
          expect(result.isFailure && result.error[0].expected).toBe('number')
        },
      )

      test.prop([gen.array(gen.tuple(gen.string(), nonNumber), { minLength: 1 }).map(Object.fromEntries)])(
        'fails on records of non number with every error',
        (value) => {
          const result = Model.decodeWithoutValidation(value, { errorReportingStrategy: 'allErrors', ...options })
          expect(result.isFailure && result.error[0].expected).toBe('number')
          expect(result.isFailure && result.error.length).toBe(Object.keys(value).length)
        },
      )

      test.prop([gen.array(gen.tuple(gen.string(), gen.double())).map(Object.fromEntries)])(
        'can decode records',
        (record) => {
          const result = Model.decodeWithoutValidation(record, options)
          checkValue(result, record)
        },
      )

      test('distinct', () => {
        const Model = model.array(model.number(), { distinct: true, minItems: 2 })
        const result1 = Model.decodeWithoutValidation([1, 2, 3, 1, 2, 3], options)
        checkValue(result1, [1, 2, 3])

        const result2 = Model.decodeWithoutValidation([2, 3, 3, 1, 2, 3, 1, 2, 3, 3, 3], options)
        checkValue(result2, [2, 3, 1])

        const result3 = Model.decodeWithoutValidation([1, 1, 1, 1], options)
        checkValue(result3, [1])
      })
    })
  })

  describe.concurrent('optional value', () => {
    const Model = model.number().optional()

    test('decodes null as undefined', () => {
      checkValue(Model.decodeWithoutValidation(null), undefined)
    })

    test('decodes undefined as undefined', () => {
      checkValue(Model.decodeWithoutValidation(undefined), undefined)
    })

    test('decodes wrapped type', () => {
      checkValue(Model.decodeWithoutValidation(1), 1)
    })

    test.prop([nonNumber.filter((n) => n !== null && n !== undefined)])('fails on other values', (value) => {
      const result = Model.decodeWithoutValidation(value)
      const expectedError = [{ expected: 'number or undefined', got: value, path: path.root }]
      checkError(result, expectedError)
    })
  })

  describe.concurrent('nullable value', () => {
    const Model = model.number().nullable()

    describe.concurrent('without casting', () => {
      const options = { typeCastingStrategy: 'expectExactTypes' } as const

      test('decodes null as null', () => {
        checkValue(Model.decodeWithoutValidation(null, options), null)
      })

      test('decodes wrapped type', () => {
        checkValue(Model.decodeWithoutValidation(1, options), 1)
      })

      test.prop([nonNumber.filter((n) => n !== null)])('fails on other values', (value) => {
        const result = Model.decodeWithoutValidation(value, options)
        const expectedError = [{ expected: 'number or null', got: value, path: path.root }]
        checkError(result, expectedError)
      })
    })

    describe.concurrent('with casting', () => {
      const options = { typeCastingStrategy: 'tryCasting' } as const

      test('can decode undefined as null', () => {
        checkValue(Model.decodeWithoutValidation(undefined, options), null)
      })
    })
  })

  describe.concurrent('array value', () => {
    const Model = model.number().array()

    describe.concurrent('without casting', () => {
      const options = { typeCastingStrategy: 'expectExactTypes' } as const
      test.prop([gen.array(number)])('decodes an array of values', (array) => {
        checkValue(Model.decodeWithoutValidation(array, options), array)
      })

      test.prop([nonArray])('fails with non arrays', (value) => {
        const result = Model.decodeWithoutValidation(value, options)
        const expectedError = [{ expected: 'array', got: value, path: path.root }]
        checkError(result, expectedError)
      })

      test('stops at first error by default', () => {
        const value = [0, 1, 'error1', 'error2']
        const result = Model.decodeWithoutValidation(value, options)
        const expectedError = [{ expected: 'number', got: 'error1', path: path.ofIndex(2) }]
        checkError(result, expectedError)
      })

      describe.concurrent('when reportingAllErrors', () => {
        const options = { typeCastingStrategy: 'expectExactTypes', errorReportingStrategy: 'allErrors' } as const
        test('reports all errors', () => {
          const value = [0, 1, 'error1', 'error2']
          const result = Model.decodeWithoutValidation(value, options)
          const expectedError = [
            { expected: 'number', got: 'error1', path: path.ofIndex(2) },
            { expected: 'number', got: 'error2', path: path.ofIndex(3) },
          ]
          checkError(result, expectedError)
        })
      })
    })

    describe.concurrent('with casting', () => {
      const options = { typeCastingStrategy: 'tryCasting' } as const

      test('can decode array-like object with numeric keys', () => {
        const object = { 1: 11, 0: 10, 2: 12 }
        const result = Model.decodeWithoutValidation(object, options)
        checkValue(result, [10, 11, 12])
      })

      test('can decode array-like empty object', () => {
        const object = {}
        const result = Model.decodeWithoutValidation(object, options)
        checkValue(result, [])
      })

      test('can decode array-like object with numeric string keys', () => {
        const object = { '1': 11, '0': 10, '2': 12 }
        const result = Model.decodeWithoutValidation(object, options)
        checkValue(result, [10, 11, 12])
      })

      test('can decode array-like object with numeric keys 2', () => {
        const object = {
          '0': 0,
          '1': 1,
          '2': 2,
          '3': 3,
          '4': 4,
          '5': 5,
          '6': 6,
          '7': 7,
          '8': 8,
          '9': 9,
          '10': 10,
          '11': 11,
        }
        const result = Model.decodeWithoutValidation(object, options)
        checkValue(result, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
      })

      test('fails on non array-like objects', () => {
        const failingObjects = [{ 0: 10, 2: 12 }, { 1: 11, 2: 12 }, { notNumber: 10 }]
        for (const object of failingObjects) {
          const result = Model.decodeWithoutValidation(object, options)
          const expectedError = [{ expected: 'array', got: object, path: path.root }]
          checkError(result, expectedError)
        }
      })

      test('reports errors with correct indices', () => {
        const object = { 1: 11, 0: 10, 2: 'error' }
        const result = Model.decodeWithoutValidation(object, options)
        const expectedError = [{ expected: 'number', got: 'error', path: path.ofIndex(2) }]
        checkError(result, expectedError)
      })
    })
  })

  describe.concurrent('object value', () => {
    const Model = model.object({
      field1: model.number(),
      field2: model.number().optional(),
    })

    const validObject = gen.record(
      {
        field1: number,
        field2: number,
      },
      { requiredKeys: ['field1'] },
    )

    test.prop([validObject])('decodes its fields', (object) => {
      checkValue(Model.decodeWithoutValidation(object), object)
    })

    test('fail when a required field is missing', () => {
      const object = { field2: 10 }
      const result = Model.decodeWithoutValidation(object)
      const expectedError = [{ expected: 'number', got: undefined, path: path.ofField('field1') }]
      checkError(result, expectedError)
    })

    test('fail when null is given instead of an empty object', () => {
      const object = null
      const result = model.object({}).decodeWithoutValidation(object)
      const expectedError = [{ expected: 'object', got: null, path: path.root }]
      checkError(result, expectedError)
    })

    test('works when null is given instead of an empty object while casting', () => {
      const object = null
      checkValue(model.object({}).decodeWithoutValidation(object, { typeCastingStrategy: 'tryCasting' }), {})
    })

    test('works when non required field is missing', () => {
      const object = { field1: 1 }
      checkValue(Model.decodeWithoutValidation(object), object)
    })

    test('works with more than needed fields', () => {
      const object = { field1: 1, field3: 1 }
      checkValue(Model.decodeWithoutValidation(object, { fieldStrictness: 'allowAdditionalFields' }), { field1: 1 })
      checkError(Model.decodeWithoutValidation(object), [
        { expected: 'undefined', got: 1, path: path.ofField('field3') },
      ])
    })

    test('stops at first error by default', () => {
      const object = { field1: 'error1', field2: 'error2' }
      const result = Model.decodeWithoutValidation(object)
      const expectedError = [{ expected: 'number', got: 'error1', path: path.ofField('field1') }]
      checkError(result, expectedError)
    })

    test('treats null as an empty object', () => {
      const result = Model.decodeWithoutValidation(null, { typeCastingStrategy: 'tryCasting' })
      const expectedError = [{ expected: 'number', got: undefined, path: path.ofField('field1') }]
      checkError(result, expectedError)
    })

    test('treats undefined fields correctly', () => {
      checkValue(
        model
          .object({
            a: model.undefined(),
          })
          .decode({}),
        { a: undefined },
      )

      checkValue(
        model
          .object({
            a: model.undefined(),
          })
          .decode({ a: undefined }),
        { a: undefined },
      )

      checkValue(
        model
          .object({
            a: model.undefined().optional(),
          })
          .decode({}),
        {},
      )
    })

    test.prop([nonObject])('fails on non objects', (value) => {
      const result = Model.decodeWithoutValidation(value)
      const expected = [{ expected: 'object', got: value, path: path.root }]
      checkError(result, expected)
    })

    describe.concurrent('when reporting all errors', () => {
      const options = { errorReportingStrategy: 'allErrors' } as const

      test('reports all errors in decoding its fields', () => {
        const object = { field1: 'error1', field2: 'error2' }
        const result = Model.decodeWithoutValidation(object, options)
        const expectedError = [
          { expected: 'number', got: 'error1', path: path.ofField('field1') },
          { expected: 'number or undefined', got: 'error2', path: path.ofField('field2') },
        ]
        checkError(result, expectedError)
      })
    })
  })

  describe.concurrent('union value', () => {
    const Model = model.union({ variant1: model.number(), variant2: model.string().optional() })

    test.prop([number.filter((n) => n % 2 === 0)])('can decode its variant', (number) => {
      checkValue(Model.decodeWithoutValidation(number), number)
    })

    test.prop([gen.string()])('can decode its other variant', (string) => {
      checkValue(Model.decodeWithoutValidation(string), string)
    })

    test('can decode its other missing variant', () => {
      checkValue(Model.decodeWithoutValidation(null), undefined)
    })

    test('fails with non correct value', () => {
      const result = Model.decodeWithoutValidation({})
      expect(result.isFailure && result.error.length).toBe(2)
    })

    test('get the correct variant with ambiguos (but correct) value', () => {
      const Model = model.union({
        v1: model.number({ minimum: 0, maximum: 10 }),
        v2: model.number({ minimum: 20, maximum: 30 }),
      })
      checkValue(Model.decodeWithoutValidation(25), 25)
    })

    test('get the first variant with ambiguos value', () => {
      const Model = model.union({
        v1: model.number({ minimum: 0, maximum: 10 }),
        v2: model.number({ minimum: 20, maximum: 30 }),
      })
      checkValue(Model.decodeWithoutValidation(40), 40)
    })

    test('do to not cast if a variant can decode without casting', () => {
      const Model = model.union({
        v1: model.number(),
        v2: model.string(),
      })
      checkValue(Model.decodeWithoutValidation('25', { typeCastingStrategy: 'tryCasting' }), '25')
    })

    test('cast if no variants can decode without casting', () => {
      const Model = model.union({
        v0: model.boolean(),
        v1: model.number(),
        v2: model.integer(),
      })
      checkValue(Model.decodeWithoutValidation('25', { typeCastingStrategy: 'tryCasting' }), 25)
    })
  })

  describe.concurrent('custom type', () => {
    const options: Required<decoding.Options> = {
      typeCastingStrategy: 'tryCasting',
      errorReportingStrategy: 'allErrors',
      fieldStrictness: 'allowAdditionalFields',
    }
    test.prop([gen.anything()])('calls the provided decoder', (value) => {
      // spy function: https://vitest.dev/api/expect.html#tohavebeencalled
      const decoderFunction = {
        decode: (v: unknown, o: any) => {
          expect(v).toEqual(value)
          expect(o).toEqual(options)
          return decoding.succeed(1)
        },
      }
      const decoderSpy = vi.spyOn(decoderFunction, 'decode')

      const Model = model.custom<'custom', {}, number>({
        typeName: 'custom',
        encoder: () => null,
        decoder: decoderFunction.decode,
        validator: () => validation.fail('test', 'test'),
        arbitrary: () => gen.double(),
      })
      checkValue(Model.decodeWithoutValidation(value, options), 1)
      expect(decoderSpy).toHaveBeenCalledTimes(1)
    })
  })
})

describe.concurrent('decoding.decode', () => {
  test.prop([gen.anything()])('should perform validation', (value) => {
    const options = { foo: 'bar', baz: 1 }
    const validationOptions = { errorReportingStrategy: 'allErrors' } as const
    const mocks = {
      encode: () => {
        throw 'test'
      },
      decode: (_: any) => decoding.succeed('decoded successfully'),
      validate: (innerValue: any, innerValidationOptions: any, innerOptions: any) => {
        expect(innerValue).toEqual('decoded successfully')
        expect(innerValidationOptions).toEqual(validationOptions)
        expect(innerOptions).toEqual(options)
        return validation.succeed()
      },
      arbitrary: () => gen.constant('test'),
    }
    const validateSpy = vi.spyOn(mocks, 'validate')
    const decodeSpy = vi.spyOn(mocks, 'decode')
    const Model = model.custom({
      typeName: 'test',
      encoder: mocks.encode,
      decoder: mocks.decode,
      validator: mocks.validate,
      arbitrary: mocks.arbitrary,
      options,
    })
    checkValue(Model.decode(value, {}, validationOptions), 'decoded successfully')
    expect(validateSpy).toBeCalledTimes(1)
    expect(decodeSpy).toBeCalledTimes(1)
  })
})

describe.concurrent('datetime value', () => {
  const Model = model.datetime()
  test.prop([gen.date()])('can decode date', (date) => {
    checkValue(Model.decodeWithoutValidation(date), date)
  })

  test.prop([gen.integer({ min: -8640000000000000, max: 8640000000000000 })])('can decode integer', (number) => {
    checkValue(Model.decodeWithoutValidation(number, { typeCastingStrategy: 'tryCasting' }), new Date(number))
  })
})

describe.concurrent('timestamp value', () => {
  const Model = model.timestamp()
  test.prop([gen.date()])('can decode date', (date) => {
    checkValue(Model.decodeWithoutValidation(date), date)
  })

  test.prop([gen.integer({ min: -8640000000000000, max: 8640000000000000 })])('can decode integer', (number) => {
    checkValue(Model.decodeWithoutValidation(number), new Date(number))
  })
})

describe.concurrent('record value', () => {
  const Model = model.record(model.unknown())
  test.prop([gen.array(gen.tuple(gen.string(), gen.anything())).map(Object.fromEntries)])(
    'can decode record',
    (record) => {
      checkValue(Model.decodeWithoutValidation(record), record)
    },
  )
})

test('decode default value', () => {
  const Model = model.object({ a: model.number() }, { defaultDecodeValue: { a: 1 } })
  checkValue(Model.decode(undefined), { a: 1 })

  const Model2 = model.optional(Model)
  checkValue(Model2.decode(undefined), undefined)

  const Model4 = model.optional(Model, { defaultDecodeValue: { a: 2 } })
  checkValue(Model4.decode(undefined), { a: 2 })
})

test('Decoding array as object', () => {
  const Model = model.object({ a: model.number() })
  const value = [{ a: 1 }]
  const res = Model.decode(value)
  checkError(res as any, [{ expected: 'object', got: value, path: path.root }])
})
