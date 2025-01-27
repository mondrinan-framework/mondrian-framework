import { ApiSpecification, FunctionSpecifications } from './api'
import { decodeQueryObject, encodeQueryObject, methodFromOptions } from './utils'
import { model } from '@mondrian-framework/model'
import { functions, retrieve } from '@mondrian-framework/module'
import { isArray, http, JSONType } from '@mondrian-framework/utils'
import type { OpenAPIV3_1 } from 'openapi-types'

export type CustomTypeSpecifications = Record<
  string,
  ((type: model.CustomType) => OpenAPIV3_1.NonArraySchemaObject) | OpenAPIV3_1.NonArraySchemaObject
>

export function fromModule<Fs extends functions.FunctionInterfaces>({
  api,
  version,
}: {
  api: ApiSpecification<Fs>
  version: number
}): OpenAPIV3_1.Document {
  const paths: OpenAPIV3_1.PathsObject = {}
  const { components, internalData } = openapiComponents({ version, api })
  for (const [functionName, functionBody] of Object.entries(api.module.functions)) {
    const specifications = api.functions[functionName]
    if (!specifications) {
      continue
    }
    for (const specification of isArray(specifications) ? specifications : [specifications]) {
      if (specification.version?.min != null && version < specification.version.min) {
        continue
      }
      if (specification.version?.max != null && version > specification.version.max) {
        continue
      }
      const path = `${specification.path ?? `/${functionName}`}`

      const { parameters, requestBody } = generateOpenapiInput({
        specification,
        functionBody,
        functionName,
        internalData,
      })
      const schema = modelToSchema(functionBody.output, internalData)
      const errorMap: Record<string, (OpenAPIV3_1.ReferenceObject | OpenAPIV3_1.SchemaObject)[]> = {}
      if (functionBody.errors) {
        const errorCodes = { ...api.errorCodes, ...specification.errorCodes } as Record<string, number>
        for (const [errorName, errorType] of Object.entries(functionBody.errors)) {
          const code = (errorCodes[errorName] ?? 400).toString()
          const ts = errorMap[code] ?? []
          const schema = modelToSchema(model.object({ [errorName]: errorType as model.Type }), internalData)
          ts.push(schema)
          errorMap[code] = ts
        }
      }
      const errorSchemas = Object.fromEntries(
        Object.entries(errorMap).map(([key, schemas]) => {
          if (schemas.length === 1) {
            return [
              key,
              {
                description: 'Error',
                content: { 'application/json': { schema: schemas[0] } },
              },
            ] as const
          }
          return [
            key,
            {
              description: 'Error',
              content: { 'application/json': { schema: { anyOf: schemas } } },
            },
          ] as const
        }),
      )
      const retrieveType = retrieve.fromType(functionBody.output, functionBody.retrieve)
      const retrieveParameters: OpenAPIV3_1.ParameterObject[] = []
      if (retrieveType.isOk) {
        for (const [key, value] of Object.entries(retrieveType.value.fields)) {
          const type = model.unwrapAndConcretize(value)
          const schema = modelToSchema(type, internalData)
          retrieveParameters.push({
            name: key,
            in: 'query',
            required: false,
            schema: schema as any,
            style: model.isScalar(value) ? undefined : 'deepObject',
            example: model.isScalar(value) ? undefined : null,
          })
        }
      }
      const isTotalCountArray = model.isTotalCountArray(functionBody.output)
      const operationObj: OpenAPIV3_1.OperationObject = {
        parameters: parameters ? [...parameters, ...retrieveParameters] : retrieveParameters,
        requestBody,
        responses: {
          '200': {
            description: 'Success',
            content: { [specification.contentType ?? 'application/json']: { schema } },
            headers:
              specification.responseHeaders || isTotalCountArray
                ? {
                    ...(isTotalCountArray ? { 'x-total-count': { schema: { type: 'integer', minimum: 0 } } } : {}),
                    ...specification.responseHeaders,
                  }
                : undefined,
          },
          ...errorSchemas,
        },
        description: functionBody.options?.description?.replaceAll('\n', '</br>'),
        tags:
          specification.namespace === null
            ? []
            : (functionBody.options?.namespace ?? specification.namespace)
              ? [functionBody.options?.namespace ?? specification.namespace ?? '']
              : [],
        security: specification.security,
      }
      const method = specification.method?.toLocaleLowerCase() ?? methodFromOptions(functionBody.options)
      if (paths[path]) {
        ;(paths[path] as Record<string, unknown>)[method] = operationObj
      } else {
        paths[path] = { [method]: operationObj }
      }
    }
  }
  clearInternalData(internalData)

  //servers
  const servers = api.options?.endpoints
    ? api.options.endpoints.map((e) => ({ url: `${e}${api.options?.pathPrefix ?? '/api'}/v${version}` }))
    : [{ url: `${api.options?.pathPrefix ?? '/api'}/v${version}` }]

  return {
    openapi: '3.1.0',
    info: {
      version: `v${api.version}`,
      title: api.module.name,
      description: api.module.description?.replaceAll('\n', '</br>'),
    },
    servers,
    paths,
    components: {
      ...components,
      securitySchemes: api.securities,
    },
  }
}

