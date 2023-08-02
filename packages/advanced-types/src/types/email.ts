import { decoder, m, validator } from '@mondrian-framework/model'

export type EmailType = m.CustomType<'email', {}, string>

export function email(options?: m.BaseOptions): EmailType {
  return m.custom(
    'email',
    (value) => value,
    (value) => (typeof value === 'string' ? decoder.succeed(value) : decoder.baseFail('Expected a mail string', value)),
    validateEmail,
    options,
  )
}

const EMAIL_REGEX =
  /^[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/

function validateEmail(value: string): validator.Result {
  //thanks to https://github.com/manishsaraan/email-validator
  const emailParts = value.split('@')
  if (emailParts.length !== 2) {
    return validator.baseFail('Invalid email (no @ present)', value)
  }
  const account = emailParts[0]
  const address = emailParts[1]
  if (account.length > 64) {
    return validator.baseFail('Invalid email (account is longer than 63 characters)', value)
  } else if (address.length > 255) {
    return validator.baseFail('Invalid email (domain is longer than 254 characters)', value)
  }
  const domainParts = address.split('.')
  if (domainParts.some((part) => part.length > 63) || !EMAIL_REGEX.test(value)) {
    return validator.baseFail('Invalid email', value)
  }
  return validator.succeed()
}
