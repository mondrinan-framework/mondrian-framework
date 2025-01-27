import { rest } from '../src'
import { decoding, model, validation } from '@mondrian-framework/model'
import { functions, module } from '@mondrian-framework/module'
import gen from 'fast-check'
import { describe, expect, test } from 'vitest'

describe('module to openapi', () => {
  //TODO [Good first issue]: add more tests
  test('works on simple module', () => {
    const m = module.define({
      name: 'name',
      functions: {
        toString: functions.define({
          input: model.number(),
          output: model.string(),
          errors: undefined,
          retrieve: undefined,
        }),
      },
    })

    const openapi = rest.openapi.fromModule({
      version: 1,
      api: {
        module: m,
        version: 1,
        functions: {
          toString: { method: 'get' },
        },
      },
    })

    expect(openapi).toEqual({
      openapi: '3.1.0',
      info: { version: 'v1', title: 'name' },
      servers: [{ url: '/api/v1' }],
      paths: {
        '/toString': {
          get: {
            parameters: [{ name: 'input', in: 'query', required: true, explode: true, schema: { type: 'number' } }],
            responses: {
              '200': { description: 'Success', content: { 'application/json': { schema: { type: 'string' } } } },
            },
            tags: [],
          },
        },
      },
      components: { schemas: {} },
    })
  })

  test("don't work if path param is not a scalar", () => {
    const m = module.define({
      name: 'name',
      functions: {
        toString: functions.define({
          input: model.object({ a: model.object({}) }),
          output: model.string(),
        }),
      },
    })

    expect(() =>
      rest.openapi.fromModule({
        version: 1,
        api: {
          module: m,
          version: 1,
          functions: { toString: { method: 'get', path: '/toString/{a}' } },
        },
      }),
    ).toThrowError(
      'Error while generating openapi input type. Path parameter a can only be a scalar type. Path /toString/{a}',
    )
  })

  test("don't work if path param is inside an array", () => {
    const m = module.define({
      name: 'name',
      functions: {
        toString: functions.define({
          input: model.object({ a: model.string().optional() }).array(),
          output: model.string(),
        }),
      },
    })

    expect(() =>
      rest.openapi.fromModule({
        version: 1,
        api: {
          module: m,
          version: 1,
          functions: { toString: { method: 'get', path: '/toString/{a}' } },
        },
      }),
    ).toThrowError(
      'Error while generating openapi input type. Path parameter with array are not supported. Path /toString/{a}',
    )
  })

  test("don't work with multiple path parameters if input is scalar", () => {
    const m = module.define({
      name: 'name',
      functions: {
        toString: functions.define({
          input: model.string().optional(),
          output: model.string(),
        }),
      },
    })

    expect(() =>
      rest.openapi.fromModule({
        version: 1,
        api: {
          module: m,
          version: 1,
          functions: { toString: { method: 'get', path: '/toString/{a}/{b}' } },
        },
      }),
    ).toThrowError('Error while generating openapi input type. Only one parameter is needed. Path /toString/{a}/{b}')
  })

  test('works on more complex module', () => {
    const postCategory = model.enumeration(['FUNNY', 'QUESTION']).setName('PostCategory')
    const user = () =>
      model.entity({
        username: model.string(),
        posts: model.array(post),
        registeredAt: model.datetime(),
      })
    const post = () =>
      model.entity({
        title: model.string({ minLength: 1, maxLength: 2000 }),
        content: model.string(),
        author: model.nullable(user),
        likes: model.array(user),
        visualizations: model.integer({ minimum: 0 }),
        categories: model.array(postCategory).optional(),
      })
    const m = module.define({
      name: 'name',
      functions: {
        getPosts: functions.define({
          input: model.object({ userId: model.string(), limit: model.integer().optional() }),
          output: model.array(post),
        }),
        getUsers: functions.define({
          input: model.object({ start: model.integer(), limit: model.integer() }),
          output: model.array(user),
        }),
        createUser: functions.define({
          input: user,
          output: user,
          errors: { invalidInput: model.string(), notLoggedIn: model.string(), tooManyRequests: model.string() },
          options: { description: 'Creates a new user', namespace: 'Managment' },
        }),
        getNone: functions.define({
          output: model.undefined(),
        }),
        getAll: functions.define({
          output: model.entity({
            boolean: model.boolean(),
            literal1: model.literal(true),
            literal2: model.literal('true'),
            literal3: model.literal(123),
            literal4: model.null(),
            literal5: model.undefined(),
            record: model.record(model.string()),
            email: model.email(),
            unknown: model.unknown(),
            json: model.json(),
            timestapm: model.timestamp(),
            never: model.never(),
            union: model.union({ a: model.string(), b: model.number() }),
            custom1: model.custom<'custom1', {}, string>({
              typeName: 'custom1',
              encoder: (value) => value,
              decoder: (value) => decoding.succeed(value as string),
              validator: () => validation.succeed(),
              arbitrary: () => gen.constant('custom1'),
              options: {
                description: 'a',
                apiType: model.string({ minLength: 1, description: 'b' }),
              },
            }),
            custom2: model.custom<'custom2', {}, string>({
              typeName: 'custom2',
              encoder: (value) => value,
              decoder: (value) => decoding.succeed(value as string),
              validator: () => validation.succeed(),
              arbitrary: () => gen.constant('custom2'),
              options: {
                description: 'a',
                apiType: () => model.string({ minLength: 1, description: 'b', name: 'ApiCustom2' }),
              },
            }),
          }),
        }),
      },
    })

    const openapi = rest.openapi.fromModule({
      version: 2,
      api: {
        module: m,
        options: { pathPrefix: 'API' },
        version: 3,
        functions: {
          getPosts: { method: 'get', path: '/posts/{userId}' },
          getUsers: [
            { method: 'post', path: '/users' },
            { method: 'get', path: '/users' },
            { method: 'get', path: '/old_users', version: { max: 1 } },
            { method: 'get', path: '/new_users', version: { min: 3 } },
          ],
          createUser: [
            { method: 'post', errorCodes: {}, responseHeaders: { 'X-Total-Count': { schema: { type: 'integer' } } } },
          ],
          getAll: { method: 'post' },
        },
        errorCodes: { tooManyRequests: 429 },
      },
    })

    expect(openapi).toEqual({
      openapi: '3.1.0',
      info: { version: 'v3', title: 'name' },
      servers: [{ url: 'API/v2' }],
      paths: {
        '/posts/{userId}': {
          get: {
            parameters: [
              { in: 'path', name: 'userId', required: true, schema: { type: 'string' } },
              { name: 'limit', in: 'query', required: false, explode: true, schema: { type: 'integer' } },
            ],
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/post' } } },
                },
              },
            },
            tags: [],
          },
        },
        '/users': {
          post: {
            parameters: [],
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['start', 'limit'],
                    properties: { start: { type: 'integer' }, limit: { type: 'integer' } },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/user' } } },
                },
              },
            },
            tags: [],
          },
          get: {
            parameters: [
              { name: 'start', in: 'query', required: true, explode: true, schema: { type: 'integer' } },
              { name: 'limit', in: 'query', required: true, explode: true, schema: { type: 'integer' } },
            ],
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/user' } } },
                },
              },
            },
            tags: [],
          },
        },
        '/createUser': {
          post: {
            parameters: [],
            requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/user' } } } },
            responses: {
              '200': {
                description: 'Success',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/user' } } },
                headers: { 'X-Total-Count': { schema: { type: 'integer' } } },
              },
              '400': {
                description: 'Error',
                content: {
                  'application/json': {
                    schema: {
                      anyOf: [
                        {
                          type: 'object',
                          required: ['invalidInput'],
                          properties: { invalidInput: { type: 'string' } },
                        },
                        { type: 'object', required: ['notLoggedIn'], properties: { notLoggedIn: { type: 'string' } } },
                      ],
                    },
                  },
                },
              },
              '429': {
                description: 'Error',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: ['tooManyRequests'],
                      properties: { tooManyRequests: { type: 'string' } },
                    },
                  },
                },
              },
            },
            description: 'Creates a new user',
            tags: ['Managment'],
          },
        },
        '/getAll': {
          post: {
            parameters: [],
            responses: {
              '200': {
                description: 'Success',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      required: [
                        'boolean',
                        'literal1',
                        'literal2',
                        'literal3',
                        'literal4',
                        'literal5',
                        'record',
                        'email',
                        'unknown',
                        'json',
                        'timestapm',
                        'never',
                        'union',
                        'custom1',
                        'custom2',
                      ],
                      properties: {
                        boolean: { type: 'boolean' },
                        literal1: { type: 'boolean', const: true, example: true },
                        literal2: { type: 'string', const: 'true', example: 'true' },
                        literal3: { type: 'number', const: 123, example: 123 },
                        literal4: { type: 'null', const: null },
                        literal5: { type: 'null', const: null },
                        record: { type: 'object', additionalProperties: { type: 'string' } },
                        email: { type: 'string', format: 'email' },
                        unknown: {},
                        json: {},
                        timestapm: { type: 'integer', description: 'unix timestamp' },
                        never: {},
                        union: { anyOf: [{ type: 'string' }, { type: 'number' }] },
                        custom1: {
                          description: 'a',
                          example: 'custom1',
                          minLength: 1,
                          type: 'string',
                        },
                        custom2: {
                          $ref: '#/components/schemas/ApiCustom2',
                        },
                      },
                    },
                  },
                },
              },
            },
            tags: [],
          },
        },
      },
      components: {
        schemas: {
          ApiCustom2: {
            description: 'b',
            minLength: 1,
            type: 'string',
          },
          user: {
            type: 'object',
            required: ['username', 'registeredAt'],
            properties: {
              username: { type: 'string' },
              posts: { type: 'array', items: { $ref: '#/components/schemas/post' } },
              registeredAt: { type: 'string', format: 'date-time' },
            },
          },
          PostCategory: { type: 'string', enum: ['FUNNY', 'QUESTION'] },
          post: {
            type: 'object',
            required: ['title', 'content', 'visualizations'],
            properties: {
              title: { type: 'string', minLength: 1, maxLength: 2000 },
              content: { type: 'string' },
              author: { anyOf: [{ $ref: '#/components/schemas/user' }, { type: 'null', const: null }] },
              likes: { type: 'array', items: { $ref: '#/components/schemas/user' } },
              visualizations: { type: 'integer', minimum: 0 },
              categories: { type: 'array', items: { $ref: '#/components/schemas/PostCategory' } },
            },
          },
        },
      },
    })
  })
})
