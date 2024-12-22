import { rateLimiter } from '../src'
import { Rate } from '../src/rate'
import { result, model } from '@mondrian-framework/model'
import { module, functions, client as clientBuilder, provider } from '@mondrian-framework/module'
import { expect, test } from 'vitest'

test('Rate limiter middleware', async () => {
  const LoginInput = model
    .object({
      email: model.string(),
      password: model.string(),
    })
    .setName('LoginInput')
  const LoginOutput = model.object({ jwt: model.string() }).nullable().setName('LoginOuput')
  const locationProvider = provider.build({
    body: async ({ ip }: { ip: string }) => {
      return result.ok({ ip })
    },
  })
  const LoginError = { invalidUsernameOrPassword: model.string(), tooManyRequests: model.string() }
  const rateLimitByIpEmail = rateLimiter.buildProvider({
    rate: '1 requests in 1 minutes',
  })

  const rateLimitByEmail = rateLimiter.buildProvider({
    rate: new Rate({ requests: 1, period: 1, scale: 'hour' }),
  })

  const login = functions
    .define({
      input: LoginInput,
      output: LoginOutput,
      errors: LoginError,
      retrieve: undefined,
    })
    .use({ providers: { location: locationProvider, rateLimitByEmail, rateLimitByIpEmail } })
    .implement({
      body: async ({ input, rateLimitByEmail, rateLimitByIpEmail, location: { ip } }) => {
        if (input.email !== 'admin@domain.com' && rateLimitByIpEmail.apply(`${ip}:${input.email}`) === 'rate-limited') {
          return result.fail({ tooManyRequests: 'Too many requests. Retry in few minutes.' })
        }
        if (rateLimitByEmail.apply(input.email) === 'rate-limited') {
          throw new Error('Too many requests')
        }
        if (input.email === 'test@domain.com' && input.password === '1234') {
          return result.ok({ jwt: '...' })
        }
        return result.fail({ invalidUsernameOrPassword: '' })
      },
    })

  const m = module.build({
    name: 'test',
    functions: { login },
  })

  const client = clientBuilder.withMetadata<{ ip?: string }>().build({
    module: m,
    context: async ({ metadata }) => {
      return { ip: metadata?.ip ?? 'local' }
    },
  })

  const failedLoginResult = await client.functions.login({ email: 'test@domain.com', password: '4321' })
  expect(failedLoginResult.isOk).toBe(false)
  expect(failedLoginResult.isFailure && failedLoginResult.error).toEqual({ invalidUsernameOrPassword: '' })

  const failedLoginResult2 = await client.functions.login({ email: 'test@domain.com', password: '1234' })
  expect(failedLoginResult2.isOk).toBe(false)
  expect(failedLoginResult2.isFailure && failedLoginResult2.error).toEqual({
    tooManyRequests: 'Too many requests. Retry in few minutes.',
  })

  const failedLoginResult3 = await client.functions.login({ email: 'admin@domain.com', password: '4321' })
  expect(failedLoginResult3.isOk).toBe(false)
  expect(failedLoginResult3.isFailure && failedLoginResult3.error).toEqual({ invalidUsernameOrPassword: '' })

  await expect(
    async () => await client.functions.login({ email: 'admin@domain.com', password: '4321' }),
  ).rejects.toThrow('Too many requests')
})
