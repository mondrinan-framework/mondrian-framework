import { m } from '../../src/index'
import { decode } from '@mondrian-framework/model'
import { test, expect } from 'vitest'

const date = m.date()

test('Date - decode', async () => {
  expect(decode(date, '2023-01-01')).toStrictEqual({ success: true, value: new Date('2023-01-01') })
  expect(decode(date, '20230101').success).toBe(false)
  expect(decode(date, '01012023').success).toBe(false)
  expect(decode(date, '01-01-2023').success).toBe(false)
  expect(decode(date, '').success).toBe(false)
  expect(decode(date, 10).success).toBe(false)
  expect(decode(date, true).success).toBe(false)
  expect(decode(date, null).success).toBe(false)
  expect(decode(date, undefined).success).toBe(false)
})
