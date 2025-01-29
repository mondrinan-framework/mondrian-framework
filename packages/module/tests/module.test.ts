import { module, functions, client as clientBuilder, security, provider } from '../src'
import { result, model } from '@mondrian-framework/model'
import { describe, expect, expectTypeOf, test } from 'vitest'

test('Real example', async () => {
  ///Types
  const User = () =>
    model.entity({
      email: model.string(),
      password: model.string(),
      firstname: model.string().optional(),
      lastname: model.string().optional(),
      friend: model.optional(User),
      metadata: model
        .record(model.string({ maxLength: 1024 }))
        .setName('Metadata')
        .optional(),
    })
  type User = model.Infer<typeof User>
  const LoginInput = () =>
    model.object(
      {
        email: model.string(),
        password: model.string(),
      },
      { name: 'LoginInput' },
    )
  const LoginOutput = model.object({ jwt: model.string(), user: User }).nullable().setName('LoginOuput')

  //Providers
  const memory = new Map<string, User>()
  const db: {
    findUser(filter: { email: string }): User | undefined
    updateUser(user: User): User
  } = {
    updateUser(user) {
      memory.set(user.email, user)
      return user
    },
    findUser(user) {
      return memory.get(user.email)
    },
  }

  const dbProvider = provider.build({
    body: async () => result.ok(db),
  })
  const fromProvider = provider.build({
    body: async ({ ip }: { ip: string }) => result.ok(ip),
  })
  const authProvider = provider.build({
    errors: { unauthorized: model.string() },
    async body({ authorization }: { authorization: string | undefined }) {
      if (authorization != null) {
        const user = db.findUser({ email: authorization })
        if (user) {
          return result.ok({ email: user.email })
        }
      }
      return result.fail({ unauthorized: 'Invalid authorization' })
    },
  })

  const login = functions
    .define({
      input: LoginInput,
      output: LoginOutput,
      errors: { invalidEmailOrPassword: model.literal('Invalid email or password') },
      options: { namespace: 'authentication' },
    })
    .use({ providers: { db: dbProvider, from: fromProvider } })
    .implement({
      body: async ({ input, db, logger }) => {
        const user = db.findUser({ email: input.email })
        if (!user || user.password !== input.password) {
          logger.logWarn(`Invalid email or password: ${input.email}`)
          return result.fail({ invalidEmailOrPassword: 'Invalid email or password' })
        }
        logger.logInfo(`Logged in: ${input.email}`)
        return result.ok({ jwt: Promise.resolve(user.email) as unknown as string, user })
      },
      middlewares: [
        {
          name: 'Hide password',
          apply: async (args, next) => {
            const res = await next(args)
            if (res.isOk && res.value?.user?.password) {
              return result.ok({ ...res.value, user: { ...res.value.user, password: '****' } })
            }
            return res
          },
        },
      ],
    })

  const register = functions
    .define({
      input: LoginInput,
      output: model.nullable(User),
      errors: {
        weakPassword: model.literal('Weak passowrd'),
        doubleRegister: model.literal('Double register'),
      },
      options: { namespace: 'authentication' },
    })
    .use({ providers: { db: dbProvider, from: fromProvider } })
    .implement({
      body: async ({ input, db, from, logger }) => {
        if (!input.email.includes('@domain.com')) {
          throw new Error('Invalid domain!')
        }
        const user = db.findUser({ email: input.email })
        if (user) {
          logger.logWarn(`Double register`, { email: input.email })
          return result.fail({ doubleRegister: 'Double register' })
        } else {
          logger.logInfo(`Registered: ${input.email}`)
          return result.ok(db.updateUser(input))
        }
      },
      middlewares: [
        {
          name: 'Avoid weak passwords',
          apply: async (args, next) =>
            args.input.password === '123' ? result.fail({ weakPassword: 'Weak passowrd' }) : next(args),
        },
      ],
    })

  const completeProfile = functions
    .define({
      input: model.object({ firstname: model.string(), lastname: model.string() }),
      output: User,
      errors: { unauthorized: model.string() },
      options: { namespace: 'business-logic' },
    })
    .use({ providers: { db: dbProvider, auth: authProvider } })
    .implement({
      body: async ({ input, db, auth }) => {
        const user = db.findUser({ email: auth.email })
        if (!user) {
          throw new Error('Unrechable')
        }
        return result.ok(db.updateUser({ ...user, ...input }))
      },
    })

  const noInputOrOutput = functions
    .define({
      errors: { unauthorized: model.string() },
    })
    .use({ providers: { dbProvider } })
    .implement({
      body: async ({}) => {
        return result.ok(undefined)
      },
    })

  const m = module.build({
    name: 'test',
    options: { maxSelectionDepth: 2, resolveNestedPromises: true },
    functions: { login, register, completeProfile, noInputOrOutput },
  })

  const client = clientBuilder.withMetadata<{ ip?: string; authorization?: string }>().build({
    module: m,
    context: async ({ metadata }) => {
      return { ip: metadata?.ip ?? 'local', authorization: metadata?.authorization }
    },
  })

  const rUndef = await client.functions.noInputOrOutput()
  expect(rUndef.isOk && rUndef.value).toBe(undefined)

  await expect(() => client.functions.register({ email: 'admin@google.com', password: '123456' })).rejects.toThrow()

  const res = await client.functions.register({ email: 'admin@domain.com', password: '123' })
  expect(res.isOk).toBe(false)

  await client.functions.register({ email: 'admin@domain.com', password: '1234' })
  const failedRegisterResult = await client.functions.register({ email: 'admin@domain.com', password: '1234' })
  expect(failedRegisterResult.isOk).toBe(false)
  expect(failedRegisterResult.isFailure && failedRegisterResult.error).toEqual({ doubleRegister: 'Double register' })

  const failedLoginResult = await client.functions.login({ email: 'admin@domain.com', password: '4321' })
  expect(failedLoginResult.isOk).toBe(false)
  expect(failedLoginResult.isFailure && failedLoginResult.error).toEqual({
    invalidEmailOrPassword: 'Invalid email or password',
  })

  const loginResult = await client.functions.login({ email: 'admin@domain.com', password: '1234' })
  expect(loginResult.isOk).toEqual(true)
  expect(loginResult.isOk && loginResult.value).toEqual({
    user: { email: 'admin@domain.com', password: '****' },
    jwt: 'admin@domain.com',
  })

  const completeProfileResult = await client.functions.completeProfile({ firstname: 'Pieter', lastname: 'Mondriaan' })
  expect(completeProfileResult.isFailure && completeProfileResult.error).toEqual({
    unauthorized: 'Invalid authorization',
  })
  const r1 = await client.functions.completeProfile(
    { firstname: 'Pieter', lastname: 'Mondriaan' },
    { metadata: { authorization: 'wrong' } },
  )
  expect(r1.isFailure && r1.error).toEqual({ unauthorized: 'Invalid authorization' })

  if (loginResult.isOk && loginResult.value) {
    const authClient = client.withMetadata({ authorization: loginResult.value.jwt })
    const myUser = await authClient.functions.completeProfile({ firstname: 'Pieter', lastname: 'Mondriaan' }, {})
    expect(myUser.isOk && myUser.value).toEqual({
      email: 'admin@domain.com',
      password: '1234',
      firstname: 'Pieter',
      lastname: 'Mondriaan',
    })
  }
})

