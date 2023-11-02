import { attachRestMethods } from './methods'
import { fastifyStatic } from '@fastify/static'
import { functions, module } from '@mondrian-framework/module'
import { rest, utils } from '@mondrian-framework/rest'
import { FastifyReply, FastifyRequest } from 'fastify'
import { FastifyInstance } from 'fastify'
import fs from 'fs'
import path from 'path'
import { getAbsoluteFSPath } from 'swagger-ui-dist'

export type Context = { fastify: { request: FastifyRequest; reply: FastifyReply } }

export function start<const F extends functions.Functions, CI>({
  module,
  api,
  server,
  context,
  error,
}: {
  module: module.Module<F, CI>
  api: rest.Api<F>
  server: FastifyInstance
  context: (serverContext: Context) => Promise<CI>
  error?: rest.ErrorHandler<F, Context>
}): void {
  utils.assertApiValidity(api)
  const pathPrefix = `/${module.name.toLocaleLowerCase()}${api.options?.pathPrefix ?? '/api'}`
  if (api.options?.introspection) {
    server.register(fastifyStatic, {
      root: getAbsoluteFSPath(),
      prefix: `${pathPrefix}/doc`,
    })
    const indexContent = fs
      .readFileSync(path.join(getAbsoluteFSPath(), 'swagger-initializer.js'))
      .toString()
      .replace('https://petstore.swagger.io/v2/swagger.json', `${pathPrefix}/doc/v${api.version}/schema.json`)
    server.get(`${pathPrefix}/doc/swagger-initializer.js`, (req, res) => res.send(indexContent))
    server.get(`${pathPrefix}/doc`, (req, res) => {
      res.redirect(`${pathPrefix}/doc/index.html`)
    })
    server.get(`${pathPrefix}/doc/:v/schema.json`, (req, reply) => {
      const v = (req.params as Record<string, string>).v
      const version = Number(v.replace('v', ''))
      if (Number.isNaN(version) || !Number.isInteger(version) || version < 1 || version > api.version) {
        reply.status(404)
        return { error: 'Invalid version', minVersion: `v1`, maxVersion: `v${api.version}` }
      }
      return rest.openapi.fromModule({ module, api, version })
    })
  }
  attachRestMethods({ module, api, server, context, pathPrefix, error })
}
