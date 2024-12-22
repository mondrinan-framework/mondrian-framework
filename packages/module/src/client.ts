import { functions, module, retrieve } from '.'
import { logger as mondrianLogger } from '.'
import { result, model } from '@mondrian-framework/model'

export type Client<F extends functions.Functions, Metadata> = {
  functions: ClientFunctions<F, Metadata>
  withMetadata: (metadata: Metadata) => Client<F, Metadata>
}

type ClientFunctions<F extends functions.Functions, Metadata> = {
  [K in keyof F]: ClientFunction<F[K]['input'], F[K]['output'], F[K]['errors'], F[K]['retrieve'], Metadata>
}

type ClientFunction<
  InputType extends model.Type,
  OutputType extends model.Type,
  E extends functions.ErrorType,
  C extends retrieve.FunctionCapabilities | undefined,
  Metadata,
> =
  model.IsLiteral<InputType, undefined> extends true
    ? <const P extends retrieve.FromType<OutputType, Exclude<C, undefined>>>(options?: {
        retrieve?: P
        metadata?: Metadata
      }) => Promise<ClientFunctionResult<OutputType, E, C, P>>
    : <const P extends retrieve.FromType<OutputType, Exclude<C, undefined>>>(
        input: model.Infer<InputType>,
        options?: { retrieve?: P; metadata?: Metadata },
      ) => Promise<ClientFunctionResult<OutputType, E, C, P>>

export type ClientFunctionResult<
  O extends model.Type,
  E extends functions.ErrorType,
  C extends retrieve.FunctionCapabilities | undefined,
  P extends retrieve.FromType<O, C>,
> = [Exclude<E, undefined>] extends [never]
  ? Project<O, P>
  : result.Result<Project<O, P>, { [K in keyof Exclude<E, undefined>]?: model.Infer<Exclude<E, undefined>[K]> }>

/**
 * Infer a subset of a Mondrian type `T` based on a retrieve `P`
 * If not explicitly required, all embedded entities are excluded.
 **/
// prettier-ignore
type Project<T extends model.Type, R extends retrieve.GenericRetrieve>
  = [R] extends [{ select: infer Select }] ? Select extends retrieve.GenericSelect ? InferSelection<T, Select>
    : InferReturn<T>
  : InferReturn<T>

// prettier-ignore
type InferSelection<T extends model.Type, S extends retrieve.GenericSelect> 
  = [S] extends [{ readonly [K in string]?: retrieve.GenericRetrieve | boolean }] ? InferSelectionInternal<T, S>
  : InferReturn<T> //TODO: in cases of field starting with _ we should add optionality (example _count)

// prettier-ignore
type InferSelectionInternal<T extends model.Type, P extends { readonly [K in string]?: retrieve.GenericRetrieve | boolean }>
  = [T] extends [model.NumberType] ? number
  : [T] extends [model.StringType] ? string
  : [T] extends [model.BooleanType] ? boolean
  : [T] extends [model.LiteralType<infer L>] ? L
  : [T] extends [model.CustomType<any, any, infer InferredAs>] ? InferredAs
  : [T] extends [model.EnumType<infer Vs>] ? Vs[number]
  : [T] extends [model.OptionalType<infer T1>] ? undefined | InferSelectionInternal<T1, P>
  : [T] extends [model.NullableType<infer T1>] ? null | InferSelectionInternal<T1, P>
  : [T] extends [model.ArrayType<infer M, infer T1>] ? M extends model.Mutability.Immutable ? readonly InferSelectionInternal<T1, P>[] : InferSelectionInternal<T1, P>[]
  : [T] extends [model.ObjectType<infer M, infer Ts>] ? InferObject<M, Ts, P>
  : [T] extends [model.EntityType<infer M, infer Ts>] ? InferObject<M, Ts, P>
  : [T] extends [model.UnionType<any>] ? InferReturn<T>
  : [T] extends [(() => infer T1 extends model.Type)] ? InferSelectionInternal<T1, P>
  : never

