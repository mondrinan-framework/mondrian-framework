import { arbitrary, decoding, path, model, validation } from '../src'
import { assertFailure, assertOk } from './testing-utils'
import { test, fc as gen } from '@fast-check/vitest'
import { areSameArray } from '@mondrian-framework/utils'
import { describe, expect, vi } from 'vitest'

/**
 * Check if the result is a validator error that has the given got and
 * path. We do not check the error message as here it is not relevant and may
 * be changing quite frequently.
 */
function checkError(result: validation.Result, expected: { got: unknown; path: path.Path }[]): void {
  const error = assertFailure(result)
  const isExpectedError = compareValidatorErrors(error, expected)
  expect(isExpectedError).toBe(true)
}

function compareValidatorErrors(one: validation.Error[], other: { got: unknown; path: path.Path }[]): boolean {
  const compareSingleErrors = (one: { got: unknown; path: path.Path }, other: { got: unknown; path: path.Path }) => {
    const gotAreEqual =
      one.got === other.got ||
      (Number.isNaN(one.got) && Number.isNaN(other.got)) ||
      (one.got instanceof Date &&
        other.got instanceof Date &&
        (other.got.getTime() === one.got.getTime() ||
          (Number.isNaN(other.got.getTime()) && Number.isNaN(one.got.getTime()))))
    const pathsAreEqual = one.path === other.path
    return gotAreEqual && pathsAreEqual
  }
  const mappedOne = one.map((error) => ({ got: error.got, path: error.path }))
  return areSameArray(mappedOne, other, compareSingleErrors)
}

const mockEncode = () => {
  throw 'test'
}
const mockDecode = () => {
  throw 'test'
}
const mockGenerator = () => {
  throw 'test'
}

const alwaysSuccess = model.custom({
  typeName: 'alwaysSuccess',
  encoder: mockEncode,
  decoder: (v) => decoding.succeed(v),
  validator: () => validation.succeed(),
  arbitrary: mockGenerator,
})
const alwaysFail = model.custom({
  typeName: 'alwaysFail',
  encoder: mockEncode,
  decoder: (v) => decoding.succeed(v),
  validator: (value) => validation.fail('test', value),
  arbitrary: mockGenerator,
})

