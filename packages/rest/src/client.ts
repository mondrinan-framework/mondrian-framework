import { rest } from '.'
import { emptyInternalData, generateOpenapiInput } from './openapi'
import { completeRetrieve, encodeQueryObject, methodFromOptions } from './utils'
import { result, model } from '@mondrian-framework/model'
import { functions, retrieve, client } from '@mondrian-framework/module'

export type RestClient<Fs extends functions.FunctionInterfaces> = {
  functions: RestClientFunctions<Fs>
  withHeaders: (headers: Record<string, string>) => RestClient<Fs>
}

type RestClientFunctions<F extends functions.FunctionInterfaces> = {
  [K in keyof F]: RestClientFunction<F[K]['input'], F[K]['output'], F[K]['errors'], F[K]['retrieve']>
}

type RestClientFunction<
  InputType extends model.Type,
  OutputType extends model.Type,
  E extends functions.ErrorType,
  C extends retrieve.FunctionCapabilities | undefined,
> =
  model.IsLiteral<InputType, undefined> extends true
    ? <const P extends retrieve.FromType<OutputType, Exclude<C, undefined>>>(options?: {
        retrieve?: P
      }) => Promise<client.ClientFunctionResult<OutputType, E, C, P>>
    : <const P extends retrieve.FromType<OutputType, Exclude<C, undefined>>>(
        input: model.Infer<InputType>,
        options?: { retrieve?: P },
      ) => Promise<client.ClientFunctionResult<OutputType, E, C, P>>

class RestClientBuilder {
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
  }): RestClient<Fs> {
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
        const retrieveType = retrieve.fromType(functionBody.output, functionBody.retrieve)
        const defaultRetrieve = retrieveType.isOk ? completeRetrieve({ select: {} }, functionBody.output) : {}

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
          let options:
            | {
                retrieve?: retrieve.GenericRetrieve
              }
            | undefined = undefined
          if (model.isLiteral(functionBody.input, undefined)) {
            options = p1 as { retrieve?: retrieve.GenericRetrieve }
          } else {
            input = p1
            options = p2 as { retrieve?: retrieve.GenericRetrieve }
          }
          const encodedInput = concreteInputType.encodeWithoutValidation(input as never)
          const { body, path, params } = output(encodedInput)
          const method = lastSpecification?.method ?? methodFromOptions(functionBody.options)
          let query: string | undefined
          if (options?.retrieve) {
            const where = options.retrieve.where ? encodeQueryObject(options.retrieve.where, 'where') : null
            const select = options.retrieve.select ? encodeQueryObject(options.retrieve.select, 'select') : null
            const order = options.retrieve.orderBy ? encodeQueryObject(options.retrieve.orderBy, 'orderBy') : null
            const skip = options.retrieve.skip ? `skip=${options.retrieve.skip}` : null
            const take = options.retrieve.take ? `take=${options.retrieve.take}` : null
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
          const resultBody = await fetchResult.text()
          if (fetchResult.status === 200) {
            const fetchBodyResult = fetchResult.headers.get('Content-Type')?.includes('application/json')
              ? JSON.parse(resultBody)
              : resultBody

            let functionResult
            if (retrieveType.isOk) {
              const typeToRespect = retrieve.selectedType(functionBody.output, options?.retrieve ?? defaultRetrieve)
              functionResult = model.concretise(typeToRespect).decode(fetchBodyResult as never, {
                errorReportingStrategy: 'allErrors',
                fieldStrictness: 'allowAdditionalFields',
              })
            } else {
              functionResult = concreteOutputType.decode(fetchBodyResult, {
                errorReportingStrategy: 'allErrors',
                fieldStrictness: 'allowAdditionalFields',
              })
            }

            if (functionResult.isFailure) {
              throw new Error(`Invalid output for function ${functionName}: ${JSON.stringify(functionResult.error)}`)
            }
            if (functionBody.errors) {
              return result.ok(functionResult.value)
            } else {
              return functionResult.value
            }
          } else if (functionBody.errors) {
            try {
              const error = JSON.parse(resultBody)
              const keyToParse = Object.keys(error).find((key) => Object.keys(concreteErrorTypes).includes(key))
              if (typeof error === 'object' && keyToParse) {
                const errorType = concreteErrorTypes[keyToParse]
                const decodedError = errorType.decode(error[keyToParse])
                if (decodedError.isFailure) {
                  throw new Error(`Invalid error for function ${functionName}: ${JSON.stringify(decodedError.error)}`)
                }
                return result.fail({ [keyToParse]: decodedError.value })
              }
            } catch {}
          }
          throw new Error(`Error calling function ${functionName}. ${fetchResult.statusText}: ${resultBody}`)
        }
        return [functionName, wrapper]
      }),
    )
    return {
      functions: fs as unknown as RestClientFunctions<Fs>,
      withHeaders: (headers) => withHeaders(headers).build({ rest, endpoint }),
    }
  }
}

export function withHeaders(headers?: Record<string, string>): RestClientBuilder {
  return new RestClientBuilder(headers)
}

export function build<Fs extends functions.FunctionInterfaces>(args: {
  endpoint: string
  rest: rest.ApiSpecification<Fs>
  headers?: Record<string, string>
}): RestClient<Fs> {
  return withHeaders(args.headers).build({ endpoint: args.endpoint, rest: args.rest })
}
