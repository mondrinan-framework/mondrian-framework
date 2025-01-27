import { decoding, encoding, model, validation } from '../..'
import { BaseType } from './base'
import { JSONType, failWithInternalError } from '@mondrian-framework/utils'
import gen from 'fast-check'

/**
 * @param variants a record with the different variants of the union
 * @param options the {@link model.UnionTypeOptions} used to define the new `UnionType`
 * @returns a new {@link model.UnionType} with the provided variants
 * @example Imagine you are modelling the response a server might send a client following a request.
 *          The response may be successfull and hold a value (let's say it's just an integer value
 *          for simplicity) or be an error and hold an error code and an additional string to
 *          explain what went wrong.
 *
 *          This type could be modelled as follows:
 *          ```ts
 *          type Respose = model.Infer<typeof response>
 *          const response = model.union({
 *            success: model.number(),
 *            failure: model.object({
 *              errorCode: model.number(),
 *              errorMessage: model.string(),
 *            })
 *          })
 *
 *          const successResponse: Response = 1
 *          const failureResponse: Response = { errorCode: 418, errorMessage: "I'm a teapot" }
 *          ```
 */
export function union<Ts extends model.Types>(variants: Ts, options?: model.UnionTypeOptions): model.UnionType<Ts> {
  return new UnionTypeImpl(variants, options)
}

class UnionTypeImpl<Ts extends model.Types> extends BaseType<model.UnionType<Ts>> implements model.UnionType<Ts> {
  readonly kind = model.Kind.Union
  readonly variants: Ts

  protected fromOptions = (options: model.UnionTypeOptions) => union(this.variants, options)
  protected getThis = () => this

  constructor(variants: Ts, options?: model.UnionTypeOptions) {
    super(options)
    this.variants = variants
  }

  protected encodeWithoutValidationInternal(
    value: model.Infer<model.UnionType<Ts>>,
    options: Required<encoding.Options>,
  ): JSONType {
    const variantName = this.variantOwnership(value)
    const variantType = this.variants[variantName]
    if (variantType === undefined) {
      failWithInternalError(
        'I tried to encode an object that is not a variant as a union. This should have been prevented by the type system',
      )
    } else {
      const concreteVariantType = model.concretise(variantType)
      const encoded = concreteVariantType.encodeWithoutValidation(value as never, options)
      return encoded
    }
  }

  protected validateInternal(
    value: model.Infer<model.UnionType<Ts>>,
    options: Required<validation.Options>,
  ): validation.Result {
    const decoded = this.decodeAndTryToValidate(value, undefined, options)
    if (decoded.isFailure) {
      failWithInternalError(
        'Type system should have prevented this error in validation. This values does not match with any variant of this union.',
      )
    }
    const { validated, validationErrors } = decoded.value
    if (validated) {
      return validation.succeed()
    } else {
      return validation.failWithErrors(validationErrors)
    }
  }

  protected decodeWithoutValidationInternal(
    value: unknown,
    options: Required<decoding.Options>,
  ): decoding.Result<model.Infer<model.UnionType<Ts>>> {
    return this.decodeAndTryToValidate(value, options).map(({ value }) => value)
  }

  arbitraryInternal(maxDepth: number): gen.Arbitrary<model.Infer<model.UnionType<Ts>>> {
    const variantsGenerators = Object.values(this.variants).map((variantType) =>
      model.concretise(variantType).arbitrary(maxDepth - 1),
    )
    return gen.oneof(...variantsGenerators) as gen.Arbitrary<model.Infer<model.UnionType<Ts>>>
  }

  variantOwnership(value: model.Infer<model.UnionType<Ts>>): keyof Ts & string {
    const decoded = this.decodeAndTryToValidate(value, {
      typeCastingStrategy: 'expectExactTypes',
      errorReportingStrategy: 'stopAtFirstError',
      fieldStrictness: 'expectExactFields',
    })
    if (decoded.isFailure) {
      failWithInternalError(
        'Type system should have prevented this error. This values does not match with any variant of this union.',
      )
    }
    return decoded.value.variantName as keyof Ts & string
  }

  private decodeAndTryToValidate(
    value: unknown,
    decodingOptions?: decoding.Options,
    validationOptions?: validation.Options,
  ): decoding.Result<{
    variantName: keyof Ts
    value: model.Infer<model.UnionType<Ts>>
    validated: boolean
    validationErrors: validation.Error[]
  }> {
    if (
      decodingOptions?.typeCastingStrategy === 'tryCasting' ||
      decodingOptions?.fieldStrictness === 'allowAdditionalFields'
    ) {
      //before using casting try to decode without casting in order to select the corret variant
      const resultWithNoCasting = this.decodeAndTryToValidate(value, {
        ...decodingOptions,
        typeCastingStrategy: 'expectExactTypes',
        fieldStrictness: 'expectExactFields',
      })
      if (resultWithNoCasting.isOk) {
        return resultWithNoCasting
      }
    }

    const decodingErrors: decoding.Error[] = []
    const validationErrors: validation.Error[] = []
    let potentialDecoded: { variantName: keyof Ts; value: model.Infer<model.UnionType<Ts>> } | null = null
    for (const [variantName, variantType] of Object.entries(this.variants)) {
      const concrete = model.concretise(variantType)
      const result = concrete.decodeWithoutValidation(value, decodingOptions)
      if (result.isOk) {
        //look ahead with `validate` in order to get a correct variant if possible
        const validateResult = concrete.validate(result.value as never, validationOptions)
        if (validateResult.isOk) {
          return decoding.succeed({ variantName, value: result.value, validated: true, validationErrors: [] })
        } else {
          //keep this as potential variant but it will not validate
          validationErrors.push(
            ...validateResult.error.map((v) => ({
              ...v,
              variants: v.variants ? [variantName, ...v.variants] : [variantName],
            })),
          )
          potentialDecoded = potentialDecoded ?? { variantName, value: result.value }
        }
      } else {
        decodingErrors.push(
          ...result.error.map((v) => ({ ...v, variants: v.variants ? [variantName, ...v.variants] : [variantName] })),
        )
      }
    }
    if (potentialDecoded !== null) {
      //returns the non validating variant
      return decoding.succeed({ ...potentialDecoded, validated: false, validationErrors })
    }
    return decoding.failWithErrors(decodingErrors)
  }
}