describe.concurrent('validation.validate', () => {
  describe.concurrent('on number types', () => {
    test.prop([gen.double({ noNaN: true, noDefaultInfinity: true })])('always succeeds if given no options', (n) => {
      assertOk(model.number().validate(n))
    })

    describe.concurrent('checks the number is >= than its minimum', () => {
      const minimum = 11
      const Model = model.number({ minimum })

      const validValue = gen.double({ min: minimum, minExcluded: false, noNaN: true, noDefaultInfinity: true })
      test.prop([validValue])('ok cases', (number) => {
        assertOk(Model.validate(number))
      })

      const invalidValue = gen.double({ max: minimum, maxExcluded: true })
      test.prop([invalidValue])('failing cases', (number) => {
        const expectedError = [{ got: number, path: path.root }]
        checkError(Model.validate(number), expectedError)
      })
    })

    describe.concurrent('checks the number is > than its excluding minimum', () => {
      const exclusiveMinimum = 11
      const Model = model.number({ exclusiveMinimum })

      const validValue = gen.double({ min: exclusiveMinimum, minExcluded: true, noNaN: true, noDefaultInfinity: true })
      test.prop([validValue])('ok cases', (number) => {
        assertOk(Model.validate(number))
      })

      const invalidValue = gen.double({ max: exclusiveMinimum, maxExcluded: false })
      test.prop([invalidValue])('failing cases', (number) => {
        const expectedError = [{ got: number, path: path.root }]
        checkError(Model.validate(number), expectedError)
      })
    })

    describe.concurrent('checks the number is <= than its maximum', () => {
      const maximum = 11
      const Model = model.number({ maximum })

      const validValue = gen.double({ max: maximum, maxExcluded: false, noNaN: true, noDefaultInfinity: true })
      test.prop([validValue])('ok cases', (number) => {
        assertOk(Model.validate(number))
      })

      const invalidValue = gen.double({ min: maximum, minExcluded: true })
      test.prop([invalidValue])('failing cases', (number) => {
        const expectedError = [{ got: number, path: path.root }]
        checkError(Model.validate(number), expectedError)
      })
    })

    describe.concurrent('checks the number is < than its exclusive maximum', () => {
      const exclusiveMaximum = 11
      const Model = model.number({ exclusiveMaximum })

      const validValue = gen.double({ max: exclusiveMaximum, maxExcluded: true, noNaN: true, noDefaultInfinity: true })
      test.prop([validValue])('ok cases', (number) => {
        assertOk(Model.validate(number))
      })

      const invalidValue = gen.double({ min: exclusiveMaximum, minExcluded: false })
      test.prop([invalidValue])('failing cases', (number) => {
        const expectedError = [{ got: number, path: path.root }]
        checkError(Model.validate(number), expectedError)
      })
    })

    describe.concurrent('checks the number is an integer', () => {
      const Model = model.number({ isInteger: true })

      const validValue = gen.integer()
      test.prop([validValue])('ok cases', (number) => {
        assertOk(Model.validate(number))
      })

      const invalidValue = gen.double().filter((n) => !Number.isInteger(n))
      test.prop([invalidValue])('failing cases', (number) => {
        const expectedError = [{ got: number, path: path.root }]
        checkError(Model.validate(number), expectedError)
      })
    })

    test('checks the number with multiple errors', () => {
      const Model = model.number({ isInteger: true, minimum: 0, maximum: 10 })

      const res1 = Model.validate(-1.1, { errorReportingStrategy: 'allErrors' })
      expect(res1.isFailure && res1.error).toEqual([
        { assertion: 'number must be greater than or equal to 0', got: -1.1, path: '$' },
        { assertion: 'number must be an integer', got: -1.1, path: '$' },
      ])

      const res2 = Model.validate(10.1, { errorReportingStrategy: 'allErrors' })
      expect(res2.isFailure && res2.error).toEqual([
        { assertion: 'number must be less than or equal to 10', got: 10.1, path: '$' },
        { assertion: 'number must be an integer', got: 10.1, path: '$' },
      ])

      const res3 = Model.validate(5, { errorReportingStrategy: 'allErrors' })
      expect(res3.isOk).toBe(true)
    })
  })

  describe.concurrent('on string types', () => {
    test.prop([gen.string()])('always succeeds when given no options', (string) => {
      assertOk(model.string().validate(string))
    })

    describe.concurrent('checks the string matches the given regex', () => {
      const Model = model.string({ regex: /^mondrian/ })

      const validValue = gen.string().map((s) => 'mondrian' + s)
      test.prop([validValue])('ok cases', (string) => {
        assertOk(Model.validate(string))
      })

      const invalidValue = gen.string().filter((s) => !s.startsWith('mondrian'))
      test.prop([invalidValue])('failing cases', (string) => {
        const expectedError = [{ got: string, path: path.root }]
        checkError(Model.validate(string), expectedError)
      })
    })

    describe.concurrent('checks the string has the minimum length', () => {
      const minLength = 3
      const Model = model.string({ minLength })

      const validValue = gen.string({ minLength })
      test.prop([validValue])('ok cases', (string) => {
        assertOk(Model.validate(string))
      })

      const invalidValue = gen.string({ maxLength: minLength - 1 })
      test.prop([invalidValue])('failing cases', (string) => {
        const expectedError = [{ got: string, path: path.root }]
        checkError(Model.validate(string), expectedError)
      })
    })

    describe.concurrent('checks the string has the maximum length', () => {
      const maxLength = 3
      const Model = model.string({ maxLength })

      const validValue = gen.string({ maxLength })
      test.prop([validValue])('ok cases', (string) => {
        assertOk(Model.validate(string))
      })

      const invalidValue = gen.string({ minLength: maxLength + 1 })
      test.prop([invalidValue])('failing cases', (string) => {
        const expectedError = [{ got: string, path: path.root }]
        checkError(Model.validate(string), expectedError)
      })
    })
  })

  describe.concurrent('on boolean types', () => {
    test.prop([arbitrary.boolean()])('always succeeds', (Model) => {
      assertOk(Model.validate(true))
      assertOk(Model.validate(false))
    })
  })

  describe.concurrent('on enum types', () => {
    const variants = ['one', 'two', 'three'] as const
    test.prop([arbitrary.enumeration(gen.constant(variants))])('always succeeds', (Model) => {
      assertOk(Model.validate('one'))
      assertOk(Model.validate('two'))
      assertOk(Model.validate('three'))
    })
  })

  describe.concurrent('on literal types', () => {
    const literalValue = gen.oneof(gen.string(), gen.boolean(), gen.integer(), gen.float(), gen.constant(null))
    test.prop([arbitrary.literal(literalValue)])('always succeeds', (Model) => {
      assertOk(Model.validate(Model.literalValue))
    })
  })

  describe.concurrent('on datetime types', () => {
    test.prop([gen.date()])('always succeeds if given no options', (date) => {
      assertOk(model.datetime().validate(date))
    })

    describe.concurrent('checks the datetime is >= than its minimum', () => {
      const minimum = new Date()
      const Model = model.datetime({ minimum })

      const validValue = gen.date({ min: minimum })
      test.prop([validValue])('ok cases', (number) => {
        assertOk(Model.validate(number))
      })

      const invalidValue = gen.date({ max: new Date(minimum.getTime() - 1) })
      test.prop([invalidValue])('failing cases', (date) => {
        const expectedError = [{ got: date, path: path.root }]
        checkError(Model.validate(date), expectedError)
      })
      checkError(Model.validate(new Date('')), [{ got: new Date(''), path: path.root }])
    })

    describe.concurrent('checks the datetime is <= than its maximum', () => {
      const maximum = new Date()
      const Model = model.datetime({ maximum })

      const validValue = gen.date({ max: maximum })
      test.prop([validValue])('ok cases', (number) => {
        assertOk(Model.validate(number))
      })

      const invalidValue = gen.date({ min: new Date(maximum.getTime() + 1) })
      test.prop([invalidValue])('failing cases', (date) => {
        const expectedError = [{ got: date, path: path.root }]
        checkError(Model.validate(date), expectedError)
      })
      checkError(Model.validate(new Date('')), [{ got: new Date(''), path: path.root }])
    })
  })

  describe.concurrent('on timestamp types', () => {
    test.prop([gen.date()])('always succeeds if given no options', (date) => {
      assertOk(model.timestamp().validate(date))
    })

    describe.concurrent('checks the datetime is >= than its minimum', () => {
      const minimum = new Date()
      const Model = model.timestamp({ minimum })

      const validValue = gen.date({ min: minimum })
      test.prop([validValue])('ok cases', (number) => {
        assertOk(Model.validate(number))
      })

      const invalidValue = gen.date({ max: new Date(minimum.getTime() - 1) })
      test.prop([invalidValue])('failing cases', (date) => {
        const expectedError = [{ got: date, path: path.root }]
        checkError(Model.validate(date), expectedError)
      })
      checkError(Model.validate(new Date('')), [{ got: new Date(''), path: path.root }])
    })

    describe.concurrent('checks the datetime is <= than its maximum', () => {
      const maximum = new Date()
      const Model = model.timestamp({ maximum })

      const validValue = gen.date({ max: maximum })
      test.prop([validValue])('ok cases', (number) => {
        assertOk(Model.validate(number))
      })

      const invalidValue = gen.date({ min: new Date(maximum.getTime() + 1) })
      test.prop([invalidValue])('failing cases', (date) => {
        const expectedError = [{ got: date, path: path.root }]
        checkError(Model.validate(date), expectedError)
      })
      checkError(Model.validate(new Date('')), [{ got: new Date(''), path: path.root }])
    })
  })

  describe.concurrent('on unknown types', () => {
    const Model = model.unknown()
    test.prop([gen.anything()])('always succeeds on anything', (anything) => {
      assertOk(Model.validate(anything))
    })
  })

  describe.concurrent('on never types', () => {
    const Model = model.never()
    test.prop([gen.anything()])('never succeeds on anything', (anything) => {
      checkError(Model.validate(anything as never), [{ got: anything, path: path.root }])
    })
  })

  describe.concurrent('on record types', () => {
    const Model = model.record(model.number({ minimum: 20, maximum: 30 }))
    test.prop([
      gen.array(gen.tuple(gen.string(), gen.double({ min: 0, max: 10 })), { minLength: 1 }).map(Object.fromEntries),
    ])('always fails on wrong record fields', (record) => {
      const result = Model.validate(record)
      expect(result.isFailure && result.error.length).toBe(1)
      const result1 = Model.validate(record, { errorReportingStrategy: 'allErrors' })
      expect(result1.isFailure && result1.error.length).toBeGreaterThanOrEqual(Object.keys(record).length)
    })
  })

  describe.concurrent('on optional types', () => {
    test.prop([gen.anything().filter((value) => value !== undefined)])('validates the inner type', (value) => {
      assertOk(alwaysSuccess.optional().validate(value))
      checkError(alwaysFail.optional().validate(value), [{ got: value, path: path.root }])
    })

    test('always succeeds on undefined', () => {
      assertOk(alwaysSuccess.optional().validate(undefined))
      assertOk(alwaysFail.optional().validate(undefined))
    })
  })

  describe.concurrent('on nullable types', () => {
    test.prop([gen.anything().filter((value) => value !== null)])('validates the inner type', (value) => {
      assertOk(alwaysSuccess.nullable().validate(value))
      checkError(alwaysFail.nullable().validate(value), [{ got: value, path: path.root }])
    })

    test('always succeeds on null', () => {
      assertOk(alwaysSuccess.nullable().validate(null))
      assertOk(alwaysFail.nullable().validate(null))
    })
  })

  describe.concurrent('on array types', () => {
    test.prop([gen.array(gen.anything())])('validates its items', (array) => {
      assertOk(alwaysSuccess.array().validate(array))
    })

    test.prop([gen.array(gen.anything(), { minLength: 1 })])('stops at first error by default', (array) => {
      checkError(alwaysFail.array().validate(array), [{ got: array[0], path: path.ofIndex(0) }])
    })

    describe.concurrent('checks min length', () => {
      const minItems = 4
      const Model = model.array(alwaysSuccess, { minItems })

      const validValue = gen.array(gen.anything(), { minLength: minItems })
      test.prop([validValue])('valid values', (value) => {
        assertOk(Model.validate(value))
      })

      const invalidValue = gen.array(gen.anything(), { maxLength: minItems - 1 })
      test.prop([invalidValue])('invalid values', (invalidValue) => {
        checkError(Model.validate(invalidValue), [{ got: invalidValue.length, path: path.ofField('length') }])
      })
    })

    describe.concurrent('checks max length', () => {
      const maxItems = 4
      const Model = model.array(alwaysSuccess, { maxItems })

      const validValue = gen.array(gen.anything(), { maxLength: maxItems })
      test.prop([validValue])('valid values', (value) => {
        assertOk(Model.validate(value))
      })

      const invalidValue = gen.array(gen.anything(), { minLength: maxItems + 1 })
      test.prop([invalidValue])('invalid values', (invalidValue) => {
        checkError(Model.validate(invalidValue), [{ got: invalidValue.length, path: path.ofField('length') }])
      })
    })

    describe.concurrent('when reporting all errors', () => {
      const options = { errorReportingStrategy: 'allErrors' } as const
      const toErrors = (array: any[]) => array.map((value, index) => ({ got: value, path: path.ofIndex(index) }))

      test.prop([gen.array(gen.anything(), { minLength: 1 })])('reports all the errors with its items', (array) => {
        checkError(alwaysFail.array().validate(array, options), toErrors(array))
      })

      test.prop([gen.array(gen.anything(), { maxLength: 4 })])(
        'reports both errors on min length and on single values',
        (array) => {
          const Model = model.array(alwaysFail, { minItems: 5 })
          const errors = toErrors(array)
          errors.unshift({ got: array.length, path: path.ofField('length') })
          checkError(Model.validate(array, options), errors)
        },
      )

      test.prop([gen.array(gen.anything(), { minLength: 4 })])(
        'reports both errors on max length and on single values',
        (array) => {
          const Model = model.array(alwaysFail, { maxItems: 3 })
          const errors = toErrors(array)
          errors.unshift({ got: array.length, path: path.ofField('length') })
          checkError(Model.validate(array, options), errors)
        },
      )
    })
  })

  describe.concurrent('on object types', () => {
    const objectGenerator = gen.record({ field1: gen.anything(), field2: gen.anything() })

    test.prop([objectGenerator])('validates its fields', (object) => {
      const Model = model.object({ field1: alwaysSuccess, field2: alwaysSuccess })
      assertOk(Model.validate(object))
    })

    test.prop([objectGenerator])('stops at first error by default', (object) => {
      const Model = model.object({ field1: alwaysFail, field2: alwaysFail })
      const expectedError = [{ got: object.field1, path: path.ofField('field1') }]
      checkError(Model.validate(object), expectedError)
    })

    describe.concurrent('when reporting all errors', () => {
      const options = { errorReportingStrategy: 'allErrors' } as const

      test.prop([objectGenerator])('reports all the errors with its fields', (object) => {
        const Model = model.object({ field1: alwaysFail, field2: alwaysFail })
        const expectedError = [
          { got: object.field1, path: path.ofField('field1') },
          { got: object.field2, path: path.ofField('field2') },
        ]
        checkError(Model.validate(object, options), expectedError)
      })
    })
  })

  describe.concurrent('on union types', () => {
    test(' variants error correctly', () => {
      const Model = model.union({
        obj: model.object({
          a: model.union({ bln: model.boolean(), uuid: model.uuid(), email: model.string({ minLength: 10 }) }),
        }),
        str: model.object({ a: model.string({ maxLength: 1 }) }),
      })
      const res1 = Model.validate({ a: '123' }, { errorReportingStrategy: 'allErrors' })
      expect(res1.isFailure && res1.error).toStrictEqual([
        { assertion: 'invalid UUID', got: '123', path: '$.a', variants: ['obj', 'uuid'] },
        { assertion: 'string shorter than min length (10)', got: '123', path: '$.a', variants: ['obj', 'email'] },
        { assertion: 'string longer than max length (1)', got: '123', path: '$.a', variants: ['str'] },
      ])
    })
    test.prop([gen.anything()])('succeeds if variant is valid', (value) => {
      const Model = model.union({ variant1: alwaysSuccess, variant2: alwaysFail })
      assertOk(Model.validate(value))
    })

    test.prop([gen.anything()])('fails is variant is invalid', (value) => {
      const Model = model.union({ variant1: alwaysFail, variant2: alwaysFail })
      const expectedError = [
        { assertion: 'test', got: value, path: path.root, variants: ['variant1'] },
        { assertion: 'test', got: value, path: path.root, variants: ['variant2'] },
      ]
      checkError(Model.validate(value), expectedError)
    })
  })

  describe.concurrent('on custom types', () => {
    const options = { errorReportingStrategy: 'allErrors' } as const

    test.prop([gen.anything()])('calls the provided decoder', (value) => {
      // spy function: https://vitest.dev/api/expect.html#tohavebeencalled
      const validationFunction = {
        validate: (v: unknown, o: any) => {
          expect(v).toEqual(value)
          expect(o).toEqual(options)
          return validation.succeed()
        },
      }
      const validationSpy = vi.spyOn(validationFunction, 'validate')
      const Model = model.custom({
        typeName: 'custom',
        encoder: mockEncode,
        decoder: mockDecode,
        validator: validationFunction.validate,
        arbitrary: mockGenerator,
      })
      assertOk(Model.validate(value, options))
      expect(validationSpy).toHaveBeenCalledTimes(1)
    })
  })
})
