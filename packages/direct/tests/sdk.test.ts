import { DEFAULT_SERVE_OPTIONS } from '../src/api'
import { build as buildApi } from '../src/api'
import { build } from '../src/client'
import { fromModule } from '../src/handler'
import { api } from './module.util'
import { module } from '@mondrian-framework/module'
import http from 'node:http'
import { expect, test, describe } from 'vitest'

const handler = fromModule({
  api,
  async context(context, metadata) {
    if (metadata?.auth !== 'ok') {
      throw new Error('Unauthorized')
    }
    return 'ok'
  },
  options: { ...DEFAULT_SERVE_OPTIONS, introspection: true },
})
const client = build({ endpoint: handler, api }).withMetadata({ auth: 'ok' })

describe('direct client', () => {
  test('callign a function with no errors, no retrieve, should work', async () => {
    const r1 = await client.functions.ping(123)
    expect(r1).toBe(123)
  })

  test('callign a function with no errors, no retrieve, that throws (error) should throws', async () => {
    await expect(client.functions.ping(-123)).rejects.toThrow('Negative ping')
  })

  test('callign a function with no errors, no retrieve, that throws (non error) should throws', async () => {
    await expect(client.functions.ping(-1.1)).rejects.toThrow('Function throws')
  })

  test('callign a function with no errors, no retrieve but WRONG INPUT should fail', async () => {
    await expect(() => client.functions.ping('abc' as any)).rejects.toThrow('Invalid input.')
  })

  test('callign a function with no errors, retrieve and never input should work', async () => {
    const r1 = await client.functions.getUsers()
    expect(r1).toEqual([{ name: 'John' }])

    const r2 = await client.functions.getUsers(undefined, { retrieve: { select: {} } })
    expect(r2).toEqual([{}])
  })

  test('callign a function with errors, no retrieve should work', async () => {
    const r1 = await client.functions.divideBy({ dividend: 4, divisor: 2 })
    expect(r1.isOk && r1.value).toBe(2)

    const r2 = await client.functions.divideBy({ dividend: 4, divisor: 0 })
    expect(r2.isFailure && r2.error).toEqual({ dividingByZero: 'divisor is 0' })
  })

  test('omitted function should have no handler', async () => {
    expect((client.functions as any).omitted).toBe(undefined)
  })
})

describe('edge cases', () => {
  test('module without functions should throw exception', async () => {
    const r1 = await fromModule({
      api: buildApi({
        module: module.build({
          functions: {},
          name: '',
        }),

        exclusions: {},
      }),
      async context(metadata, request) {
        return {}
      },
      options: { ...DEFAULT_SERVE_OPTIONS, introspection: true },
    })({ request: { body: {}, headers: {}, method: 'post', params: {}, query: {}, route: '/' }, serverContext: null })
    expect(r1).toEqual({
      body: {
        additionalInfo: 'This module does not expose any function',
        reason: 'No function available',
        success: false,
      },
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  })

  test('request without function name should throw exception', async () => {
    const r1 = await handler({
      request: { body: {}, headers: {}, method: 'post', params: {}, query: {}, route: '/' },
      serverContext: null,
    })
    expect(r1).toEqual({
      body: {
        additionalInfo: {
          expected: "One of ['ping', 'getUsers', 'divideBy']",
          path: '$.function',
        },
        reason: 'Error while decoding request',
        success: false,
      },
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  })

  test('request without malformed body should throw exception', async () => {
    const r1 = await handler({
      request: {
        body: { function: 'ping', metadata: 'lol' },
        headers: {},
        method: 'post',
        params: {},
        query: {},
        route: '/',
      },
      serverContext: null,
    })
    expect(r1).toEqual({
      body: {
        additionalInfo: {
          expected: 'object or undefined',
          got: 'lol',
          path: '$.metadata',
        },
        reason: 'Error while decoding request',
        success: false,
      },
      headers: {
        'Content-Type': 'application/json',
      },
      status: 200,
    })
  })

  test('not 200 responses should throws error (endpoint)', async () => {
    const server = http.createServer({}, async (_, response) => {
      response.writeHead(500, { 'Content-Type': 'application/json' })
      response.write(JSON.stringify({ message: 'error' }))
      response.end()
    })
    server.listen(50125)

    const client = build({ endpoint: 'http://localhost:50125', api })

    await expect(client.functions.ping(1)).rejects.toThrow('Unexpected status code: 500. ')

    server.close()
  })

  test('not 200 responses should throws error (handler)', async () => {
    const client = build({
      endpoint: async () => {
        return {
          body: 'error',
          status: 500,
        }
      },
      api,
    })
    await expect(client.functions.ping(1)).rejects.toThrow('Unexpected status code: 500. error')

    const client2 = build({
      endpoint: async () => {
        return {
          body: { message: 'error' },
          status: 500,
        }
      },
      api,
    })
    await expect(client2.functions.ping(1)).rejects.toThrow('Unexpected status code: 500. {"message":"error"}')
  })

  test('invalid response should fail while decoding', async () => {
    const client = build({
      endpoint: async () => {
        return {
          body: {},
          status: 200,
        }
      },
      api,
    })
    await expect(client.functions.ping(1)).rejects.toThrow('Error while decoding response')
  })

  test('getting a failure for a function that does not have errors should throw', async () => {
    const client = build({
      endpoint: async () => {
        return {
          body: { success: true, failure: {} },
          status: 200,
        }
      },
      api,
    })
    await expect(client.functions.ping(1)).rejects.toThrow(
      'Failure should not be present because the function does not declare errors',
    )
  })

  test('additional headers on request should be propagated correctly', async () => {
    const client = build({
      endpoint: async ({ request }) => {
        if (request.headers.additional !== '123') {
          return { body: 'Internal server error', status: 500 }
        } else {
          return { body: { success: true, result: 1 }, status: 200 }
        }
      },
      api,
      fetchOptions: { headers: { additional: '123' } },
    })
    const r1 = await client.functions.ping(1)
    expect(r1).toBe(1)
  })
})
