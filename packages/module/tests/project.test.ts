import { Project } from '../src/client'
import { model } from '@mondrian-framework/model'
import { describe, expectTypeOf, test } from 'vitest'

describe('Project', () => {
  test('Infer scalar on scalar type with any projection', () => {
    expectTypeOf<Project<model.NumberType, {}>>().toEqualTypeOf<number>()
    expectTypeOf<Project<model.NumberType, {}>>().toEqualTypeOf<number>()
    expectTypeOf<Project<model.StringType, {}>>().toEqualTypeOf<string>()
    expectTypeOf<Project<model.StringType, {}>>().toEqualTypeOf<string>()
    expectTypeOf<Project<model.BooleanType, {}>>().toEqualTypeOf<boolean>()
    expectTypeOf<Project<model.BooleanType, {}>>().toEqualTypeOf<boolean>()
    expectTypeOf<Project<model.LiteralType<null>, {}>>().toEqualTypeOf<null>()
    expectTypeOf<Project<model.LiteralType<null>, {}>>().toEqualTypeOf<null>()
    expectTypeOf<Project<model.DateTimeType, {}>>().toEqualTypeOf<Date>()
    expectTypeOf<Project<model.DateTimeType, {}>>().toEqualTypeOf<Date>()
    expectTypeOf<Project<model.EnumType<['A']>, {}>>().toEqualTypeOf<'A'>()
    expectTypeOf<Project<model.EnumType<['A']>, {}>>().toEqualTypeOf<'A'>()
  })

  test('Infer scalar on scalar type with any projection with wrapper', () => {
    expectTypeOf<Project<model.NullableType<model.NumberType>, {}>>().toEqualTypeOf<number | null>()
    expectTypeOf<Project<model.OptionalType<model.NumberType>, {}>>().toEqualTypeOf<number | undefined>()
    expectTypeOf<Project<model.ArrayType<model.Mutability.Mutable, model.NumberType>, {}>>().toEqualTypeOf<number[]>()
  })

  test('simple object', () => {
    const user = model.object({ field1: model.string(), field2: model.string() })
    type UserType = typeof user
    expectTypeOf<Project<UserType, { select: {} }>>().toEqualTypeOf<Readonly<{}>>()
    expectTypeOf<Project<UserType, { select: { field1: true } }>>().toEqualTypeOf<Readonly<{ field1: string }>>()
    expectTypeOf<Project<UserType, {}>>().toEqualTypeOf<model.Infer<UserType>>()
  })

  test('recursive object with virtual field', () => {
    const user = () => model.object({ field1: model.string(), field2: model.string(), friend: model.optional(user) })
    type User = model.Infer<UserType>
    type UserType = typeof user
    expectTypeOf<Project<UserType, { select: {} }>>().toEqualTypeOf<Readonly<{}>>()
    expectTypeOf<Project<UserType, { select: { field1: true } }>>().toEqualTypeOf<Readonly<{ field1: string }>>()
    expectTypeOf<Project<UserType, {}>>().toEqualTypeOf<Readonly<{ field1: string; field2: string; friend?: User }>>()
    expectTypeOf<Project<UserType, { select: { friend: true } }>>().toEqualTypeOf<
      Readonly<{ friend?: Readonly<{ field1: string; field2: string; friend?: User }> }>
    >()
  })
})
