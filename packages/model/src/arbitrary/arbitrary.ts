import { model, utils } from '../index'
import { forbiddenObjectFields } from '../utils'
import gen from 'fast-check'

/**
 * @return A generator for types' base options.
 *         All of its keys are optional and may be omitted in the generated options.
 */
export function baseOptions(): gen.Arbitrary<model.BaseOptions> {
  return gen.record(baseOptionsGeneratorsRecord(), {
    withDeletedKeys: true,
  })
}

/**
 * @returns A generator for string types' options.
 *          All of its keys are optional and may be omitted in the generated options.
 */
export function stringTypeOptions(): gen.Arbitrary<model.StringTypeOptions> {
  return gen.integer({ min: 0, max: 500 }).chain((min) => {
    return gen.integer({ min, max: 500 }).chain((max) => {
      return gen.oneof(
        gen.record(
          {
            ...baseOptionsGeneratorsRecord(),
            minLength: gen.constant(min),
            maxLength: gen.constant(max),
          },
          { withDeletedKeys: true },
        ),
        gen.record(
          {
            ...baseOptionsGeneratorsRecord(),
            // ⚠️ possible pain point: there is no generator for regexes so we only
            // generate a regex that matches all inputs.
            // For now this is already enough to cover some test cases
            regex: gen.constantFrom(/.*/, undefined),
          },
          { withDeletedKeys: true },
        ),
      )
    })
  })
}

/**
 * @returns A generator for string types.
 */
export function string(): gen.Arbitrary<model.StringType> {
  return orUndefined(stringTypeOptions()).map(model.string)
}

/**
 * @returns A generator for null types.
 */
export function nullType(): gen.Arbitrary<model.LiteralType<null>> {
  return orUndefined(baseOptions()).map(model.null)
}

/**
 * @returns A generator for undefined types.
 */
export function undefinedType(): gen.Arbitrary<model.LiteralType<undefined>> {
  return orUndefined(baseOptions()).map(model.undefined)
}

/**
 * @returns A generator for number types' options.
 *          All of its keys are optional and may be omitted in the generated options.
 */
export function numberTypeOptions(): gen.Arbitrary<model.NumberTypeOptions> {
  return gen.boolean().chain((isInteger) => {
    return integerBounds().chain((bounds) => {
      return gen
        .record({ ...baseOptionsGeneratorsRecord(), isInteger: gen.constant(isInteger) }, { withDeletedKeys: true })
        .map((opts) => ({ ...opts, ...bounds }))
    })
  })
}

function integerBounds() {
  return gen.oneof(
    gen
      .record({
        minimum: gen.integer({ max: Number.MAX_SAFE_INTEGER - 2 }),
        exclusiveMinimum: gen.integer({ max: Number.MAX_SAFE_INTEGER - 2 }),
      })
      .chain(({ exclusiveMinimum, minimum }) => {
        const min = Math.max(exclusiveMinimum, minimum)
        return gen
          .record({
            maximum: gen.integer({ min: min + 2, max: Number.MAX_SAFE_INTEGER }),
            exclusiveMaximum: gen.integer({ min: min + 2, max: Number.MAX_SAFE_INTEGER }),
          })
          .map(({ exclusiveMaximum, maximum }) => ({
            exclusiveMinimum,
            minimum,
            exclusiveMaximum,
            maximum,
          }))
      }),
    gen
      .record({
        minimum: orUndefined(gen.integer()),
        maximum: orUndefined(gen.integer()),
      })
      .map(({ minimum, maximum }) =>
        minimum != null && maximum != null
          ? {
              minimum: Math.min(minimum, maximum),
              maximum: Math.min(minimum, maximum),
            }
          : { minimum, maximum },
      ),
    gen
      .record({
        exclusiveMinimum: orUndefined(gen.integer()),
        exclusiveMaximum: orUndefined(gen.integer()),
      })
      .map(({ exclusiveMinimum, exclusiveMaximum }) =>
        exclusiveMinimum != null && exclusiveMaximum != null
          ? {
              exclusiveMinimum: Math.min(exclusiveMinimum, exclusiveMaximum),
              exclusiveMaximum: Math.min(exclusiveMinimum, exclusiveMaximum),
            }
          : { exclusiveMinimum, exclusiveMaximum },
      )
      .filter(({ exclusiveMaximum, exclusiveMinimum }) => exclusiveMaximum !== exclusiveMinimum),
  )
}

