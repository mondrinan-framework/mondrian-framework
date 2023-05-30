import { CustomType, custom, literal } from '../type-system'

//TODO: make it root
const VoidEncodeType = literal(null).optional()
type VoidEncodeType = typeof VoidEncodeType
export type VoidType = CustomType<void, VoidEncodeType, {}>
export function voidType(opts?: VoidType['opts']): VoidType {
  return custom(
    {
      name: 'void',
      encodedType: VoidEncodeType,
      decode: () => {
        return { success: true, value: undefined as void }
      },
      encode: () => {
        return undefined
      },
      validate() {
        return { success: true }
      },
    },
    opts,
  )
}