export function generateOpenapiInput({
  specification,
  functionBody,
  functionName,
  internalData,
}: {
  specification: FunctionSpecifications
  functionName: string
  functionBody: functions.FunctionInterface<model.Type, model.Type, functions.ErrorType>
  internalData: InternalData
}): {
  parameters?: (OpenAPIV3_1.ReferenceObject | OpenAPIV3_1.ParameterObject)[]
  requestBody?: OpenAPIV3_1.ReferenceObject | OpenAPIV3_1.RequestBodyObject
  input: (request: http.Request) => unknown
  output: (value: JSONType) => { path: string; body: unknown; params: string | undefined }
} {
  const parametersInPath = specification.path
    ? [...(specification.path.match(/{(.*?)}/g) ?? [])].map((v) => v.replace('{', '').replace('}', '')).filter((v) => v)
    : []
  const inputType = functionBody.input
  if (model.isLiteral(inputType, undefined)) {
    return {
      parameters: [],
      input: () => null,
      output: () => ({ path: specification.path ?? `/${functionName}`, body: undefined, params: undefined }),
    }
  }
  const concreteInputType = model.concretise(inputType)
  const isScalar = model.isScalar(concreteInputType)
  const isArray = model.isArray(concreteInputType)
  const isRequired = isInputRequired(concreteInputType)
  if (concreteInputType.kind === model.Kind.Object || concreteInputType.kind === model.Kind.Entity) {
    for (const p of parametersInPath) {
      if (!concreteInputType.fields[p] || !model.isScalar(concreteInputType.fields[p])) {
        throw new Error(
          `Error while generating openapi input type. Path parameter ${p} can only be a scalar type. Path ${specification.path}`,
        )
      }
    }
  }
  if (isArray && parametersInPath.length > 0) {
    throw new Error(
      `Error while generating openapi input type. Path parameter with array are not supported. Path ${specification.path}`,
    )
  }
  if (isScalar && parametersInPath.length > 1) {
    throw new Error(
      `Error while generating openapi input type. Only one parameter is needed. Path ${specification.path}`,
    )
  }
  if (isScalar && parametersInPath.length === 1) {
    const schema = modelToSchema(concreteInputType, { ...internalData, ignoreFirstLevelOptionality: true })
    return {
      parameters: [{ in: 'path', name: parametersInPath[0], schema: schema as any, required: true }],
      input: (request) => {
        return request.params[parametersInPath[0]]
      },
      output: (value) => {
        return {
          path: specification.path?.replace(`{${parametersInPath[0]}}`, String(value)) ?? ``,
          body: undefined,
          params: undefined,
        }
      },
    }
  }
  if (specification.method === 'get' || specification.method === 'delete') {
    if (concreteInputType.kind === model.Kind.Object || concreteInputType.kind === model.Kind.Entity) {
      const parameters = generatePathParameters({ parameters: parametersInPath, type: concreteInputType, internalData })
      for (const [key, subtype] of Object.entries(concreteInputType.fields as model.Types)
        .map(([k, v]) => [k, v] as const)
        .filter(([k, _]) => !parametersInPath.includes(k))) {
        const schema = modelToSchema(subtype, { ...internalData, ignoreFirstLevelOptionality: true })
        parameters.push({
          name: key,
          in: 'query',
          required: isInputRequired(subtype),
          style: model.isScalar(subtype) ? undefined : 'deepObject',
          explode: true,
          schema: schema as any,
        })
      }
      return {
        parameters,
        input: (request) => {
          const object: Record<string, unknown> = Object.fromEntries(
            parametersInPath.map((p) => [p, request.params[p]]),
          )
          for (const [key, subtype] of Object.entries(concreteInputType.fields as model.Types).filter(
            ([fieldName]) => !parametersInPath.includes(fieldName),
          )) {
            if (model.isScalar(subtype)) {
              object[key] = request.query[key]
            } else {
              const v = decodeQueryObject(request.query, key)
              //this is in the case that the query are of kind `?key=value` and the value is an array
              //the correct way should be ?key[0]=value but the swagger next does not suggest that way
              if (
                v !== undefined &&
                !Array.isArray(v) &&
                model.isArray(subtype) &&
                (typeof v !== 'object' || v === null || !Object.keys(v).includes('0'))
              ) {
                object[key] = [v]
              } else {
                object[key] = v
              }
            }
          }
          return object
        },
        output(value) {
          const object = value as Record<string, JSONType>
          const path = parametersInPath.reduce(
            (path, parameter) => {
              return path.replace(`{${parameter}}`, String(object[parameter]))
            },
            specification.path ?? `/${functionName}`,
          )
          let params: string | undefined = undefined
          for (const [key, subtype] of Object.entries(concreteInputType.fields as model.Types).filter(
            ([fieldName]) => !parametersInPath.includes(fieldName),
          )) {
            if (object[key] === undefined) {
              continue
            }
            if (model.isScalar(subtype)) {
              params = (params ?? '') + `${key}=${String(object[key])}&`
            } else {
              const v = encodeQueryObject(object[key], key)
              params = (params ?? '') + v + '&'
            }
          }
          params = params && params.endsWith('&') ? params.slice(0, -1) : params
          return { path, body: undefined, params }
        },
      }
    }
    if (parametersInPath.length === 0) {
      const schema = modelToSchema(concreteInputType, { ...internalData, ignoreFirstLevelOptionality: true })
      return {
        parameters: [
          {
            name: specification.inputName ?? 'input',
            in: 'query',
            required: isScalar ? isRequired : true,
            style: isScalar ? undefined : 'deepObject',
            explode: true,
            schema: schema as any,
          },
        ],
        input(request: http.Request) {
          return decodeQueryObject(request.query, specification.inputName ?? 'input')
        },
        output(value) {
          const path = specification.path ?? `/${functionName}`
          const params = encodeQueryObject(value, specification.inputName ?? 'input')
          return { path, body: undefined, params }
        },
      }
    }
  } else {
    //BODY CAN EXIST
    const schema = modelToSchema(concreteInputType, internalData)
    if (parametersInPath.length === 0) {
      return {
        requestBody: {
          content: {
            'application/json': {
              schema: schema as any,
            },
          },
        },
        input: (request) => request.body,
        output: (value) => {
          return { path: specification.path ?? `/${functionName}`, body: value, params: undefined }
        },
      }
    }
    if (concreteInputType.kind === model.Kind.Object || concreteInputType.kind === model.Kind.Entity) {
      const parameters = generatePathParameters({ parameters: parametersInPath, type: concreteInputType, internalData })
      const remainingFields = Object.entries(concreteInputType.fields as model.Types).filter(
        (v) => !parametersInPath.includes(v[0]),
      )
      const remainingObject = model.object(Object.fromEntries(remainingFields))
      const schema = modelToSchema(remainingObject, internalData)
      return {
        parameters,
        requestBody: remainingFields.length > 0 ? { content: { 'application/json': { schema } } } : undefined,
        input: (request) => {
          const result = Object.fromEntries(parametersInPath.map((p) => [p, request.params[p]]))
          if (remainingFields.length > 0 && typeof request.body === 'object') {
            return { ...result, ...request.body }
          }
          return result
        },
        output(value) {
          const object = value as Record<string, JSONType>
          const objectWithoutPath = { ...object }
          const path = parametersInPath.reduce(
            (path, parameter) => {
              delete objectWithoutPath[parameter]
              return path.replace(`{${parameter}}`, String(object[parameter]))
            },
            specification.path ?? `/${functionName}`,
          )
          return { path, body: objectWithoutPath, params: undefined }
        },
      }
    }
  }
  throw new Error(`Error while generating openapi input type. Not supported. Path ${specification.path}`)
}

