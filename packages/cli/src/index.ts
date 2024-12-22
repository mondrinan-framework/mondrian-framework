#!/usr/bin/env node
import { module as ciToolsModule, GraphQLSchemaType, OASSchema } from '@mondrian-framework/ci-tools'
import { cli } from '@mondrian-framework/cli-commander'
import { model, result } from '@mondrian-framework/model'
import { functions, module, client as clientBuilder } from '@mondrian-framework/module'
import fs from 'fs'

/**
 * This is the client that will be used to call the utilities in ci-tools
 */
const client = clientBuilder.build({
  module: ciToolsModule,
  context: async () => ({}),
})

/**
 * Decodes the string either as url, a schema or a schema from a file
 */
function decode<T extends model.Type>(
  value: string,
  headers: Record<string, string> | undefined,
  schemaType: model.Type,
): result.Result<{ url: string; headers: Record<string, string> | undefined } | model.Infer<T>, unknown> {
  const asUrl = model.url().decode(value)
  if (asUrl.isOk) {
    return result.ok({ url: asUrl.value, headers })
  }
  schemaType = model.concretise(schemaType)
  const asSchema = schemaType.decode(value)
  if (asSchema.isOk) {
    return asSchema
  }
  if (!fs.existsSync(value)) {
    return asSchema
  }
  try {
    const content = fs.readFileSync(value).toString()
    return schemaType.decode(content)
  } catch (error) {
    return result.fail(error)
  }
}

/**
 * This function compares two GraphQL schemas and returns a report of the differences
 */
const graphqlDiff = functions
  .define({
    input: model.object({
      'previous-schema': model.string({ description: 'previous GraphQL schema (endpoint, filename or schema)' }),
      'current-schema': model.string({ description: 'current GraphQL schema (endpoint, filename or schema)' }),
      'previous-schema-headers': model
        .record(model.string())
        .optional({ description: `headers to use on previous schema download. Example: '{ "auth": "Bearer ..." }'` }),
      'current-schema-headers': model
        .record(model.string())
        .optional({ description: `headers to use on current schema download. Example: '{ "auth": "Bearer ..." }'` }),
      'fail-on-breaking-changes': model.boolean().optional({
        description: `'true' or 'false'. if 'true' breaking changes will return 1 as exit code. default is 'true'`,
      }),
    }),
    output: model.unknown(),
    errors: {
      error: model.unknown(),
    },
    options: {
      description: 'Detect any breaking changes between two GraphQL schemas',
    },
  })
  .implement({
    async body({ input }) {
      const previousSchema = decode(input['previous-schema'], input['previous-schema-headers'], GraphQLSchemaType)
      if (previousSchema.isFailure) {
        return previousSchema.mapError((error) => ({ error }))
      }
      const currentSchema = decode(input['current-schema'], input['current-schema-headers'], GraphQLSchemaType)
      if (currentSchema.isFailure) {
        return currentSchema.mapError((error) => ({ error }))
      }
      const graphqlReport = (
        await client.functions.buildGraphQLReport({
          previousSchema: previousSchema.value,
          currentSchema: currentSchema.value,
        })
      ).mapError((e) => ({ badParameters: e.badRequest }))
      if (graphqlReport.isFailure) {
        return graphqlReport.mapError((e) => ({ error: e.badParameters }))
      }
      delete (graphqlReport.value as any).reportId
      if (graphqlReport.value.breakingChanges >= 1 && input['fail-on-breaking-changes'] !== false) {
        return result.fail({ error: graphqlReport.value })
      }
      return graphqlReport
    },
  })

/**
 * This function compares two OpenAPI specifications and returns a report of the differences
 */
const openapiDiff = functions
  .define({
    input: model.object({
      'previous-schema': model.string({ description: 'previous OpenAPI schema (endpoint, filename or schema)' }),
      'current-schema': model.string({ description: 'current OpenAPI schema (endpoint, filename or schema)' }),
      'previous-schema-headers': model
        .record(model.string())
        .optional({ description: `headers to use on previous schema download. Example: '{ "auth": "Bearer ..." }'` }),
      'current-schema-headers': model
        .record(model.string())
        .optional({ description: `headers to use on current schema download. Example: '{ "auth": "Bearer ..." }'` }),
      'fail-on-breaking-changes': model.boolean().optional({
        description: `'true' or 'false'. if 'true' breaking changes will return 1 as exit code. default is 'true'`,
      }),
    }),
    output: model.unknown(),
    errors: {
      error: model.unknown(),
    },
    options: {
      description: 'Detect any breaking changes between two OpenApi specifications',
    },
  })
  .implement({
    async body({ input }) {
      const previousSchema = decode(input['previous-schema'], input['previous-schema-headers'], OASSchema)
      if (previousSchema.isFailure) {
        return previousSchema.mapError((error) => ({ error }))
      }
      const currentSchema = decode(input['current-schema'], input['current-schema-headers'], OASSchema)
      if (currentSchema.isFailure) {
        return currentSchema.mapError((error) => ({ error }))
      }
      const oasReport = (
        await client.functions.buildOASReport({
          previousSchema: previousSchema.value,
          currentSchema: currentSchema.value,
        })
      ).mapError((e) => ({ badParameters: e.badRequest }))
      if (oasReport.isFailure) {
        return oasReport.mapError((e) => ({ error: e.badParameters }))
      }
      delete (oasReport.value as any).reportId
      if (oasReport.value.breakingChanges >= 1 && input['fail-on-breaking-changes'] !== false) {
        return result.fail({ error: oasReport.value })
      }
      return oasReport
    },
  })

const m = module.build({
  name: 'mondrian',
  description: 'Mondrian CLI',
  functions: { graphqlDiff, openapiDiff },
})

/**
 * This is the main program builded with the cli-commander runtime
 */
const program = cli.fromModule({
  module: m,
  async context() {
    return {}
  },
  functions: {
    graphqlDiff: { commandName: 'gql-diff' },
    openapiDiff: { commandName: 'oas-diff' },
  },
  inputBindingStyle: 'argument-spreaded',
  programVersion: '1.0.0',
  async output(result) {
    if (result.isFailure && typeof result.error === 'object' && result.error) {
      print(Object.values(result.error)[0], 'error')
      process.exit(1)
    } else if (result.isFailure && result.error instanceof Error) {
      print(result.error.message, 'error')
      process.exit(2)
    } else if (result.isFailure) {
      print(result.error, 'error')
      process.exit(2)
    } else {
      print(result.value, 'log')
    }
  },
})

function print(value: unknown, t: 'log' | 'error') {
  if (typeof value === 'string') {
    console[t](value)
  } else {
    console[t](JSON.stringify(value, null, 2))
  }
}
program.parseAsync().then(() => {})
