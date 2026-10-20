import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BigQueryProviderError,
  bigQueryErrorInfo,
  friendlyBigQueryError,
  withBigQueryErrors,
} from './bigquery-errors.ts'

// Sanitized SDK/Gaxios field shapes. No credentials, headers or live account data.
const cases: [string, unknown, RegExp][] = [
  [
    'missing ADC',
    new Error(
      'Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information.',
    ),
    /Application Default Credentials.*gcloud auth application-default login/,
  ],
  [
    'unusable ADC',
    { code: '401', message: 'invalid credentials' },
    /Review GOOGLE_APPLICATION_CREDENTIALS/,
  ],
  [
    'revoked ADC',
    {
      message: 'invalid_grant: Token has been expired or revoked',
      response: { data: { error: 'invalid_grant' } },
    },
    /expired or was revoked.*Renew ADC/,
  ],
  [
    'structured expired ADC',
    { response: { data: { error: 'invalid_grant' } } },
    /expired or was revoked/,
  ],
  [
    'structured authentication',
    { errors: [{ reason: 'authError' }] },
    /authentication failed/,
  ],
  [
    'project not found',
    { code: 404, message: 'Not found: Project demo-missing' },
    /project was not found.*Billing project and Data project.*demo-missing/,
  ],
  [
    'default project missing',
    new Error('Unable to detect a Project Id in the current environment.'),
    /could not determine a project/,
  ],
  [
    'dataset permission',
    {
      code: '403',
      errors: [{ reason: 'accessDenied' }],
      message:
        'Access Denied: Dataset demo:analytics: Permission bigquery.tables.get denied',
    },
    /permission denied.*dataset read permissions.*bigquery.tables.get/,
  ],
  [
    'disabled API before generic 403',
    {
      code: 403,
      errors: [{ reason: 'accessNotConfigured' }],
      message:
        'BigQuery API has not been used in project demo before or it is disabled.',
    },
    /API is disabled.*bigquery.googleapis.com/,
  ],
  [
    'billing before generic 403',
    {
      code: 403,
      errors: [{ reason: 'billingNotEnabled' }],
      message: 'Billing has not been enabled for this project',
    },
    /billing-project configuration failed.*permission to create query jobs/,
  ],
  [
    'location',
    { code: 400, message: 'Dataset demo:analytics is in location EU, not US' },
    /location mismatch.*dataset region.*not retried elsewhere/,
  ],
  [
    'network',
    {
      code: 'ENOTFOUND',
      message: 'getaddrinfo ENOTFOUND bigquery.googleapis.com',
    },
    /temporarily unavailable.*Check your network.*ENOTFOUND/,
  ],
  [
    'provider unavailable',
    {
      code: 503,
      errors: [{ reason: 'backendError' }],
      message: 'Backend Error',
    },
    /temporarily unavailable.*Backend Error/,
  ],
  [
    'quota',
    {
      code: 429,
      errors: [{ reason: 'rateLimitExceeded' }],
      message: 'Quota exceeded',
    },
    /quota or rate limit reached/,
  ],
  [
    'unknown message',
    new Error('Synthetic new provider problem'),
    /request failed\. Synthetic new provider problem/,
  ],
  [
    'unknown shape',
    { config: { headers: { Authorization: 'SYNTHETIC_DO_NOT_STRINGIFY' } } },
    /failed without diagnostic details/,
  ],
  ['undefined', undefined, /failed without diagnostic details/],
]
for (const [name, input, expected] of cases) {
  test(`BigQuery guidance: ${name}`, () => {
    const message = friendlyBigQueryError(input)
    assert.match(message, expected)
    assert.doesNotMatch(message, /\[object Object\]|SYNTHETIC_DO_NOT_STRINGIFY/)
  })
}

test('preserves structured SDK reasons beyond the first entry and numeric HTTP codes', () => {
  assert.deepEqual(
    bigQueryErrorInfo({
      code: '403',
      errors: [{ reason: 'other' }, { reason: 'accessNotConfigured' }],
    }),
    {
      code: 403,
      reasons: ['other', 'accessNotConfigured'],
      message: '',
    },
  )
  assert.match(
    friendlyBigQueryError({
      code: '403',
      errors: [{ reason: 'other' }, { reason: 'accessNotConfigured' }],
    }),
    /API is disabled/,
  )
})

test('nested discovery/metadata boundaries do not duplicate guidance or retry', async () => {
  let calls = 0
  const cause = new Error('Could not load default credentials')
  await assert.rejects(
    withBigQueryErrors(() =>
      withBigQueryErrors(async () => {
        calls++
        throw cause
      }),
    ),
    (error) => {
      assert.ok(error instanceof BigQueryProviderError)
      assert.equal(error.cause, cause)
      assert.equal(
        error.message.split('BigQuery authentication failed').length,
        2,
      )
      return true
    },
  )
  assert.equal(calls, 1)
})

test('auth guidance omits opaque provider text without claiming credential disclosure', () => {
  assert.doesNotMatch(
    friendlyBigQueryError({ code: 401, message: 'SYNTHETIC_NON03_TOKEN' }),
    /SYNTHETIC_NON03_TOKEN/,
  )
})

test('malformed SDK diagnostics use the unknown fallback without throwing', () => {
  for (const input of [
    { response: { data: { error: null } } },
    { errors: {} },
    { errors: [null, { reason: {} }] },
    { code: {}, error: {} },
  ]) {
    assert.match(
      friendlyBigQueryError(input),
      /request failed without diagnostic details/,
    )
  }
})

test('structured query/quota failures outrank misleading vocabulary and generic permission status', () => {
  assert.equal(
    friendlyBigQueryError({
      code: 400,
      errors: [{ reason: 'invalidQuery' }],
      message: 'Unrecognized name: credential at [1:8]',
    }),
    'BigQuery query failed. Unrecognized name: credential at [1:8]',
  )
  assert.match(
    friendlyBigQueryError({
      code: 403,
      errors: [{ reason: 'quotaExceeded' }],
      message: 'Quota exceeded',
    }),
    /quota or rate limit reached/,
  )
})