// prettier-ignore
type InferObject<M extends model.Mutability, Ts extends model.Types, P extends { readonly [K in string]?: retrieve.GenericRetrieve | boolean }> =
  model.ApplyObjectMutability<M,
    { [Key in (NonUndefinedKeys<P> & model.NonOptionalKeys<Ts>)]: IsObjectOrEntity<Ts[Key]> extends true ? P[Key] extends retrieve.GenericRetrieve ? Project<Ts[Key], P[Key]> : P[Key] extends true ? InferReturn<Ts[Key]> : never : P[Key] extends { readonly [K in string]?: retrieve.GenericRetrieve | boolean } ? InferSelectionInternal<Ts[Key], P[Key]> : InferSelectionInternal<Ts[Key], {}> } &
    { [Key in (NonUndefinedKeys<P> & model.OptionalKeys<Ts>)]?:   IsObjectOrEntity<Ts[Key]> extends true ? P[Key] extends retrieve.GenericRetrieve ? Project<Ts[Key], P[Key]> : P[Key] extends true ? InferReturn<Ts[Key]> : never : P[Key] extends { readonly [K in string]?: retrieve.GenericRetrieve | boolean } ? InferSelectionInternal<Ts[Key], P[Key]> : InferSelectionInternal<Ts[Key], {}> }
  >

// prettier-ignore
type NonUndefinedKeys<P extends Record<string, unknown>> = {
  [K in keyof P]: [Exclude<P[K], undefined>] extends [never] ? never : [Exclude<P[K], undefined>] extends [false] ? never : K
}[keyof P]

// prettier-ignore
type IsObjectOrEntity<T extends model.Type> 
  = [T] extends [model.EntityType<any, any>] ? true
  : [T] extends [model.ObjectType<any, any>] ? true
  : [T] extends [model.OptionalType<infer T1>] ? IsObjectOrEntity<T1>
  : [T] extends [model.NullableType<infer T1>] ? IsObjectOrEntity<T1>
  : [T] extends [model.ArrayType<any, infer T1>] ? IsObjectOrEntity<T1>
  : [T] extends [() => infer T1 extends model.Type] ? IsObjectOrEntity<T1>
  : false

/**
 * Similar to {@link model.Infer Infer} but the embedded entities are inferred as optional.
 * @example ```ts
 *          const Model = () => model.object({
 *            field1: model.number(),
 *            embedded: Model,
 *          })
 *          type Model = model.InferReturn<typeof Model>
 *          // Type = { readonly field1: number, readonly embedded?: Type }
 *          ```
 */
//prettier-ignore
type InferReturn<T extends model.Type>
  = [T] extends [model.NumberType] ? number
  : [T] extends [model.StringType] ? string
  : [T] extends [model.BooleanType] ? boolean
  : [T] extends [model.LiteralType<infer L>] ? L
  : [T] extends [model.CustomType<any, any, infer InferredAs>] ? InferredAs
  : [T] extends [model.EnumType<infer Vs>] ? Vs[number]
  : [T] extends [model.OptionalType<infer T1>] ? undefined | InferReturn<T1>
  : [T] extends [model.NullableType<infer T1>] ? null | InferReturn<T1>
  : [T] extends [model.ArrayType<infer M, infer T1>] ? InferReturnArray<M, T1>
  : [T] extends [model.ObjectType<infer M, infer Ts>] ? InferReturnObject<M, Ts>
  : [T] extends [model.EntityType<infer M, infer Ts>] ? InferReturnEntity<M, Ts>
  : [T] extends [model.UnionType<infer Ts>] ? InferReturnUnion<Ts>
  : [T] extends [(() => infer T1 extends model.Type)] ? InferReturn<T1>
  : never

// prettier-ignore
type InferReturnObject<M extends model.Mutability, Ts extends model.Types> =
  model.ApplyObjectMutability<M,
    { [Key in NonOptionalKeysReturn<Ts>]: InferReturn<Ts[Key]> } &
    { [Key in OptionalKeysReturn<Ts>]?: InferReturn<Ts[Key]> }
  >

