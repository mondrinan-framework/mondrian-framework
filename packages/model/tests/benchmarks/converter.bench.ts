import { model } from '../../src'
import { describe, bench } from 'vitest'

const int = model.integer({ minimum: 10, exclusiveMaximum: 30 })

describe('benchmark number', () => {
  bench('validate', () => {
    int.validate(1, { errorReportingStrategy: 'allErrors' })
    int.validate(1, { errorReportingStrategy: 'stopAtFirstError' })

    int.validate(30, { errorReportingStrategy: 'allErrors' })
    int.validate(30, { errorReportingStrategy: 'stopAtFirstError' })

    int.validate(15, { errorReportingStrategy: 'allErrors' })
    int.validate(15, { errorReportingStrategy: 'stopAtFirstError' })

    int.validate(15.1, { errorReportingStrategy: 'allErrors' })
    int.validate(15.1, { errorReportingStrategy: 'stopAtFirstError' })
  })
})
