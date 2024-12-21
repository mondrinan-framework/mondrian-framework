import { rest } from '.'
import { emptyInternalData, generateOpenapiInput } from './openapi'
import { encodeQueryObject, methodFromOptions } from './utils'
import { result, model } from '@mondrian-framework/model'
import { functions, retrieve } from '@mondrian-framework/module'

export type Sdk<Fs extends functions.FunctionInterfaces> = {
  functions: SdkFunctions<Fs>
  withHeaders: (headers: Record<string, string>) => Sdk<Fs>
}

type SdkFunctions<F extends functions.FunctionInterfaces> = {
  [K in keyof F]: SdkFunction<F[K]['input'], F[K]['output'], F[K]['errors'], F[K]['retrieve']>
}

type SdkFunction<
  InputType extends model.Type,
  OutputType extends model.Type,
  E extends functions.ErrorType,
  C extends retrieve.FunctionCapabilities | undefined,
> =
  model.IsLiteral<InputType, undefined> extends true
    ? <const P extends retrieve.FromType<OutputType, Exclude<C, undefined>>>(
        retrieve?: P,
      ) => Promise<SdkFunctionResult<OutputType, E, C, P>>
    : <const P extends retrieve.FromType<OutputType, Exclude<C, undefined>>>(
        input: model.Infer<InputType>,
        retrieve?: P,
      ) => Promise<SdkFunctionResult<OutputType, E, C, P>>

type SdkFunctionResult<
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
export type Project<T extends model.Type, R extends retrieve.GenericRetrieve>
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

class SdkBuilder {
  private headers?: Record<string, string>

  constructor(headers?: Record<string, string>) {
    this.headers = headers
  }

  public build<Fs extends functions.FunctionInterfaces>({
    endpoint,
    rest,
  }: {
    endpoint: string
    rest: rest.ApiSpecification<Fs>
  }): Sdk<Fs> {
    endpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint
    const fs = Object.fromEntries(
      Object.entries(rest.module.functions).map(([functionName, functionBody]) => {
        const concreteInputType = model.concretise(functionBody.input)
        const concreteOutputType = model.concretise(functionBody.output)
        const concreteErrorTypes = Object.fromEntries(
          Object.entries(functionBody.errors ?? {}).map(
            ([errorName, errorType]) => [errorName, model.concretise(errorType)] as const,
          ),
        )
        const lastSpecification = Array.isArray(rest.functions[functionName])
          ? rest.functions[functionName].slice(-1)[0]
          : rest.functions[functionName]
        const { output } = lastSpecification
          ? generateOpenapiInput({
              functionBody,
              functionName,
              internalData: emptyInternalData(undefined),
              specification: lastSpecification,
            })
          : { output: undefined }
        const wrapper = async (p1: unknown, p2: unknown) => {
          if (!output || !lastSpecification) {
            throw new Error(`The function ${functionName} is not exposed through the REST API`)
          }
          let input: unknown = undefined
          let retrieve: retrieve.GenericRetrieve | undefined = undefined
          if (model.isLiteral(functionBody.input, undefined)) {
            retrieve = p1 as retrieve.GenericRetrieve | undefined
          } else {
            input = p1
            retrieve = p2 as retrieve.GenericRetrieve | undefined
          }
          try {
            const encodedInput = concreteInputType.encodeWithoutValidation(input as never)
            const { body, path, params } = output(encodedInput)
            const method = lastSpecification?.method ?? methodFromOptions(functionBody.options)
            let query: string | undefined
            if (retrieve) {
              const where = retrieve.where ? encodeQueryObject(retrieve.where, 'where') : null
              const select = retrieve.select ? encodeQueryObject(retrieve.select, 'select') : null
              const order = retrieve.orderBy ? encodeQueryObject(retrieve.orderBy, 'orderBy') : null
              const skip = retrieve.skip ? `skip=${retrieve.skip}` : null
              const take = retrieve.take ? `take=${retrieve.take}` : null
              query = [params, where, select, order, skip, take].filter((x) => x).join('&')
            } else {
              query = params
            }
            const url = `${endpoint}/api/v${lastSpecification.version?.max ?? lastSpecification.version?.min ?? rest.version}${path}${query ? `?${query}` : ''}`
            const fetchResult = await fetch(url, {
              body: JSON.stringify(body),
              headers: {
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...this.headers,
              },
              method,
            })

            if (fetchResult.status === 200) {
              const fetchBodyResult = await fetchResult.json()
              const functionResult = concreteOutputType.decode(fetchBodyResult)
              if (functionResult.isFailure) {
                throw new Error(`Invalid output for function ${functionName}: ${JSON.stringify(functionResult.error)}`)
              }
              return result.ok(functionResult.value)
            } else {
              const error = await fetchResult.json()
              const keyToParse = Object.keys(error).find((key) => Object.keys(concreteErrorTypes).includes(key))
              if (typeof error === 'object' && keyToParse) {
                const errorType = concreteErrorTypes[keyToParse]
                const decodedError = errorType.decode(error[keyToParse])
                if (decodedError.isFailure) {
                  throw new Error(`Invalid error for function ${functionName}: ${JSON.stringify(decodedError.error)}`)
                }
                return result.fail({ [keyToParse]: decodedError.value })
              }
              throw new Error(`Error calling function ${functionName}: ${JSON.stringify(error)}`)
            }
          } catch (error) {
            throw error
          }
        }
        return [functionName, wrapper]
      }),
    )
    return {
      functions: fs as unknown as SdkFunctions<Fs>,
      withHeaders: (headers) => withHeaders(headers).build({ rest, endpoint }),
    }
  }
}

export function withHeaders(headers?: Record<string, string>): SdkBuilder {
  return new SdkBuilder(headers)
}

export function build<Fs extends functions.FunctionInterfaces>(args: {
  endpoint: string
  rest: rest.ApiSpecification<Fs>
  headers?: Record<string, string>
}): Sdk<Fs> {
  return withHeaders(args.headers).build({ endpoint: args.endpoint, rest: args.rest })
}
