import { functions, module, client as clientBuilder, provider, guard } from '../src'
import { model, result } from '@mondrian-framework/model'
import { expect, test } from 'vitest'

test('provider dependencies', async () => {
  const events: string[] = []
  const pv0 = provider.build({
    errors: { invalid: model.string() },
    async body({ a }: { a: string }) {
      if (a !== 'a') {
        return result.fail({ invalid: 'invalid' })
      }
      events.push('pv0')
      return result.ok({ a })
    },
  })
  const pv1 = provider.use({ providers: { pv0 } }).build({
    async body({ b }: { b: string }, { pv0 }) {
      expect(pv0).toEqual({ a: 'a' })
      events.push('pv1')
      return result.ok({ b })
    },
  })
  const pv2 = provider.use({ providers: { pv1 } }).build({
    async body({ c }: { c: string }, { pv1 }) {
      expect(pv1).toEqual({ b: 'b' })
      events.push('pv2')
      return result.ok({ c })
    },
  })
  const pv3 = provider.use({ providers: { pv1, pv2 } }).build({
    async body({ d }: { d: string }, { pv1, pv2 }) {
      expect(pv1).toEqual({ b: 'b' })
      expect(pv2).toEqual({ c: 'c' })
      events.push('pv3')
      return result.ok({ d })
    },
  })

  const g0 = guard.build({
    async body(_: { e: string }) {
      events.push('g0')
    },
  })

  const g1 = guard.use({ providers: { g0, pv1 } }).build({
    async body(_: { f: string }, { g0, pv1 }) {
      expect(g0).toBe(undefined)
      expect(pv1).toEqual({ b: 'b' })
      events.push('g1')
    },
  })

  expect(() =>
    provider.use({ providers: { input: pv0 } }).build({
      async body({}: {}) {
        return result.ok({})
      },
    }),
  ).toThrow('"input" is a reserved name for dependencies.')

  // execution order should be
  // g0, pv0 -> pv1 -> g1, pv2 -> pv3

  const f = functions
    .define({ output: model.string(), errors: { invalid: model.string() } })
    .use({ providers: { pv2, pv1, pv3 }, guards: { g1 } })
    .implement({
      body: async ({ pv1, pv2, pv3 }) => {
        return result.ok(pv1.b + pv2.c + pv3.d)
      },
    })

  const m = module.build({
    name: 'test',
    functions: { f },
  })

  const client = clientBuilder.build({
    module: m,
    async context() {
      return { a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', f: 'f' }
    },
  })

  const client2 = clientBuilder.build({
    module: m,
    async context() {
      return { a: '_', b: 'b', c: 'c', d: 'd', e: 'e', f: 'f' }
    },
  })

  const res = await client.functions.f()
  expect(res.isOk && res.value).toBe('bcd')

  expect(events).toEqual(['g0', 'pv0', 'pv1', 'g1', 'pv2', 'pv3'])

  const res2 = await client2.functions.f()
  expect(res2.isFailure && res2.error.invalid).toBe('invalid')
})