describe('Unique type name', () => {
  test('Two different type cannot have the same name', () => {
    const n = model.number().setName('Input')
    const input = model.number().setName('Input')
    const output = model.union({ n, v: input.setName('V') })
    const f = functions
      .define({
        input,
        output,
      })
      .implement({
        body: () => {
          throw 'Unreachable'
        },
      })
    expect(() =>
      module.build({
        name: 'test',
        functions: { f },
      }),
    ).toThrowError(`Duplicated type name "Input"`)
  })
})

describe('Invalid provider errors', () => {
  test('A function cannot define provider with reserved names', () => {
    const prov = provider.build({
      body: async () => result.ok({}),
    })
    const f = functions
      .define({})
      .use({ providers: { input: prov } })
      .implement({
        body: () => {
          throw 'Unreachable'
        },
      })
    expect(() =>
      module.build({
        name: 'test',
        functions: { f },
      }),
    ).toThrowError(`Provider name "input" is reserved in function "f".`)
  })
  test('A function must define the provider error', () => {
    const prov = provider.build({
      errors: { errorName: model.string() },
      body: async () => result.ok({}),
    })
    const f = functions
      .define({})
      .use({ providers: { prov } })
      .implement({
        body: () => {
          throw 'Unreachable'
        },
      })
    expect(() =>
      module.build({
        name: 'test',
        functions: { f },
      }),
    ).toThrowError(`Provider "prov" use error "errorName" that is not defined in function "f" errors`)
  })

  test('A function must define the same provider error', () => {
    const prov = provider.build({
      errors: { errorName: model.string() },
      body: async () => result.ok({}),
    })
    const f = functions
      .define({
        errors: { errorName: model.number() },
      })
      .use({ providers: { prov } })
      .implement({
        body: () => {
          throw 'Unreachable'
        },
      })
    expect(() =>
      module.build({
        name: 'test',
        functions: { f },
      }),
    ).toThrowError(`Provider "prov" use error "errorName" that is not equal to the function "f" error type`)
  })
})

