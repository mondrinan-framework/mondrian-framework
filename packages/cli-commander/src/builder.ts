import { decoding, model, result } from '@mondrian-framework/model'
import { functions, logger, module } from '@mondrian-framework/module'
import { isArray } from '@mondrian-framework/utils'
import { program as p, Command } from 'commander'

type InputBindingStyle = 'single-json' | 'argument-spreaded'

type CommandSpecification = { commandName?: string; inputBindingStyle?: InputBindingStyle }

const decodingOptions: decoding.Options = {
  errorReportingStrategy: 'stopAtFirstError',
  fieldStrictness: 'allowAdditionalFields',
  typeCastingStrategy: 'tryCasting',
}

const defaultOutputHandler = async (result: result.Result<unknown, unknown>) => {
  if (result.isOk) {
    console.log(JSON.stringify(result.value, null, 2))
  } else {
    process.exitCode = 1
    console.error(JSON.stringify(result.error, null, 2))
  }
}

type Api<Fs extends functions.Functions, E extends functions.ErrorType, CI> = {
  programVersion?: string
  inputBindingStyle?: 'single-json' | 'argument-spreaded'
  functions: {
    [K in keyof Fs]?: CommandSpecification | CommandSpecification[]
  }
  module: module.Module<Fs, E, CI>
  output?: (result: result.Result<unknown, unknown>, args: { functionName: string }) => Promise<void>
}

/**
 * Creates a new cli program with commander from a cli api specification.
 */
export function fromModule<Fs extends functions.Functions, E extends functions.ErrorType, CI>({
  context,
  ...api
}: {
  context: () => Promise<CI>
} & Api<Fs, E, CI>): Command {
  const program = p.name(api.module.name)
  if (api.programVersion) {
    program.version(api.programVersion)
  }
  if (api.module.description) {
    program.description(api.module.description)
  }
  program.name(api.module.name)
  const outputHandler = api.output ?? defaultOutputHandler
  const baseLogger = logger.build({ moduleName: api.module.name, server: 'CLI' })
  for (const [functionName, cmdSpecs] of Object.entries(api.functions)) {
    if (!cmdSpecs) {
      continue
    }
    for (const cmdSpec of isArray(cmdSpecs) ? cmdSpecs : [cmdSpecs]) {
      const functionBody = api.module.functions[functionName]
      const inputBindingStyle =
        (typeof cmdSpec === 'object' ? cmdSpec.inputBindingStyle : null) ?? api.inputBindingStyle ?? 'single-json'
      const cmdName = cmdSpec.commandName ?? functionName
      const command = program.command(cmdName)
      const decoder = (inputBindingStyle === 'argument-spreaded' ? argumentSpreadedBinding : singleJsonBinding)({
        command,
        input: functionBody.input,
        functionName,
      })

      command.action(async (cmdInput) => {
        const inputResult = decoder(cmdInput)
        if (inputResult.isFailure) {
          await outputHandler(inputResult, { functionName })
          return
        }
        try {
          const contextInput = await context()
          const ctxResult = await api.module.context(contextInput, {
            functionName,
            input: inputResult.value as any,
            retrieve: undefined as any,
            logger: baseLogger,
            tracer: functionBody.tracer,
          })
          if (ctxResult.isFailure) {
            await outputHandler(ctxResult, { functionName })
            return
          }
          const applyResult = await functionBody.apply({
            context: ctxResult.value,
            input: inputResult.value as any,
            retrieve: undefined as any,
            logger: baseLogger,
            tracer: functionBody.tracer,
          })
          await outputHandler(applyResult, { functionName })
        } catch (error) {
          await outputHandler(result.fail(error), { functionName })
        }
      })
    }
  }

  return program
}

const argumentSpreadedBinding: (args: {
  command: Command
  input: model.Type
  functionName: string
}) => (cmdInput: any) => result.Result<unknown, unknown> = ({ command, input, functionName }) => {
  return model.match(input, {
    scalar: (scalar) => {
      command.argument(`<${scalar.options?.name ?? 'input'}>`, scalar.options?.description)
      return (str: string) => scalar.decode(str, decodingOptions)
    },
    record: (obj) => {
      for (const [fieldName, fieldType] of Object.entries(obj.fields)) {
        const concreteFieldType = model.concretise(fieldType)
        if (model.isOptional(fieldType) || model.isLiteral(fieldType, undefined)) {
          command.option(`--${fieldName} <value>`, `*optional* ${concreteFieldType.options?.description ?? ''}`)
        } else {
          command.requiredOption(`--${fieldName} <value>`, concreteFieldType.options?.description)
        }
      }
      return (args: Record<string, unknown>) => {
        return obj.decode(args, decodingOptions)
      }
    },
    otherwise: () => {
      throw new Error(
        `Impposible input binding 'argument-spreaded' on function ${functionName}.\nOnly object, entity or scalar are supported as input type.\nYou can use 'single-json' input binding in CLI API settings`,
      )
    },
  })
}

const singleJsonBinding: (args: {
  command: Command
  input: model.Type
}) => (jsonStr: string | undefined) => result.Result<unknown, unknown> = ({ command, input }) => {
  const concreteInput = model.concretise(input)
  const example = concreteInput.example()
  const exampleStr = JSON.stringify(example === undefined ? null : example)
  const name = concreteInput.options?.name ?? 'input'
  const description = `${concreteInput.options?.description ?? ''} Example: '${exampleStr}'`
  if (model.isOptional(concreteInput) || model.isLiteral(concreteInput, undefined)) {
    command.argument(`[${name}]`, description)
  } else {
    command.argument(`<${name}>`, description)
  }
  return (jsonStr: string | undefined) => {
    if (jsonStr === undefined) {
      jsonStr = 'null'
    }
    try {
      return concreteInput.decode(JSON.parse(jsonStr), decodingOptions)
    } catch (error) {
      try {
        return concreteInput.decode(JSON.parse(`"${jsonStr}"`), decodingOptions)
      } catch {}
      return result.fail(error instanceof Error ? error.message : error)
    }
  }
}
