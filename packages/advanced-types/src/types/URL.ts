import { decoder, m, validator } from '@mondrian-framework/model'

export type URLType = m.CustomType<'URL', {}, URL>

export function url(options?: m.BaseOptions): URLType {
  return m.custom(
    'URL',
    (value) => value.toString(),
    decodeUrl,
    (_url) => validator.succeed(),
    options,
  )
}

function decodeUrl(value: unknown): decoder.Result<URL> {
  return typeof value === 'string' || value instanceof URL
    ? makeUrl(value)
    : decoder.baseFail('Invalid URL format (RFC 3986)', value)
}

function makeUrl(value: string | URL): decoder.Result<URL> {
  try {
    return decoder.succeed(new URL(value))
  } catch (_) {
    return decoder.baseFail('Invalid URL format (RFC 3986)', value)
  }
}