describe('Default middlewares', () => {
  test('Testing maximum projection depth and output type', async () => {
    const type = () => model.entity({ type: model.optional(type), value: model.string() })
    const dummy = functions
      .define({
        input: type,
        output: type,
        retrieve: { select: true },
      })
      .implement({
        body: async ({ input, retrieve }) => {
          if (input?.value === 'wrong') {
            return result.ok({}) //selection not respected sometimes!
          }
          return result.ok(input)
        },
      })
    const m = module.build({
      name: 'test',
      functions: { dummy },
      options: {
        checkOutputType: 'throw',
        maxSelectionDepth: 2,
      },
      policies: () => security.on(type).allows({ selection: true }),
    })

    const client = clientBuilder.build({
      module: m,
      async context() {
        return {}
      },
    })

    const result1 = await client.functions.dummy({ value: '123' })
    expect(result1).toEqual({ value: '123' })
    const result2 = await client.functions.dummy({ value: 'wrong' }, { retrieve: { select: {} } })
    expect(result2).toEqual({})
    await expect(
      async () =>
        await client.functions.dummy(
          { value: '123' },
          { retrieve: { select: { type: { select: { type: { select: {} } } } } } },
        ),
    ).rejects.toThrowError('Max selection depth reached: requested selection have a depth of 3. The maximum is 2.')
    await expect(async () => await client.functions.dummy({ value: 'wrong' })).rejects.toThrowError(
      'Invalid output on function dummy. Errors: (1) {"expected":"string","path":"$.value"}',
    )
  })
})

test('Return types', async () => {
  ///Types
  const User = () =>
    model.entity({
      email: model.string(),
      friends: model.array(User),
      metadata: model.object({ tags: model.string().array() }).optional(),
    })

  const login = functions
    .define({
      output: User,
      retrieve: { select: true },
    })
    .implement({
      body: async () => {
        return result.ok({ email: 'email@domain.com', metadata: { tags: [] }, friends: [] })
      },
    })

  const m = module.build({
    name: 'test',
    functions: { login },
  })

  const client = clientBuilder.withMetadata<{ ip?: string; authorization?: string }>().build({
    module: m,
    context: async ({ metadata }) => {
      return { ip: metadata?.ip ?? 'local', authorization: metadata?.authorization }
    },
  })

  type NoRetrieveType = {
    readonly email: string
    readonly metadata?:
      | {
          readonly tags: readonly string[]
        }
      | undefined
  }
  const r1 = await client.functions.login({})
  expectTypeOf(r1).toEqualTypeOf<NoRetrieveType>()

  const r2 = await client.functions.login({ retrieve: {} })
  expectTypeOf(r2).toEqualTypeOf<NoRetrieveType>()

  const r3 = await client.functions.login({ retrieve: { select: undefined } })
  expectTypeOf(r3).toEqualTypeOf<NoRetrieveType>()

  const r4 = await client.functions.login({ retrieve: { select: {} } })
  expectTypeOf(r4).toEqualTypeOf<{}>()

  const r5 = await client.functions.login({ retrieve: { select: { email: true } } })
  expectTypeOf(r5).toEqualTypeOf<{ readonly email: string }>()

  const r14 = await client.functions.login({ retrieve: { select: { email: false } } })
  expectTypeOf(r14).toEqualTypeOf<{}>()

  const r6 = await client.functions.login({ retrieve: { select: { metadata: undefined } } })
  expectTypeOf(r6).toEqualTypeOf<{}>()

  const r7 = await client.functions.login({ retrieve: { select: { metadata: {} } } })
  expectTypeOf(r7).toEqualTypeOf<{ readonly metadata?: { readonly tags: readonly string[] } }>()

  const r8 = await client.functions.login({ retrieve: { select: { metadata: { select: {} } } } })
  expectTypeOf(r8).toEqualTypeOf<{ readonly metadata?: {} }>()

  const r9 = await client.functions.login({ retrieve: { select: { metadata: { select: { tags: true } } } } })
  expectTypeOf(r9).toEqualTypeOf<{ readonly metadata?: { readonly tags: readonly string[] } }>()

  const r10 = await client.functions.login({ retrieve: { select: { friends: undefined } } })
  expectTypeOf(r10).toEqualTypeOf<{}>()

  const r11 = await client.functions.login({ retrieve: { select: { friends: { select: undefined } } } })
  expectTypeOf(r11).toEqualTypeOf<{ readonly friends: readonly NoRetrieveType[] }>()

  const r12 = await client.functions.login({ retrieve: { select: { friends: { select: {} } } } })
  expectTypeOf(r12).toEqualTypeOf<{ readonly friends: readonly {}[] }>()

  const r13 = await client.functions.login({ retrieve: { select: { friends: { select: { email: true } } } } })
  expectTypeOf(r13).toEqualTypeOf<{ readonly friends: readonly { readonly email: string }[] }>()
})