function isInputRequired(type: model.Type): boolean {
  return !model.isNullable(type) && !model.isOptional(type)
}
function generatePathParameters({
  parameters,
  type,
  internalData,
}: {
  parameters: string[]
  type: model.ObjectType<any, any> | model.EntityType<any, any>
  internalData: InternalData
}): OpenAPIV3_1.ParameterObject[] {
  const result: OpenAPIV3_1.ParameterObject[] = []
  for (const parameter of parameters) {
    const subtype = type.fields[parameter]
    const schema = modelToSchema(subtype, { ...internalData, ignoreFirstLevelOptionality: true })
    result.push({ in: 'path', name: parameter, required: true, schema: schema as any })
  }
  return result
}

function openapiComponents<Fs extends functions.FunctionInterfaces>({
  version,
  api,
}: {
  version: number
  api: ApiSpecification<Fs>
}): {
  components: OpenAPIV3_1.ComponentsObject
  internalData: InternalData
} {
  const usedTypes: model.Type[] = []
  for (const [functionName, functionBody] of Object.entries(api.module.functions)) {
    const specifications = api.functions[functionName]
    if (!specifications) {
      continue
    }
    for (const specification of isArray(specifications) ? specifications : [specifications]) {
      if (specification.version?.min != null && version < specification.version.min) {
        continue
      }
      if (specification.version?.max != null && version > specification.version.max) {
        continue
      }
      const retrieveType = retrieve.fromType(functionBody.output, functionBody.retrieve)
      if (retrieveType.isOk) {
        usedTypes.push(retrieveType.value)
      }
      usedTypes.push(functionBody.input)
      usedTypes.push(functionBody.output)
      if (functionBody.errors) {
        usedTypes.push(...Object.values(functionBody.errors))
      }
    }
  }
  const internalData = emptyInternalData(api.customTypeSchemas)
  for (const type of usedTypes) {
    modelToSchema(type, internalData)
  }
  const schemas: Record<string, OpenAPIV3_1.ReferenceObject | OpenAPIV3_1.SchemaObject> = {}
  for (const [name, type] of internalData.typeMap.entries()) {
    schemas[name] = type
  }
  const sortedSchemas = Object.fromEntries(Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b)))
  return { components: { schemas: sortedSchemas }, internalData }
}