// prettier-ignore
type InferReturnEntity<M extends model.Mutability, Ts extends model.Types> =
  model.ApplyObjectMutability<M,
    { [Key in NonOptionalKeysReturn<Ts>]: InferReturn<Ts[Key]> } &
    { [Key in OptionalKeysReturn<Ts>]?: InferReturn<Ts[Key]> }
  >

// prettier-ignore
type InferReturnUnion<Ts extends model.Types> = { [Key in keyof Ts]: InferReturn<Ts[Key]> }[keyof Ts]

// prettier-ignore
type InferReturnArray<M, T extends model.Type> = M extends model.Mutability.Immutable ? readonly InferReturn<T>[] : InferReturn<T>[]

type OptionalKeysReturn<T extends model.Types> = {
  [K in keyof T]: model.IsOptional<T[K]> extends true ? K : IsEntity<T[K]> extends true ? never : never
}[keyof T]

type NonOptionalKeysReturn<T extends model.Types> = {
  [K in keyof T]: model.IsOptional<T[K]> extends true ? never : IsEntity<T[K]> extends true ? never : K
}[keyof T]

//prettier-ignore
type IsEntity<T extends model.Type> 
  = [T] extends [model.EntityType<any, any>] ? true
  : [T] extends [model.OptionalType<infer T1>] ? IsEntity<T1>
  : [T] extends [model.NullableType<infer T1>] ? IsEntity<T1>
  : [T] extends [model.ArrayType<any, infer T1>] ? IsEntity<T1>
  : [T] extends [(() => infer T1 extends model.Type)] ? IsEntity<T1>
  : false

class ClientBuilder<const Metadata> {
  private metadata?: Metadata

  constructor(metadata?: Metadata) {
    this.metadata = metadata
  }

  public build<Fs extends functions.FunctionImplementations>({
    module,
    context,
  }: {
    module: module.Module<Fs>
    context: (args: { metadata?: Metadata }) => Promise<module.FunctionsToContextInput<Fs>>
  }): Client<Fs, Metadata> {
    const presetLogger = mondrianLogger.build({ moduleName: module.name, server: 'LOCAL' })
    const fs = Object.fromEntries(
      Object.entries(module.functions).map(([functionName, functionBody]) => {
        const wrapper = async (p1: unknown, p2: unknown) => {
          let input: unknown = undefined
          let options: {
            retrieve?: retrieve.GenericRetrieve
            metadata?: Metadata
          } = {}
          if (model.isLiteral(functionBody.input, undefined)) {
            options = p1 as { retrieve?: retrieve.GenericRetrieve; metadata?: Metadata }
          } else {
            input = p1
            options = p2 as { retrieve?: retrieve.GenericRetrieve; metadata?: Metadata }
          }
          const thisLogger = presetLogger.updateContext({ operationName: functionName })
          try {
            const contextInput = await context({ metadata: options?.metadata ?? this.metadata })
            const result = await functionBody.rawApply({
              rawInput: input as never,
              rawRetrieve: options?.retrieve ?? {},
              contextInput: contextInput as Record<string, unknown>,
              //tracer: functionBody.tracer, //TODO: add opentelemetry istrumentation
              logger: thisLogger,
              decodingOptions: module.options?.preferredDecodingOptions,
            })
            if (!functionBody.errors) {
              if (result.isOk) {
                return result.value
              } else {
                throw new Error(`Unexpected failure result for function ${functionName}`)
              }
            }
            return result
          } catch (error) {
            throw error
          }
        }
        return [functionName, wrapper]
      }),
    )
    return {
      functions: fs as unknown as ClientFunctions<Fs, Metadata>,
      withMetadata: (metadata) => withMetadata(metadata).build({ module, context }),
    }
  }
}

export function withMetadata<const Metadata>(metadata?: Metadata): ClientBuilder<Metadata> {
  return new ClientBuilder(metadata)
}

export function build<Fs extends functions.FunctionImplementations>(args: {
  module: module.Module<Fs>
  context: (args: { metadata?: unknown }) => Promise<module.FunctionsToContextInput<Fs>>
}): Client<Fs, unknown> {
  return withMetadata().build(args)
}