/**
 * @returns A generator for number types.
 */
export function number(): gen.Arbitrary<model.NumberType> {
  return orUndefined(numberTypeOptions()).map(model.number)
}

/**
 * @returns A generator for boolean types' options.
 *          All of its keys are optional and may be omitted in the generated options.
 */
export function booleanTypeOptions(): gen.Arbitrary<model.BooleanTypeOptions> {
  return baseOptions()
}

/**
 * @returns A generator for boolean types.
 */
export function boolean(): gen.Arbitrary<model.BooleanType> {
  return orUndefined(booleanTypeOptions()).map(model.boolean)
}

/**
 * @returns A generator for literal types' options.
 *          All of its keys are optional and may be omitted in the generated options.
 */
export function literalTypeOptions(): gen.Arbitrary<model.LiteralTypeOptions> {
  return baseOptions()
}

/**
 * @param literalGenerator the generator for the literal value of the randomly generated literal type
 * @returns a generator for a literal type wrapping the given literal
 */
export function literal<L extends number | string | boolean>(
  literalGenerator: gen.Arbitrary<L>,
): gen.Arbitrary<model.LiteralType<L>> {
  return orUndefined(literalTypeOptions()).chain((options) => {
    return literalGenerator.map((literalValue) => {
      return model.literal(literalValue, options)
    })
  })
}

/**
 * @return A generator for enum types' options.
 *         All of its keys are optional and may be omitted in the generated options.
 */
export function enumTypeOptions(): gen.Arbitrary<model.EnumTypeOptions> {
  return baseOptions()
}

/**
 * @param variantsGenerator the generator for the variants of the randomly generated enum type
 * @returns a generator for an enum type wrapping the given variants
 */
export function enumeration<Vs extends readonly [string, ...string[]]>(
  variantsGenerator: gen.Arbitrary<Vs>,
): gen.Arbitrary<model.EnumType<Vs>> {
  return orUndefined(enumTypeOptions()).chain((options) => {
    return variantsGenerator.map((variants) => {
      return model.enumeration(variants, options)
    })
  })
}

/**
 * @returns A generator for datetime types' options.
 *          All of its keys are optional and may be omitted in the generated options.
 */
export function datetimeTypeOptions(): gen.Arbitrary<model.CustomTypeOptions<model.DateTimeOptions>> {
  return gen
    .record(
      {
        ...baseOptionsGeneratorsRecord(),
        minimum: orUndefined(gen.date()),
        maximum: orUndefined(gen.date()),
      },
      { withDeletedKeys: true },
    )
    .map((options) => {
      if (options.maximum && options.minimum && options.maximum.getTime() < options.minimum.getTime()) {
        return { ...options, maximum: options.minimum, minimum: options.minimum }
      }
      return options
    })
}

/**
 * @returns A generator for datetime types.
 */
export function datetime(): gen.Arbitrary<model.DateTimeType> {
  return orUndefined(datetimeTypeOptions()).map(model.datetime)
}

/**
 * @returns A generator for datetime types.
 */
export function unknown(): gen.Arbitrary<model.UnknownType> {
  return gen.constant(model.unknown())
}

/**
 * @returns A generator for timestamp types' options.
 *          All of its keys are optional and may be omitted in the generated options.
 */
export function timestampTypeOptions(): gen.Arbitrary<model.CustomTypeOptions<model.TimestampOptions>> {
  return gen
    .record(
      {
        ...baseOptionsGeneratorsRecord(),
        minimum: orUndefined(gen.date()),
        maximum: orUndefined(gen.date()),
      },
      { withDeletedKeys: true },
    )
    .map((options) => {
      if (options.maximum && options.minimum && options.maximum.getTime() < options.minimum.getTime()) {
        return { ...options, maximum: options.minimum, minimum: options.minimum }
      }
      return options
    })
}

