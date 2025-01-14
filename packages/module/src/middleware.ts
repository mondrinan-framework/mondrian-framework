import { error, exception, functions, guard, logger, provider, retrieve, security, utils } from '.'
import { applyMapPolicies, checkPolicies as checkPolicyInternal } from './security'
import { result, model, decoding, validation, path } from '@mondrian-framework/model'
import { buildErrorMessage } from '@mondrian-framework/utils'

/**
 * This middleware checks if the requested selection does not exceed the maximum given depth.
 * @param maxDepth the maximum depth.
 */
export function checkMaxSelectionDepth(
  maxDepth: number,
): functions.Middleware<
  model.Type,
  model.Type,
  functions.ErrorType,
  functions.OutputRetrieveCapabilities,
  provider.Providers,
  guard.Guards
> {
  return {
    name: 'Check max selection depth',
    apply: (args, next, thisFunction) => {
      const depth = retrieve.selectionDepth(thisFunction.output, args.retrieve ?? {})
      if (depth > maxDepth) {
        throw new exception.MaxSelectionDepthReached(depth, maxDepth)
      }
      return next(args)
    },
  }
}

/**
 * This middleware checks if the result is compatible with the function's output type and also if it's respecting the given projection.
 * Returning more fields than requested is allowed and the additional fields will be trimmed out.
 * @param onFailure the action to take on failure.
 */
export function checkOutputType(
  onFailure: 'log' | 'throw',
): functions.Middleware<
  model.Type,
  model.Type,
  functions.ErrorType,
  functions.OutputRetrieveCapabilities,
  provider.Providers,
  guard.Guards
> {
  return {
    name: 'Check output type',
    apply: async (args, next, thisFunction) => {
      const originalResult = await next(args)
      if (originalResult.isFailure) {
        if (!thisFunction.errors) {
          throw new Error(
            `Unexpected failure on function ${args.functionName}. It doesn't declare errors nor the module declares errors.`,
          )
        }
        const mappedError = utils.decodeFunctionFailure(originalResult.error, thisFunction.errors, {
          errorReportingStrategy: 'allErrors',
          fieldStrictness: 'expectExactFields',
        })
        if (mappedError.isFailure) {
          handleFailure({ onFailure, functionName: args.functionName, logger: args.logger, result: mappedError })
          return originalResult
        }
        return originalResult
      }

      const retrieveType = retrieve.fromType(thisFunction.output, thisFunction.retrieve)
      const defaultRetrieve = retrieveType.isOk ? { select: {} } : {}

      const typeToRespect = retrieve.selectedType(thisFunction.output, args.retrieve ?? defaultRetrieve)
      const mappedResult = model.concretise(typeToRespect).decode(originalResult.value as never, {
        errorReportingStrategy: 'allErrors',
        fieldStrictness: 'allowAdditionalFields',
      })

      if (mappedResult.isFailure) {
        handleFailure({ onFailure, functionName: args.functionName, logger: args.logger, result: mappedResult })
        return originalResult
      }
      return mappedResult as result.Ok<never>
    },
  }
}

function handleFailure({
  onFailure,
  logger,
  result,
  functionName,
}: {
  result: result.Failure<decoding.Error[] | validation.Error[]>
  onFailure: 'log' | 'throw'
  logger: logger.MondrianLogger
  functionName: string
}): void {
  if (onFailure === 'log') {
    logger.logWarn(
      buildErrorMessage(`Invalid value returned by the function ${functionName}`, 'module/middleware/checkOutputType'),
      {
        retrieve: JSON.stringify(retrieve),
        errors: Object.fromEntries(
          result.error.map((v, i) => [i, { ...v, gotJSON: JSON.stringify(v.got), got: `${v.got}`, path: v.path }]),
        ),
      },
    )
  } else {
    throw new exception.InvalidOutputValue(functionName, result.error)
  }
}

/**
 * This middleware applies the given security policies for a retrieve operation.
 * In case the checks fails and {@link exception.UnauthorizedAccess} is thrown
 */
export function checkPolicies(
  policies: (
    args: functions.GenericFunctionArguments,
  ) => 'skip' | Promise<'skip'> | security.Policies | Promise<security.Policies>,
): functions.Middleware<
  model.Type,
  model.Type,
  functions.ErrorType,
  functions.OutputRetrieveCapabilities,
  provider.Providers,
  guard.Guards
> {
  return {
    name: 'Check policies',
    apply: async (args, next, thisFunction) => {
      const givenPolicies = await policies(args)
      if (givenPolicies === 'skip') {
        return next(args)
      }
      const policyResult = checkPolicyInternal({
        outputType: thisFunction.output,
        retrieve: args.retrieve,
        policies: givenPolicies.retrievePolicies,
        capabilities: thisFunction.retrieve,
        path: path.root,
      })
      const policyViolationErrorKey = Object.entries(thisFunction.errors ?? {}).find(
        (v) => v[1] === error.standard.UnauthorizedAccess,
      )?.[0]
      if (policyResult.isFailure) {
        if (policyViolationErrorKey !== undefined) {
          const e: model.Infer<(typeof error)['standard']['UnauthorizedAccess']> = {
            message: 'Unauthorized access.',
            details: policyResult.error,
          }
          return result.fail({ [policyViolationErrorKey]: e }) as never
        } else {
          throw new exception.UnauthorizedAccess(policyResult.error)
        }
      }
      const functionResult = await next({ ...args, retrieve: policyResult.value ?? {} })
      if (functionResult.isOk && givenPolicies.mapperPolicies.size > 0) {
        const mappedResult = applyMapPolicies({
          outputType: thisFunction.output,
          policies: givenPolicies.mapperPolicies,
          value: functionResult.value,
        })
        return result.ok(mappedResult as never)
      } else {
        return functionResult
      }
    },
  }
}
