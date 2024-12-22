import { functions, module, client as clientBuilder } from '../src'
import { result, model } from '@mondrian-framework/model'
import logsAPI from '@opentelemetry/api-logs'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import { LoggerProvider, SimpleLogRecordProcessor, ConsoleLogRecordExporter } from '@opentelemetry/sdk-logs'
import { SimpleSpanProcessor, ConsoleSpanExporter, InMemorySpanExporter } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { describe, expect, test } from 'vitest'

describe('Opentelemetry', () => {
  test('should produce spans', async () => {
    const loggerProvider = new LoggerProvider()
    //loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()))
    logsAPI.logs.setGlobalLoggerProvider(loggerProvider)
    const provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'test',
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
      }),
    })
    //provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()))
    const spanExporter = new InMemorySpanExporter()
    provider.addSpanProcessor(new SimpleSpanProcessor(spanExporter))
    const exporter = new OTLPTraceExporter({
      url: 'http://localhost:4318/v1/traces',
    })
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter))
    provider.register()

    const type = () => model.object({ type, value: model.string() }).optional()
    const dummy = functions
      .define({
        input: model.string(),
        output: model.string(),
        errors: { unknownInput: model.string() },
        retrieve: undefined,
      })
      .implement({
        body: async ({ input, logger }) => {
          if (input === '') {
            throw new Error('Invalid string')
          }
          if (input !== 'ping') {
            logger.logError('Only "ping" is accepted', { received: input })
            return result.fail({ unknownInput: 'Only "ping" is accepted' })
          }
          return result.ok('pong')
        },
      })
    const m = module.build({
      name: 'test',
      functions: { dummy },
      options: {
        maxSelectionDepth: 2,
        checkOutputType: 'throw',
        opentelemetry: true,
      },
    })

    const client = clientBuilder.build({
      module: m,
      async context() {
        return {}
      },
    })

    const result1 = await client.functions.dummy('ping')
    expect(result1.isOk && result1.value).toBe('pong')
    expect((await client.functions.dummy('pong')).isOk).toBe(false)
    await expect(client.functions.dummy('')).rejects.toThrow('Invalid string')

    const spans = spanExporter.getFinishedSpans()
    expect(spans.length).toBe(12)

    //await exporter.shutdown()

    await provider.shutdown()
  })
})