test('Errors return', async () => {
  const errorTest = functions
    .define({
      input: model.enumeration(['1', '2', '3', '4', '5', '6']),
      output: model.string(),
      retrieve: { select: true },
      errors: { error1: model.string(), error2: model.object({ a: model.string() }) },
    })
    .implement({
      body: async ({ input }) => {
        if (input === '1') {
          return result.fail({ error1: 'ok' })
        } else if (input === '2') {
          return result.fail({ error2: { a: 'ok' } })
        } else if (input === '3') {
          return result.fail({ error2: { a: 'ok' }, error1: 'ok' })
        } else if (input === '4') {
          return result.fail({} as any)
        } else if (input === '5') {
          return result.fail({ error1: new Date(1) } as any)
        } else {
          return result.fail({ wrong: 1 } as any)
        }
      },
    })
  const unfailableFunction = functions
    .define({
      input: model.string(),
      output: model.string(),
    })
    .implement({
      body: async () => {
        return result.fail(1 as never)
      },
    })

  const m = module.build({
    name: 'test',
    functions: { errorTest, unfailableFunction },
    options: { checkOutputType: 'throw' },
  })

  const client = clientBuilder.withMetadata<{ ip?: string; authorization?: string }>().build({
    module: m,
    context: async () => {
      return {}
    },
  })

  const r1 = await client.functions.errorTest('1')
  expect(r1.isFailure && r1.error).toEqual({ error1: 'ok' })
  const r2 = await client.functions.errorTest('2')
  expect(r2.isFailure && r2.error).toEqual({ error2: { a: 'ok' } })
  const r3 = await client.functions.errorTest('3')
  expect(r3.isFailure && r3.error).toEqual({ error2: { a: 'ok' }, error1: 'ok' })
  await expect(() => client.functions.errorTest('4')).rejects.toThrowError(
    'Invalid output on function errorTest. Errors: (1) {"expected":"An object with at least one of this field: error1, error2","got":{},"path":"$"}',
  )
  await expect(() => client.functions.errorTest('5')).rejects.toThrowError(
    'Invalid output on function errorTest. Errors: (1) {"expected":"string or undefined","got":"1970-01-01T00:00:00.001Z","path":"$.error1"}',
  )
  await expect(() => client.functions.errorTest('6')).rejects.toThrowError(
    'Invalid output on function errorTest. Errors: (1) {"expected":"undefined","got":1,"path":"$.wrong"}',
  )

  await expect(() => client.functions.unfailableFunction('1')).rejects.toThrowError(
    "Unexpected failure on function unfailableFunction. It doesn't declare errors nor the module declares errors.",
  )
})

test('Undefiend function error type', async () => {
  expect(() =>
    functions
      .define({
        input: model.unknown(),
        output: model.unknown(),
        errors: { error1: model.string(), error2: model.number().optional() },
      })
      .implement({
        body: async () => {
          return result.ok(null)
        },
      }),
  ).toThrowError('Function errors cannot be optional. Error "error2" is optional')
})
