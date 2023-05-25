import t from '@mondrian/model'
import { Id, JWT } from './scalars.types'

export const User = () =>
  t.object({
    id: Id,
    email: t.string({ format: 'email' }),
    name: t.string({ minLength: 3, maxLength: 20 }).nullable(),
    posts: t.relation(t.array(Post)),
    test: t
      .union(
        {
          a: t.object({ type: t.literal('A'), v: t.number() }),
          b: t.object({ type: t.literal('B'), v: t.string() }),
        },
        {
          discriminant: 'type',
          is: {
            a: (v) => v.type === 'A',
            b: (v) => v.type === 'B',
          },
        },
      )
      .default({ type: 'A', v: 123 }),
  })
export type User = t.Infer<typeof User>

export const Post = () =>
  t.object({
    id: Id,
    title: t.string({ minLength: 1, maxLength: 200 }),
    content: t.string({ maxLength: 5000 }).nullable(),
    published: t.boolean(),
    author: t.relation(User),
  })
export type Post = t.Infer<typeof Post>

export const UserFilter = t.object({
  id: Id.optional(),
})
export type UserFilter = t.Infer<typeof UserFilter>

export const LoginInput = t.object({
  email: t.string({ format: 'email' }),
  password: t.string({ minLength: 1, maxLength: 100 }),
})
export type LoginInput = t.Infer<typeof LoginInput>

export const RegisterInput = t.merge(
  t.select(User, {
    email: true,
    name: true,
  }),
  t.object({ password: t.string({ minLength: 5, maxLength: 100 }), a: t.literal(1.1) }),
)
export type RegisterInput = t.Infer<typeof RegisterInput>

export const PostInput = t.select(Post, {
  title: true,
  content: true,
})
export type PostInput = t.Infer<typeof PostInput>

export const RegisterOutput = t.object({ user: User, jwt: JWT })
export type RegisterOutput = t.Infer<typeof RegisterOutput>

export const LoginOutput = t.object({ user: User, jwt: JWT }).nullable()
export type LoginOutput = t.Infer<typeof LoginOutput>

export const UserOutputs = User().array()
export type UserOutputs = t.Infer<typeof UserOutputs>

export const CheckPostOutput = t.object({ passedPosts: Id.array(), blockedPosts: Id.array() })
export type CheckPostOutput = t.Infer<typeof CheckPostOutput>