/**
 * @returns A generator for timestamp types.
 */
export function timestamp(): gen.Arbitrary<model.TimestampType> {
  return orUndefined(timestampTypeOptions()).map(model.timestamp)
}

/**
 * @returns A generator for record types.
 */
export function record<T extends model.Type>(fieldTypeGen: gen.Arbitrary<T>): gen.Arbitrary<model.RecordType<T>> {
  return fieldTypeGen.map(model.record)
}

/**
 * Turns a record into a record of generators: each of its fields is wrapped in an Arbitrary.
 * @example ```ts
 *          GeneratorsRecord<{ field1: number, field2: string }>
 *          // -> { field1: Arbitrary<number>, field2: Arbitrary<string> }
 *          ```
 */
export type GeneratorsRecord<R extends Record<string, any>> = { [Key in keyof R]: gen.Arbitrary<R[Key]> }

/**
 * @return A generator for union types' options.
 *         All of its keys are optional and may be omitted in the generated options.
 */
export function unionTypeOptions(): gen.Arbitrary<model.UnionTypeOptions> {
  return gen.record({
    ...baseOptions,
    // This can cause problem on tests like 'encoding is the inverse of decoding' because with union
    // this is not always true. Take for example this type:
    // model.union({ v1: model.object({}), v2: model.object({ a: model.number() }) })
    // the encoding of { a: 1 } is { a: 1 }, the decoding of { a: 1 } could be {} if we enable 'allowAdditionalFields' option
  })
}

/**
 * @param variantsGenerators a generator for the variants of the randomly generated union type
 * @returns a generator for a union type
 */
export function union<Vs extends model.Types>(
  variantsGenerators: GeneratorsRecord<Vs>,
): gen.Arbitrary<model.UnionType<Vs>> {
  return orUndefined(unionTypeOptions()).chain((options) => {
    return gen.record(variantsGenerators).map((variants) => {
      return model.union(variants, options)
    })
  })
}

/**
 * @returns A generator for object types' options.
 *          All of its keys are optional and may be omitted in the generated options.
 */
export function objectTypeOptions(): gen.Arbitrary<model.ObjectTypeOptions> {
  return baseOptions()
}

/**
 * @param fieldsGenerators a generator for the fields of the randomly generated object type
 * @returns a generator for an object type that can either be mutable or immutable
 */
export function object<Ts extends model.Types>(
  fieldsGenerators: GeneratorsRecord<Ts>,
): gen.Arbitrary<
  | model.ObjectType<model.Mutability, utils.RichFieldsToTypes<Ts>>
  | (() => model.ObjectType<model.Mutability, utils.RichFieldsToTypes<Ts>>)
> {
  const objectGenerator = gen.oneof(immutableObject(fieldsGenerators), mutableObject(fieldsGenerators))
  const makeLazy = <A>(value: A) => {
    return () => value
  }
  return withChanceOneIn(2, objectGenerator, makeLazy)
}

/**
 * @param fieldsGenerators a generator for the fields of the randomly generated entity type
 * @returns a generator for an object type that can either be mutable or immutable
 */
export function entity<Ts extends model.Types>(
  fieldsGenerators: GeneratorsRecord<Ts>,
): gen.Arbitrary<
  | model.EntityType<model.Mutability, utils.RichFieldsToTypes<Ts>>
  | (() => model.EntityType<model.Mutability, utils.RichFieldsToTypes<Ts>>)
> {
  const objectGenerator = gen.oneof(immutableEntity(fieldsGenerators), mutableEntity(fieldsGenerators))
  const makeLazy = <A>(value: A) => {
    return () => value
  }
  return withChanceOneIn(2, objectGenerator, makeLazy)
}

/**
 * @param fieldsGenerators a generator for the fields of the randomly generated object type
 * @returns a generator for an immutable object type
 */
