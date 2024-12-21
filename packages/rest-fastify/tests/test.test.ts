import { rest, sdk } from '../../rest'
import { serve } from '../src'
import { model, result } from '@mondrian-framework/model'
import { functions, module, error, provider } from '@mondrian-framework/module'
import fastify from 'fastify'
import { expect, test } from 'vitest'

test('rest-fastify e2e test', async () => {
  const { Unauthorized } = error.define({
    Unauthorized: { message: 'Authorization required', reason: model.string() },
  })
  const f1 = functions.define({
    input: model.integer(),
    output: model.integer(),
    errors: { BadInput: error.standard.BadInput, Unauthorized },
  })
  const moduleInterface = module.define({
    functions: { f1 },
    name: 'test',
  })
  const restDefinition = rest.define({
    module: moduleInterface,
    version: 2,
    functions: {
      f1: { method: 'get', path: '/f1/{input}', version: { max: 1 } },
    },
  })

  const authProvider = provider.build({
    errors: { Unauthorized },
    async body(input: { authorization: string }) {
      if (input.authorization === 'test') {
        return result.ok()
      } else {
        return result.fail({ Unauthorized: { reason: 'no auth' } })
      }
    },
  })
  const f1Impl = f1.use({ providers: { authProvider } }).implement({
    async body(args) {
      return result.ok(args.input * 2)
    },
  })
  const moduleImpl = moduleInterface.implement({ functions: { f1: f1Impl } })
  const api = rest.build({ ...restDefinition, module: moduleImpl })
  const server = fastify()
  serve({ server, api, context: async ({ request }) => ({ authorization: request.headers.authorization ?? '' }) })

  await server.listen({ port: 4040 })

  const client = sdk.build({
    endpoint: 'http://localhost:4040/',
    rest: restDefinition,
    headers: { authorization: 'test' },
  })

  const response0 = await client.withHeaders({}).functions.f1(123)
  expect(response0.isFailure && response0.error).toEqual({
    Unauthorized: { message: 'Authorization required', reason: 'no auth' },
  })

  const response1 = await client.functions.f1(123)
  expect(response1.isOk && response1.value).toEqual(123 * 2)

  await server.close()
})
