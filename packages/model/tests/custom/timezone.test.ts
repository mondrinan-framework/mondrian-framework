import { types } from '../../src'
import { testTypeEncodingAndDecoding, testWithArbitrary } from './property-helper'
import { describe } from 'vitest'

const knownValidValues = ['Europe/Rome', 'europe/rome', 'europe/Rome', 'EUROPE/ROME', 'Africa/Cairo', 'America/Halifax']
const knownInvalidValues = ['', 'Europe ', 'Rome', 'Europe-Rome', 'Cairo', 'Africa/Halifax', null, undefined, 10, 10.1]

describe(
  'standard property based tests',
  testTypeEncodingAndDecoding(types.timezone(), {
    knownValidValues,
    knownInvalidValues,
  }),
)

describe('arbitrary based test', testWithArbitrary(types.timezone()))