export function immutableObject<Ts extends model.Types>(
  fieldsGenerators: GeneratorsRecord<Ts>,
): gen.Arbitrary<model.ObjectType<model.Mutability.Immutable, utils.RichFieldsToTypes<Ts>>> {
  return orUndefined(objectTypeOptions()).chain((options) => {
    return gen.record(fieldsGenerators).map((fields) => {
      return model.object(fields, options)
    })
  })
}

/**
 * @param fieldsGenerators a generator for the fields of the randomly generated object type
 * @returns a generator for a mutable object type
 */
export function mutableObject<Ts extends model.Types>(
  fieldsGenerators: GeneratorsRecord<Ts>,
): gen.Arbitrary<model.ObjectType<model.Mutability.Mutable, utils.RichFieldsToTypes<Ts>>> {
  return orUndefined(objectTypeOptions()).chain((options) => {
    return gen.record(fieldsGenerators).map((fields) => {
      return model.mutableObject(fields, options)
    })
  })
}

/**
 * @returns A generator for entity types' options.
 *          All of its keys are optional and may be omitted in the generated options.
 */
export function entityTypeOptions(): gen.Arbitrary<model.EntityTypeOptions> {
  return baseOptions()
}

/**
 * @param fieldsGenerators a generator for the fields of the randomly generated entity type
 * @returns a generator for an immutable entity type
 */
export function immutableEntity<Ts extends model.Types>(
  fieldsGenerators: GeneratorsRecord<Ts>,
): gen.Arbitrary<model.EntityType<model.Mutability.Immutable, utils.RichFieldsToTypes<Ts>>> {
  return orUndefined(entityTypeOptions()).chain((options) => {
    return gen.record(fieldsGenerators).map((fields) => {
      return model.entity(fields, options)
    })
  })
}

/**
 * @param fieldsGenerators a generator for the fields of the randomly generated entity type
 * @returns a generator for a mutable entity type
 */
export function mutableEntity<Ts extends model.Types>(
  fieldsGenerators: GeneratorsRecord<Ts>,
): gen.Arbitrary<model.EntityType<model.Mutability.Mutable, utils.RichFieldsToTypes<Ts>>> {
  return orUndefined(entityTypeOptions()).chain((options) => {
    return gen.record(fieldsGenerators).map((fields) => {
      return model.mutableEntity(fields, options)
    })
  })
}

/**
 * @returns A generator for array types' options.
 *          All of its keys are optional and may be omitted in the generated options.
 */
export function arrayTypeOptions(): gen.Arbitrary<model.ArrayTypeOptions> {
  return gen.integer({ min: 0, max: 5 }).chain((min) => {
    return gen.integer({ min, max: 5 }).chain((max) => {
      return gen.record(
        {
          ...baseOptionsGeneratorsRecord(),
          minItems: gen.constant(min),
          maxItems: gen.constant(max),
        },
        {
          withDeletedKeys: true,
        },
      )
    })
  })
}

/**
 * @param wrappedTypeGenerator a generator for the type wrapped by the randomly generated array type
 * @returns a generator for an array type that could either be mutable or immutable
 */
export function array<T extends model.Type>(
  wrappedTypeGenerator: gen.Arbitrary<T>,
): gen.Arbitrary<model.ArrayType<model.Mutability, T>> {
  return gen.oneof(immutableArray(wrappedTypeGenerator), mutableArray(wrappedTypeGenerator))
}

/**
 * @param wrappedTypeGenerator a generator for the type wrapped by the randomly generated array type
 * @returns a generator for an immutable array type
 */
export function immutableArray<T extends model.Type>(
  wrappedTypeGenerator: gen.Arbitrary<T>,
): gen.Arbitrary<model.ArrayType<model.Mutability.Immutable, T>> {
  return orUndefined(arrayTypeOptions()).chain((options) => {
    return wrappedTypeGenerator.map((wrappedType) => {
      return model.array(wrappedType, options)
    })
  })
}

/**
 * @param wrappedTypeGenerator a generator for the type wrapped by the randomly generated array type
 * @returns a generator for a mutable array type
 */
