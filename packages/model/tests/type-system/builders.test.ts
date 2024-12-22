import { model } from '../../src'
import { test } from '@fast-check/vitest'
import { describe, expect } from 'vitest'

//TODO [Good first issue]: test other types constructor

describe('type contructor', () => {
  test('object invalid fields', () => {
    expect(() => model.object({ constructor: model.string() })).toThrowError(
      'Forbidden field name on object: "constructor"',
    )

    expect(() => model.object(Object.fromEntries([['__proto__', model.string()]]))).toThrowError(
      'Forbidden field name on object: "__proto__"',
    )

    expect(() => model.object(Object.fromEntries([['', model.string()]]))).toThrowError(
      'Forbidden field name on object: ""',
    )
  })

  test('number invalid options', () => {
    expect(() => model.integer({ exclusiveMinimum: 1, exclusiveMaximum: 2 })).toThrowError(
      'If both lower bound and upper bound are enabled on integer types the minimum difference between the two bounds must be greater than 1',
    )
    expect(() => model.integer({ minimum: 1, maximum: 0.99 })).toThrowError()
    expect(() => model.integer({ minimum: 1, exclusiveMaximum: 1 })).toThrowError()
    expect(() => model.integer({ exclusiveMinimum: 1, maximum: 1 })).toThrowError()
    expect(model.integer({ exclusiveMinimum: 0.5, minimum: 1, maximum: 1 })).toBeTruthy()
    expect(() => model.integer({ minimum: 1, maximum: 1.99 })).toThrowError()
    expect(() => model.number({ minimum: Number.NaN })).toThrow()
    expect(() => model.number({ maximum: Number.NaN })).toThrow()
    expect(() => model.number({ exclusiveMinimum: Number.NaN })).toThrow()
    expect(() => model.number({ exclusiveMaximum: Number.NaN })).toThrow()
    expect(() => model.number({ minimum: Number.POSITIVE_INFINITY })).toThrow()
    expect(() => model.number({ maximum: Number.POSITIVE_INFINITY })).toThrow()
    expect(() => model.number({ exclusiveMinimum: Number.POSITIVE_INFINITY })).toThrow()
    expect(() => model.number({ exclusiveMaximum: Number.POSITIVE_INFINITY })).toThrow()
  })
})
