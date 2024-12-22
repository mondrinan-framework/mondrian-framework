import { decoding } from '@mondrian-framework/model'
import { functions, module } from '@mondrian-framework/module'

/**
 * The Direct API specification of a mondrian {@link module.ModuleInterface Module Interface}
 * It does not contains the implementation. In order to instantiate this you should use {@link define}.
 *
 * It's also the minimum information needed to instantiate a client.
 */
export type ApiSpecification<Fs extends functions.FunctionInterfaces, Exclusions extends { [K in keyof Fs]?: true }> = {
  exclusions: Exclusions
  options?: {
    path?: string
  }
  module: module.ModuleInterface<Fs>
}

/**
 * The same of {@link ApiSpecification} but this contains the {@link module.Module Module} so
 * this contains also the function implementations. With an instance of {@link Api} it is possible
 * to serve the module with a Direct server. In order to instantiate this you should use {@link build}.
 */
export type Api<
  Fs extends functions.FunctionImplementations,
  Exclusions extends { [K in keyof Fs]?: true },
> = ApiSpecification<Fs, Exclusions> & {
  module: module.Module<Fs>
}

/**
 * Builds a Direct API in order to expose the module.
 */
export function build<Fs extends functions.FunctionImplementations, Exclusions extends { [K in keyof Fs]?: true }>(
  api: Api<Fs, Exclusions>,
): Api<Fs, Exclusions> {
  //assertApiValidity(api) //TODO [Good first issue]: as rest.assertApiValidity
  return api
}

/**
 * Defines the Direct API with just the module interface.
 */
export function define<Fs extends functions.FunctionInterfaces, Exclusions extends { [K in keyof Fs]?: true }>(
  api: ApiSpecification<Fs, Exclusions>,
): ApiSpecification<Fs, Exclusions> {
  //assertApiValidity(api) //TODO [Good first issue]: as rest.assertApiValidity
  return api
}

/**
 * Options used by the Direct server
 */
export type ServeOptions = {
  readonly decodeOptions: Required<decoding.Options>
  readonly introspection?: boolean
}

/**
 * Default options used by the Direct server
 */
export const DEFAULT_SERVE_OPTIONS: ServeOptions = {
  decodeOptions: {
    errorReportingStrategy: 'stopAtFirstError',
    fieldStrictness: 'expectExactFields',
    typeCastingStrategy: 'expectExactTypes',
  },
  introspection: false,
}