export function mutableArray<T extends model.Type>(
  wrappedTypeGenerator: gen.Arbitrary<T>,
): gen.Arbitrary<model.ArrayType<model.Mutability.Mutable, T>> {
  return orUndefined(arrayTypeOptions()).chain((options) => {
    return wrappedTypeGenerator.map((wrappedType) => {
      return model.mutableArray(wrappedType, options)
    })
  })
}

/**
 * @returns A generator for optional types' options.
 *          All of its keys are optional and may be omitted in the generated options.
 */
export function optionalTypeOptions(): gen.Arbitrary<model.OptionalTypeOptions> {
  return baseOptions()
}

/**
 * @param wrappedTypeGenerator a generator for the type wrapped by the randomly generated optional type
 * @param defaultValueGenerator an optional generator for the default type to assign to the randomly generated optional
 *        value
 * @returns a generator for optional types
 */
export function optional<T extends model.Type>(
  wrappedTypeGenerator: gen.Arbitrary<T>,
): gen.Arbitrary<model.OptionalType<T>> {
  return orUndefined(optionalTypeOptions()).chain((options) => {
    return wrappedTypeGenerator.map((wrappedType) => {
      return model.optional(wrappedType, options)
    })
  })
}

/**
 * @returns A generator for nullable types' options.
 *          All of its keys are optional and may be omitted in the generated options.
 */
export function nullableTypeOptions(): gen.Arbitrary<model.NullableTypeOptions> {
  return baseOptions()
}

/**
 * @param wrappedTypeGenerator a generator for the type wrapped by the randomly generated nullable type
 * @returns a generator for nullable types
 */
export function nullable<T extends model.Type>(
  wrappedTypeGenerator: gen.Arbitrary<T>,
): gen.Arbitrary<model.NullableType<T>> {
  return orUndefined(nullableTypeOptions()).chain((options) => {
    return wrappedTypeGenerator.map((wrappedType) => {
      return model.nullable(wrappedType, options)
    })
  })
}

export function customType(maxDepth: number): gen.Arbitrary<model.Type> {
  //could be improved by giving options
  const nonDeepCustom = [
    gen.constant(model.countryCode()),
    gen.constant(model.currency()),
    gen.constant(model.date()),
    gen.constant(model.datetime()),
    gen.constant(model.email()),
    gen.constant(model.ip()),
    gen.constant(model.isbn()),
    gen.constant(model.json()),
    gen.constant(model.latitude()),
    gen.constant(model.locale()),
    gen.constant(model.longitude()),
    gen.constant(model.mac()),
    //gen.constant(model.never()),
    gen.constant(model.phoneNumber()),
    gen.constant(model.port()),
    gen.constant(model.rgb()),
    gen.constant(model.rgba()),
    gen.constant(model.time()),
    gen.constant(model.timestamp()),
    gen.constant(model.unknown()),
    gen.constant(model.url()),
    gen.constant(model.uuid()),
    gen.constant(model.version()),
  ]
  return maxDepth <= 1
    ? gen.oneof(...nonDeepCustom)
    : gen.oneof(
        arbitraryModel(maxDepth - 1).map((t) => model.record(t)),
        ...nonDeepCustom,
      )
}

/**
 * @param maxDepth the maximum depth of the generated type
 * @returns a generator for random types
 */
export function arbitraryModel(maxDepth: number = 3): gen.Arbitrary<model.Type> {
  return maxDepth <= 1
    ? gen.oneof(baseType(), customType(maxDepth))
    : gen.oneof(
        wrapperType(maxDepth),
        objectType(maxDepth),
        entityType(maxDepth),
        unionType(),
        baseType(),
        customType(maxDepth),
      )
}

/**
 * Generator for a non empty array of random strings.
 */
function nonEmptyStringArray(): gen.Arbitrary<[string, ...string[]]> {
  return gen.string().chain((first) => {
    return gen.array(gen.string()).map((rest) => {
      return [first, ...rest]
    })
  })
}
/**
 * Generator for values that can be used to create a Literal type.
 */
