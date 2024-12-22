import { module } from '../src/impl/module'
//import { restAPI, moduleInterface } from '../src/interface'
//import { rest } from '@mondrian-framework/rest'
import { client as clientBuilder } from '@mondrian-framework/module'
import { buildSchema } from 'graphql'
import { expect, test } from 'vitest'

test('api test', async () => {
  process.env.SERVER_BASE_URL = 'http://localhost:4000'
  const client = clientBuilder.build({
    module: module,
    async context() {
      return {}
    },
  })

  const result = await client.functions.getReport({ reportId: '6e85a343-8474-4453-abe9-c13b098e1dba' })
  expect(result.isFailure && result.error).toEqual({ reportNotFound: '6e85a343-8474-4453-abe9-c13b098e1dba' })

  const reportG1 = await client.functions.buildGraphQLReport({
    previousSchema: buildSchema(`
        type Query {
            login(username: String!, password: String): String!
        }
        type Mutation {
            register: String
         }
    `),
    currentSchema: buildSchema(`
        type Query {
            login(username: String!, password: String!): String!
        }
        type Mutation { 
            register: String
        }
    `),
    password: '1234',
  })
  expect(reportG1.isOk && reportG1.value.breakingChanges).toBe(1)

  if (reportG1.isOk) {
    const report1 = await client.functions.getReport({ reportId: reportG1.value.reportId })
    expect(report1.isFailure && report1.error).toEqual({ reportNotFound: reportG1.value.reportId })
    const report2 = await client.functions.getReport({ reportId: reportG1.value.reportId, password: '1234' })
    expect(report2.isOk).toBe(true)
  }

  //TODO: executable throw error
  /*
  const specs1 = rest.openapi.fromModule({ module: moduleInterface, api: restAPI, version: 1 })
  const reportO1 = await client.functions.buildOASReport({
    currentSchema: specs1,
    previousSchema: specs1,
    password: '1234',
  })
  expect(reportO1.isOk && reportO1.value.breakingChanges).toBe(0)
  */
})