export function emptyInternalData(customTypeSchemas: CustomTypeSpecifications | undefined): InternalData {
  return { typeMap: new Map(), typeRef: new Map(), customTypeSchemas }
}

export function clearInternalData(internalData: InternalData) {
  internalData.typeMap.clear()
  internalData.typeRef.clear()
}

type InternalData = {
  typeMap: Map<string, OpenAPIV3_1.SchemaObject> //type name -> SchemaObject
  typeRef: Map<model.Type, string> // type -> type name
  ignoreFirstLevelOptionality?: boolean
  customTypeSchemas: CustomTypeSpecifications | undefined
}

function modelToSchema(
  type: model.Type,
  internalData: InternalData,
): OpenAPIV3_1.ReferenceObject | OpenAPIV3_1.SchemaObject {
  //if alredy processed (or just processing) return the reference
  if (typeof type === 'function') {
    const typeName = internalData.typeRef.get(type)
    if (typeName !== undefined) {
      return { $ref: `#/components/schemas/${typeName}` }
    }
  }
  const concreteType = model.concretise(type)
  const typeName = concreteType.options?.name
  //if it has a name set that as already processed so the next iteration we ealry return the reference
  if (typeName !== undefined) {
    internalData.typeRef.set(type, typeName)
  }
  const schema = model.match(type, {
    string: (type) => stringToOpenAPIComponent(type),
    number: (type) => numberToOpenAPIComponent(type),
    boolean: (type) => booleanToOpenAPIComponent(type),
    enum: (type) => enumToOpenAPIComponent(type),
    literal: (type) => literalToOpenAPIComponent(type),
    custom: (type) => customToOpenAPIComponent(type, internalData),
    array: (type) => arrayToOpenAPIComponent(type, internalData),
    nullable: (type) => nullableToOpenAPIComponent(type, internalData),
    optional: (type) => optionalToOpenAPIComponent(type, internalData),
    record: (type) => recordToOpenAPIComponent(type, internalData),
    union: (type) => unionToOpenAPIComponent(type, internalData),
  })
  //if the schema is a SchemaObject and has a name, set it to the type map and return the reference
  if (!('$ref' in schema) && typeName !== undefined) {
    internalData.typeMap.set(typeName, schema)
    return { $ref: `#/components/schemas/${typeName}` }
  }
  return schema
}

