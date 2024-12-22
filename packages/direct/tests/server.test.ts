import { build } from '../src/client'
import { serveWithFastify } from '../src/server/fastify'
import { api } from './module.util'
import { fastify } from 'fastify'
import { expect, test } from 'vitest'

test('fastify server', async () => {
  const server = fastify()
  serveWithFastify({
    server,
    api,
    async context(serverContext, metadata) {
      return {}
    },
    options: { introspection: true },
  })
  const address = await server.listen({ port: 1234 })

  const client = build({ endpoint: `${address}/mondrian`, api })
  const r1 = await client.functions.ping(123)
  expect(r1).toBe(123)

  const r2 = await fetch(`${address}/mondrian`, { redirect: 'manual' })
  expect(r2.status).toBe(200)
  await server.close()
})
