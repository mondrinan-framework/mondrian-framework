import { serve } from '../src'
import { model, result } from '@mondrian-framework/model'
import { functions, module, error, provider, retrieve } from '@mondrian-framework/module'
import { rest, sdk } from '@mondrian-framework/rest'
import fastify from 'fastify'
import { expect, test } from 'vitest'

test('rest-fastify e2e test', async () => {
  const User = () =>
    model.entity(
      {
        id: model.string(),
        name: model.string(),
        age: model.integer(),
        friends: model.array(User),
        retrieve: model.unknown(),
      },
      {
        retrieve: {
          where: true,
          skip: true,
          orderBy: true,
          take: true,
        },
      },
    )
  const UserInput = model.object({
    name: model.string(),
    age: model.integer(),
    friends: model.array(model.string()),
  })
  const { Unauthorized } = error.define({
    Unauthorized: { message: 'Authorization required', reason: model.string() },
  })
  const f1 = functions.define({
    input: model.integer(),
    output: model.integer(),
    errors: { BadInput: error.standard.BadInput, Unauthorized },
  })
  const f2 = functions.define({
    input: model.object({ a: model.integer(), b: model.integer() }),
    output: model.integer(),
    errors: { BadInput: error.standard.BadInput, Unauthorized },
  })
  const fComplex = functions.define({
    input: UserInput,
    output: model.array(User),
    retrieve: { select: true, where: true, orderBy: true, skip: true, take: true },
    errors: { BadInput: error.standard.BadInput, Unauthorized },
    options: { operation: { command: 'create' } },
  })
  const moduleInterface = module.define({
    functions: { f1, f2, f3: f2, f4: f2, f5: f2, fComplex },
    name: 'test',
  })
  const restDefinition = rest.define({
    module: moduleInterface,
    version: 2,
    functions: {
      f1: { method: 'get', path: '/f1/{input}', version: { max: 1 } },
      f2: [
        { method: 'get', path: '/f2/{a}', version: { max: 1 } },
        { method: 'get', path: '/f22/{a}' },
      ],
      f3: { method: 'post' },
      f4: { method: 'post', path: '/f4/{a}' },
      f5: { method: 'delete', path: '/f5' },
      fComplex: { path: '/fComplex' },
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
  const f2Impl = f2.use({ providers: { authProvider } }).implement({
    async body({ input: { a, b } }) {
      return result.ok(a * b)
    },
  })
  const fComplexImpl = fComplex.use({ providers: { authProvider } }).implement({
    async body({ input: { age, name }, retrieve }) {
      return result.ok([{ age, friends: [], id: '123', name, retrieve }])
    },
  })
  const moduleImpl = moduleInterface.implement({
    functions: { f1: f1Impl, f2: f2Impl, f3: f2Impl, f4: f2Impl, f5: f2Impl, fComplex: fComplexImpl },
  })
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

  const response2 = await client.functions.f2({ a: 4, b: 3 })
  expect(response2.isOk && response2.value).toEqual(4 * 3)

  const response3 = await client.functions.f2({ a: 'hello', b: 3 } as any)
  expect(response3.isFailure && response3.error).toEqual({
    BadInput: {
      errors: [
        {
          expected: 'number',
          got: 'hello',
          path: '$.a',
        },
      ],
      from: 'input',
      message: 'Bad input.',
    },
  })

  const response4 = await client.functions.f3({ a: 4, b: 3 })
  expect(response4.isOk && response4.value).toEqual(4 * 3)

  const response5 = await client.functions.f4({ a: 4, b: 3 })
  expect(response5.isOk && response5.value).toEqual(4 * 3)

  const response6 = await client.functions.f5({ a: 4, b: 3 })
  expect(response6.isOk && response6.value).toEqual(4 * 3)

  const response7 = await client.functions.fComplex(
    { name: 'John', age: 30, friends: ['123'] },
    {
      select: { name: true, friends: { take: 10, select: { age: true } } },
      where: { name: { equals: 'John' }, AND: [{ age: { in: [1, 2, 3] } }] },
      orderBy: [{ name: 'asc' }, { age: 'desc' }],
      skip: 0,
      take: 10,
    },
  )
  expect(response7.isOk && response7.value).toEqual([
    {
      age: 30,
      friends: [],
      id: '123',
      name: 'John',
      retrieve: {
        select: {
          id: true,
          retrieve: true,
          age: true,
          name: true,
          friends: { skip: 0, take: 10, select: { age: true, id: true, name: true, retrieve: true } },
        },
        where: { name: { equals: 'John' }, AND: [{ age: { in: [1, 2, 3] } }] },
        orderBy: [{ name: 'asc' }, { age: 'desc' }],
        skip: 0,
        take: 10,
      },
    },
  ])
  await server.close()
})
