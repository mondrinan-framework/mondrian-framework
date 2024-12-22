import { ApiSpecification } from './api'
import { Response } from './handler'
import { result, model } from '@mondrian-framework/model'
import { functions, client, retrieve } from '@mondrian-framework/module'
import { flatMapObject, http } from '@mondrian-framework/utils'

export type DirectClient<
  Fs extends functions.FunctionInterfaces,
  E extends functions.ErrorType,
  Exclusions extends { [K in keyof Fs]?: true },
> = {
  functions: DirectClientFunctions<Omit<Fs, keyof Exclusions & keyof Fs>>
  withMetadata: (metadata: Record<string, string>) => DirectClient<Fs, E, Exclusions>
}

type DirectClientFunctions<Fs extends functions.FunctionInterfaces> = {
  [K in keyof Fs]: DirectClientFunction<Fs[K]['input'], Fs[K]['output'], Fs[K]['errors'], Fs[K]['retrieve']>
}

type DirectClientFunction<
  InputType extends model.Type,
  OutputType extends model.Type,
  E extends functions.ErrorType,
  C extends retrieve.FunctionCapabilities | undefined,
> =
  model.IsLiteral<InputType, undefined> extends true
    ? <const P extends retrieve.FromType<OutputType, Exclude<C, undefined>>>(
        input?: undefined,
        options?: [P] extends [never]
          ? { metadata?: Record<string, string> }
          : { retrieve?: P; metadata?: Record<string, string> },
      ) => Promise<client.ClientFunctionResult<OutputType, E, C, P>>
    : <const P extends retrieve.FromType<OutputType, Exclude<C, undefined>>>(
        input: model.Infer<InputType>,
        options?: [P] extends [never]
          ? { metadata?: Record<string, string> }
          : { retrieve?: P; metadata?: Record<string, string> },
      ) => Promise<client.ClientFunctionResult<OutputType, E, C, P>>

/**
 * Builds a new client that will connect to a Mondrian Direct endpoint.
 */
export function build<
  Fs extends functions.FunctionInterfaces,
  E extends functions.ErrorType,
  Exclusions extends { [K in keyof Fs]?: true },
>({
  endpoint,
  api,
  metadata,
  fetchOptions,
}: {
  endpoint: string | http.Handler
  api: ApiSpecification<Fs, Exclusions>
  metadata?: Record<string, string>
  fetchOptions?: Omit<RequestInit, 'method' | 'headers' | 'body'> & { headers?: Record<string, string | undefined> }
}): DirectClient<Fs, E, Exclusions> {
  const funcs = flatMapObject(api.module.functions, (functionName, functionBody) => {
    if (api.exclusions[functionName]) {
      return []
    }
    const retrieveType = retrieve.fromType(functionBody.output, functionBody.retrieve)

    const handler = async (input: never, options?: { retrieve?: never; metadata?: Record<string, string> }) => {
      const responseType = Response(functionBody)

      const inputJson = model.concretise(functionBody.input).encodeWithoutValidation(input)
      const retrieveJson = retrieveType.isOk
        ? model.concretise(retrieveType.value).encodeWithoutValidation(options?.retrieve ?? {})
        : undefined

      const payload = {
        function: functionName,
        input: inputJson,
        retrieve: retrieveJson,
        metadata: options?.metadata ?? metadata,
      }

      let jsonBody: () => Promise<unknown>
      let stringBody: () => Promise<string>
      let status: number
      const request = {
        body: payload,
        method: 'post',
        route: '/',
        headers: { 'Content-Type': 'application/json', ...fetchOptions?.headers },
        params: {},
        query: {},
      } as const satisfies http.Request

      if (typeof endpoint === 'string') {
        const fetchResult = await fetch(endpoint, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(payload),
          ...options,
        })
        status = fetchResult.status
        jsonBody = () => fetchResult.json()
        stringBody = () => fetchResult.text()
      } else {
        const response = await endpoint({
          request,
          serverContext: { request },
        })
        status = response.status
        jsonBody = () => Promise.resolve(response.body)
        stringBody = () =>
          Promise.resolve(typeof response.body === 'string' ? response.body : JSON.stringify(response.body))
      }
      if (status > 299 || status < 200) {
        const errorString = await stringBody().catch(() => '')
        throw new Error(`Unexpected status code: ${status}. ${errorString}`)
      }
      const json = await jsonBody()
      const decoded = responseType.decode(json, {
        errorReportingStrategy: 'stopAtFirstError',
        fieldStrictness: 'expectExactFields',
        typeCastingStrategy: 'expectExactTypes',
      })
      if (decoded.isFailure) {
        throw new Error('Error while decoding response', { cause: decoded.error })
      }
      if (!decoded.value.success) {
        if (decoded.value.reason === 'Function throws error') {
          throw new Error(decoded.value.additionalInfo as string)
        } else {
          throw new Error(decoded.value.reason, { cause: decoded.value.additionalInfo })
        }
      }
      if (functionBody.errors) {
        if ('result' in decoded.value) {
          return result.ok(decoded.value.result)
        } else {
          return result.fail(decoded.value.failure)
        }
      } else {
        if ('result' in decoded.value) {
          return decoded.value.result
        } else {
          throw new Error('Failure should not be present because the function does not declare errors', {
            cause: decoded.value.failure,
          })
        }
      }
    }
    return [[functionName, handler]]
  })

  return {
    functions: funcs as unknown as DirectClient<Fs, E, Exclusions>['functions'],
    withMetadata: (metadata) => build({ endpoint, api, metadata }),
  }
}