function literalValue(): gen.Arbitrary<boolean | string | number> {
  return gen.oneof(gen.string(), gen.integer(), gen.boolean())
}

/**
 * Generator for base types: numbers, strings, booleans, enumerations and literals.
 */
export function baseType(): gen.Arbitrary<
  | model.NumberType
  | model.StringType
  | model.BooleanType
  | model.EnumType<[string, ...string[]]>
  | model.LiteralType<boolean | string | number | undefined | null>
  | model.CustomType<string, any, any>
> {
  return gen.oneof(
    number(),
    string(),
    boolean(),
    enumeration(nonEmptyStringArray()),
    literal(literalValue()),
    nullType(),
    undefinedType(),
    datetime(),
    timestamp(),
    unknown(),
  )
}

/**
 * Generator for wrapper types: reference, optional, nullable and array.
 */
export function wrapperType(
  maxDepth: number = 3,
  wrappedType: gen.Arbitrary<model.Type> = arbitraryModel(maxDepth - 1),
): gen.Arbitrary<
  | model.OptionalType<model.Type>
  | model.NullableType<model.Type>
  | model.RecordType<model.Type>
  | model.ArrayType<model.Mutability, model.Type>
> {
  return gen.oneof(optional(wrappedType), nullable(wrappedType), array(wrappedType), record(wrappedType))
}

/**
 * Generator for a generic object type.
 */
function objectType(maxDepth: number): gen.Arbitrary<model.Type> {
  const fieldName = gen.string().filter((s) => !forbiddenObjectFields.includes(s))
  return gen.dictionary(fieldName, gen.constant(arbitraryModel(maxDepth - 1))).chain(object)
}

/**
 * Generator for a generic object type.
 */
function entityType(maxDepth: number): gen.Arbitrary<model.Type> {
  const fieldName = gen.string().filter((s) => !forbiddenObjectFields.includes(s))
  return gen.dictionary(fieldName, gen.constant(arbitraryModel(maxDepth - 1))).chain(entity)
}

/**
 * Generator for a generic enum type.
 */
function unionType(): gen.Arbitrary<model.Type> {
  return gen
    .dictionary(gen.string(), gen.oneof(gen.constant(number()), gen.constant(boolean())), { minKeys: 1 })
    .chain((variantsGenerators) => {
      return union(variantsGenerators)
    })
}

/**
 * @param chances the number used to determine the chance of transforming the provided generator
 * @param generator the generator to apply the map function to
 * @param map the function that may applied to the values generated by the generator
 * @returns a new generator where, with a chance of 1 in `chances` its generated values will be trasformed
 *          using the provided `map` function
 */
function withChanceOneIn<A, B>(chances: number, generator: gen.Arbitrary<A>, map: (_: A) => B): gen.Arbitrary<A | B> {
  return generator.chain((value) => {
    return gen.integer({ min: 1, max: chances }).map((chance) => {
      return chance === 1 ? map(value) : value
    })
  })
}

/**
 * A record with the same structure as `BaseOptions` but with generators for fields.
 */
function baseOptionsGeneratorsRecord() {
  return {
    name: gen.string(),
    description: gen.string(),
    sensitive: gen.boolean(),
  }
}

/**
 * @param generator a generator for arbitrary values
 * @returns a new generator that may also generate the undefined value
 */
function orUndefined<A>(generator: gen.Arbitrary<A>): gen.Arbitrary<A | undefined> {
  return gen.oneof(gen.constant(undefined), generator)
}

export function modelAndValue(typeDepth: number = 3, valueDepth: number = 3): gen.Arbitrary<[model.Type, never]> {
  return arbitraryModel(typeDepth)
    .filter(canGenerateValueFrom)
    .chain((type) => {
      return model
        .concretise(type)
        .arbitrary(valueDepth)
        .map((value) => {
          return [type, value as never]
        })
    })
}

export function canGenerateValueFrom(type: model.Type): boolean {
  // This is just an ugly hack for now but really effective! If the constructor does not throw then I can
  // generate a type for it
  try {
    model.concretise(type).arbitrary(1)
    return true
  } catch {
    return false
  }
}