function stringToOpenAPIComponent(type: model.StringType): OpenAPIV3_1.NonArraySchemaObject {
  return {
    type: 'string',
    pattern: type.options?.regex?.source,
    minLength: type.options?.minLength,
    maxLength: type.options?.maxLength,
    description: type.options?.description,
  }
}

function numberToOpenAPIComponent(type: model.NumberType): OpenAPIV3_1.NonArraySchemaObject {
  return {
    type: type.options?.isInteger ? 'integer' : 'number',
    maximum: type.options?.maximum,
    minimum: type.options?.minimum,
    exclusiveMaximum: type.options?.exclusiveMaximum,
    exclusiveMinimum: type.options?.exclusiveMinimum,
    description: type.options?.description,
  }
}

function booleanToOpenAPIComponent(type: model.BooleanType): OpenAPIV3_1.NonArraySchemaObject {
  return {
    type: 'boolean',
    description: type.options?.description,
  }
}

function enumToOpenAPIComponent(type: model.EnumType): OpenAPIV3_1.NonArraySchemaObject {
  return {
    type: 'string',
    enum: type.variants as unknown as string[],
    description: type.options?.description,
  }
}

function literalToOpenAPIComponent(type: model.LiteralType): OpenAPIV3_1.NonArraySchemaObject {
  const literalType = typeof type.literalValue
  const literalSupportedType =
    literalType === 'boolean'
      ? literalType
      : literalType === 'number'
        ? literalType
        : literalType === 'string'
          ? literalType
          : 'unknown'
  if (type.literalValue === null || type.literalValue === undefined) {
    return {
      type: 'null',
      const: null,
      description: type.options?.description,
    }
  }
  if (literalSupportedType === 'unknown') {
    throw new Error(`[OpenAPI generation] Unknown literal type: ${literalSupportedType}`)
  }
  return {
    type: literalSupportedType,
    const: type.literalValue,
    example: type.literalValue,
    description: type.options?.description,
  }
}

