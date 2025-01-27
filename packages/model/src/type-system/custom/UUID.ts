import { model } from '../..'
import { fromRegexes } from './regex'

const UUID_REGEX = /^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$/

export type UUIDType = model.CustomType<'UUID', {}, string>

export function uuid(options?: model.BaseOptions): UUIDType {
  return fromRegexes('UUID', 'invalid UUID', options, undefined, UUID_REGEX)
}
