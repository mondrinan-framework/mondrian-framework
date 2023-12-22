import { model, result } from '@mondrian-framework/model'
import { functions, logger, module, retrieve, utils } from '@mondrian-framework/module'
import { http, mapObject } from '@mondrian-framework/utils'

export const FailureResponse = model.object({
  success: model.literal(false),
  reason: model.string(),
  additionalInfo: model.unknown(),
})

export const SuccessResponse = (functionBody: functions.FunctionInterface) =>
  model.object({
    success: model.literal(true),
    operationId: model.string(),
    result: model.union({
      ok: model.object({
        isOk: model.literal(true),
        value: functionBody.output,
      }),
      failure: model.object({
        isOk: model.literal(false),
        errors: functionBody.errors
          ? model.object(mapObject(functionBody.errors, (_, errorType) => model.optional(errorType)))
          : model.never(),
      }),
    }),
  })

export const Response = (functionBody: functions.FunctionInterface) =>
  model.union({ success: SuccessResponse(functionBody), failire: FailureResponse })

export function fromModule<Fs extends functions.Functions, ContextInput>({
  module,
  context: contextBuilder,
}: {
  module: module.Module<Fs, ContextInput>
  context: (metadata: Record<string, string> | undefined, request: http.Request) => Promise<ContextInput>
}): http.Handler {
  if (Object.keys(module.functions).length === 0) {
    throw new Error('No function available')
  }

  const requestInputTypeMap = mapObject(module.functions, (functionName, functionBody) => {
    const retrieveType = retrieve.fromType(functionBody.output, functionBody.retrieve)
    return model.object({
      functionName: model.literal(functionName),
      ...(model.isNever(functionBody.input) ? {} : { input: functionBody.input as model.UnknownType }),
      ...(retrieveType.isOk ? { retrieve: retrieveType.value as unknown as model.UnknownType } : {}),
      metadata: model.record(model.string()).optional(),
    })
  })
  const successResponse = mapObject(module.functions, (_, functionBody) => SuccessResponse(functionBody))

  const handler: (request: http.Request) => Promise<http.Response> = async (request) => {
    const functionName =
      typeof request.body === 'object' && request.body && 'functionName' in request.body
        ? request.body.functionName
        : null

    if (typeof functionName !== 'string' || !(functionName in requestInputTypeMap)) {
      throw new Error('10')
    }

    const decodedRequest = requestInputTypeMap[functionName].decode(request.body, {
      errorReportingStrategy: 'stopAtFirstError',
      fieldStrictness: 'expectExactFields',
      typeCastingStrategy: 'expectExactTypes',
    })

    if (decodedRequest.isFailure) {
      const response = FailureResponse.encodeWithoutValidation({
        success: false,
        reason: 'Error while decoding request',
        additionalInfo: decodedRequest.error,
      })
      return { body: response, status: 200 }
    }

    const operationId = utils.randomOperationId()
    const baseLogger = logger.build({ moduleName: module.name, server: 'DIRECT' })
    const { input, metadata, retrieve: thisRetrieve } = decodedRequest.value
    const functionBody = module.functions[functionName]
    const SuccessResponse = successResponse[functionName]

    try {
      const contextInput = await contextBuilder(metadata, request)
      const context = await module.context(contextInput, {
        functionName,
        input,
        operationId,
        retrieve: thisRetrieve,
        logger: baseLogger,
      })
      const functionReturn = await functionBody.apply({
        context,
        input,
        operationId,
        retrieve: thisRetrieve,
        logger: baseLogger,
      })
      const functionResult: result.Result<unknown, unknown> = functionBody.errors
        ? functionReturn
        : result.ok(functionReturn)
      const response = SuccessResponse.encode({
        success: true,
        operationId,
        result: functionResult.isOk
          ? {
              isOk: true,
              value: functionResult.value as never,
            }
          : {
              isOk: false,
              errors: functionResult.error as never,
            },
      })
      if (response.isOk) {
        return { body: response.value, status: 200 }
      } else {
        throw response.error
      }
    } catch (error) {
      const response = FailureResponse.encodeWithoutValidation({
        success: false,
        reason: 'Function call failed',
        additionalInfo: error instanceof Error ? error.message : error,
      })
      return { body: response, status: 200 }
    }
  }
  return handler
}