function customToOpenAPIComponent(
  type: model.CustomType,
  internalData: InternalData,
): OpenAPIV3_1.NonArraySchemaObject | OpenAPIV3_1.SchemaObject {
  const anyValue = { description: type.options?.description }
  //convert known types based on name
  if (type.typeName === model.record(model.unknown()).typeName) {
    const fieldSchema = modelToSchema((type.options as model.RecordOptions).fieldsType, internalData)
    return { type: 'object', additionalProperties: fieldSchema, description: type.options?.description }
  } else if (type.typeName === model.datetime().typeName) {
    return { type: 'string', format: 'date-time', description: type.options?.description }
  } else if (type.typeName === model.timestamp().typeName) {
    return { type: 'integer', description: type.options?.description ?? 'unix timestamp' }
  } else if (type.typeName === model.email().typeName) {
    return { type: 'string', format: 'email', description: type.options?.description }
  } else if (type.typeName === model.never().typeName) {
    return anyValue
  } else if (type.typeName === model.unknown().typeName) {
    return anyValue
  } else if (type.typeName === model.json().typeName) {
    return anyValue
  } else if (type.typeName === model.uuid().typeName) {
    return { type: 'string', format: 'uuid', description: type.options?.description }
  } else if (type.typeName === model.url().typeName) {
    return { type: 'string', format: 'url', description: type.options?.description }
  } else if (type.typeName === model.jwt({}, 'ES256').typeName) {
    const options = type.options as model.JwtOptions
    const payloadSchema = modelToSchema((type.options as model.JwtOptions).payloadType, internalData)
    return {
      type: 'string',
      example:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      contentMediaType: 'application/jwt',
      contentSchema: {
        type: 'array',
        minItems: 2,
        prefixItems: [{ const: { typ: 'JWT', alg: options.algorithm } }, payloadSchema],
      },
      description: type.options?.description,
    } as OpenAPIV3_1.NonArraySchemaObject
  }

  //TODO [Good first issue]: complete with other known custom type
  //...

  //user specific custom types
  if (internalData.customTypeSchemas && internalData.customTypeSchemas[type.typeName]) {
    const schema = internalData.customTypeSchemas[type.typeName]
    const concreteSchema = typeof schema === 'function' ? schema(type) : schema
    return {
      example: type.encodeWithoutValidation(type.example({ seed: 0 })),
      ...concreteSchema,
    }
  }

  if (type.options?.apiType) {
    const schema = modelToSchema(type.options.apiType, internalData)
    if ('$ref' in schema) {
      return schema
    } else {
      return {
        ...schema,
        description: type.options?.description,
        example: type.encodeWithoutValidation(type.example({ seed: 0 })),
      }
    }
  }

  //otherwise don't known how to convert this type to openapi
  console.warn(`[OpenAPI generation] don't known how to properly map custom type "${type.typeName}"`)
  return {
    description: type.options?.description ?? type.typeName,
    example: type.encodeWithoutValidation(type.example({ seed: 0 })),
  }
}

function arrayToOpenAPIComponent(
  type: model.ArrayType<model.Mutability, model.Type>,
  internalData: InternalData,
): OpenAPIV3_1.ArraySchemaObject {
  const schema = modelToSchema(type.wrappedType, { ...internalData, ignoreFirstLevelOptionality: undefined })
  return {
    type: 'array',
    items: schema,
    minItems: type.options?.minItems,
    maxItems: type.options?.maxItems,
    description: type.options?.description,
  }
}

