import { CustomTypeSpecifications } from './openapi'
import { assertApiValidity } from './utils'
import { decoding } from '@mondrian-framework/model'
import { functions, logger, module } from '@mondrian-framework/module'
import { KeysOfUnion, http } from '@mondrian-framework/utils'
import { OpenAPIV3_1 } from 'openapi-types'

/**
 * The REST API specification of a mondrian {@link module.ModuleInterface ModuleInterface}
 * This contains all information needed to generate an openapi specification document.
 * It does not contains the implementation. In order to instantiate this you should use {@link define}.
 */
export type ApiSpecification<Fs extends functions.FunctionInterfaces> = {
  /**
   * The current api version. Must be an integer greater than or quelas to 1.
   */
  version: number
  /**
   * Functions specification map.
   */
  functions: {
    [K in keyof Fs]?: FunctionSpecifications<Fs[K]> | FunctionSpecifications<Fs[K]>[]
  }
  options?: {
    /**
     * Endpoints will be populated without the domain part if not specified
     */
    endpoints?: string[]
    /**
     * Default is /api
     */
    pathPrefix?: string
    /**
     * Preferred decoding options that will override the module ones.
     */
    decodingOptions?: decoding.Options
  }
  /**
   * Available openapi securities. The key is used as reference in the function specification.
   */
  securities?: Record<string, OpenAPIV3_1.SecuritySchemeObject>
  /**
   * Shared error codes.
   */
  errorCodes?: {
    [K in KeysOfUnion<
      {
        [K2 in keyof Fs]: Exclude<Fs[K2]['errors'], undefined> extends never
          ? never
          : Exclude<Fs[K2]['errors'], undefined>
      }[keyof Fs]
    >]?: number
  }
  /**
   * Interface of the module
   */
  module: module.ModuleInterface<Fs>

  /**
   * Custom type map
   */
  customTypeSchemas?: CustomTypeSpecifications
}

/**
 * The same of {@link ApiSpecification} but this contains the {@link module.Module Module} so
 * this contains also the function implementations. With an instance of {@link Api} it is possible
 * to serve the module with a rest server. In order to instantiate this you should use {@link build}.
 */
export type Api<Fs extends functions.FunctionImplementations> = ApiSpecification<Fs> & {
  /**
   * Module to serve
   */
  module: module.Module<Fs>
}

/**
 * Builds a REST API in order to expose the module.
 */
export function build<Fs extends functions.FunctionImplementations>(api: Api<Fs>): Api<Fs> {
  return { ...define(api), module: api.module }
}

/**
 * Defines the REST API with just the module interface.
 */
export function define<Fs extends functions.FunctionInterfaces>(api: ApiSpecification<Fs>): ApiSpecification<Fs> {
  assertApiValidity(api)
  return api
}

export type ErrorHandler<Fs extends functions.Functions, ServerContext> = (args: {
  error: unknown
  logger: logger.MondrianLogger
  functionName: keyof Fs
  tracer: functions.Tracer
  http: {
    request: http.Request
    serverContext: ServerContext
  }
}) => Promise<http.Response | void>

export type FunctionSpecifications<F extends functions.FunctionInterface = functions.FunctionInterface> = {
  method?: http.Method
  path?: string
  inputName?: string
  version?: { min?: number; max?: number }
  responseHeaders?: { [header: string]: OpenAPIV3_1.ReferenceObject | OpenAPIV3_1.HeaderObject }
  errorCodes?: { [K in keyof Exclude<F['errors'], undefined>]?: number }
  namespace?: string | null
  security?: OpenAPIV3_1.SecurityRequirementObject[]
  contentType?: 'application/json' | 'text/plain' | 'text/html' | 'text/csv'
  decodingOptions?: decoding.Options
}

/**
 * Options used by the REST server
 */
export type ServeOptions = {
  readonly introspection?:
    | {
        readonly path: string
        readonly ui: 'swagger' | 'scalar' | 'redoc' | 'none'
      }
    | false
}

/**
 * Default options used by the REST server
 */
export const DEFAULT_SERVE_OPTIONS: ServeOptions = {
  introspection: false,
}