function optionalToOpenAPIComponent(
  type: model.OptionalType<model.Type>,
  internalData: InternalData,
): OpenAPIV3_1.ReferenceObject | OpenAPIV3_1.SchemaObject {
  const schema = modelToSchema(type.wrappedType, {
    ...internalData,
    ignoreFirstLevelOptionality: undefined,
  })
  if (internalData.ignoreFirstLevelOptionality) {
    return schema
  }
  const optionalSchema: OpenAPIV3_1.NonArraySchemaObject = { type: 'null' }
  if ('anyOf' in schema && schema.anyOf && (!schema.description || !type.options?.description)) {
    return { anyOf: [...schema.anyOf, optionalSchema], description: schema.description ?? type.options?.description }
  } else {
    return { anyOf: [schema, optionalSchema], description: type.options?.description }
  }
}

function nullableToOpenAPIComponent(
  type: model.NullableType<model.Type>,
  internalData: InternalData,
): OpenAPIV3_1.ReferenceObject | OpenAPIV3_1.SchemaObject {
  const schema = modelToSchema(type.wrappedType, {
    ...internalData,
    ignoreFirstLevelOptionality: undefined,
  })
  if (internalData.ignoreFirstLevelOptionality) {
    return schema
  }
  const optionalSchema: OpenAPIV3_1.NonArraySchemaObject = { type: 'null', const: null }
  if ('anyOf' in schema && schema.anyOf && (!schema.description || !type.options?.description)) {
    return { anyOf: [...schema.anyOf, optionalSchema], description: schema.description ?? type.options?.description }
  } else {
    return { anyOf: [schema, optionalSchema], description: type.options?.description }
  }
}

function unionToOpenAPIComponent(
  type: model.UnionType<model.Types>,
  internalData: InternalData,
): OpenAPIV3_1.ReferenceObject | OpenAPIV3_1.SchemaObject {
  const anyOf = Object.values(type.variants).map((t) => modelToSchema(t, internalData))
  return { anyOf, description: type.options?.description }
}

function recordToOpenAPIComponent(
  type: model.EntityType<model.Mutability, model.Types> | model.ObjectType<model.Mutability, model.Types>,
  internalData: InternalData,
): OpenAPIV3_1.NonArraySchemaObject {
  const fields = Object.entries(type.fields).map(([fieldName, fieldType]) => {
    const hasToBeOptional =
      (model.unwrapAndConcretize(fieldType).kind === model.Kind.Entity || fieldName.startsWith('_')) &&
      !model.isOptional(fieldType)
    const mappedFieldType = fieldName.startsWith('_') ? model.partialDeep(fieldType) : fieldType
    const schema = modelToSchema(hasToBeOptional ? model.optional(mappedFieldType) : mappedFieldType, internalData)
    //here we use the field description, if there is not description then we fallback to the type description
    const descriptedSchema = {
      ...schema,
      description: (type.options?.fields ?? {})[fieldName]?.description ?? schema.description,
    }
    return [fieldName, descriptedSchema] as const
  })
  const isOptional: (
    type: OpenAPIV3_1.ReferenceObject | OpenAPIV3_1.SchemaObject,
  ) => { optional: true; subtype: OpenAPIV3_1.ReferenceObject | OpenAPIV3_1.SchemaObject } | false = (type) => {
    if ('anyOf' in type && type.anyOf?.some((v) => 'type' in v && v.type === 'null' && v.const !== null)) {
      const internalTypes = type.anyOf.filter((v) => !('type' in v && v.type === 'null' && v.const !== null))
      return {
        optional: true,
        subtype:
          internalTypes.length === 1
            ? { ...internalTypes[0], description: internalTypes[0].description ?? type.description }
            : { anyOf: internalTypes },
      }
    } else {
      return false
    }
  }
  const schema: OpenAPIV3_1.SchemaObject = {
    type: 'object',
    required: fields.filter(([_, type]) => isOptional(type) === false).map((v) => v[0]),
    properties: Object.fromEntries(
      fields.map(([name, type]) => {
        const isOpt = isOptional(type)
        if (isOpt !== false) {
          return [name, isOpt.subtype]
        }
        return [name, type]
      }),
    ),
    description: type.options?.description,
  }
  return schema
}
