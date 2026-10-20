interface ProviderError {
  code?: number | string
  message?: string
  errors?: { reason?: string }[]
  error?: string
  response?: { data?: { error?: string | { errors?: { reason?: string }[] } } }
}

/** Read diagnostic fields only; never stringify SDK request/config/header objects. */
export function bigQueryErrorInfo(error: unknown) {
  const value = (
    error && typeof error === 'object' ? error : {}
  ) as ProviderError
  const code =
    typeof value.code === 'string' && /^\d{3}$/.test(value.code)
      ? Number(value.code)
      : typeof value.code === 'number' || typeof value.code === 'string'
        ? value.code
        : undefined
  const nested = value.response?.data?.error
  const reasons = [
    ...(Array.isArray(value.errors) ? value.errors : []).map((entry) =>
      typeof entry?.reason === 'string' ? entry.reason : '',
    ),
    ...(nested && typeof nested === 'object' && Array.isArray(nested.errors)
      ? nested.errors
      : []
    ).map((entry) => (typeof entry?.reason === 'string' ? entry.reason : '')),
    typeof value.error === 'string' ? value.error : '',
    typeof nested === 'string' ? nested : '',
  ].filter(Boolean)
  const message =
    typeof value.message === 'string'
      ? value.message.trim()
      : typeof error === 'string'
        ? error.trim()
        : ''
  return { code, reasons, message }
}

/** Known local ADC validation messages from the installed google-auth-library.
 * Match the SDK wording/fields, never arbitrary JSON errors or SQL identifiers.
 */
export function isBigQueryAdcLoadingFailure(error: unknown): boolean {
  const { code, reasons, message } = bigQueryErrorInfo(error)
  if (code === 400 && reasons.includes('invalidQuery')) return false
  return (
    /^The incoming JSON object does not contain a (?:client_id|client_secret|refresh_token|client_email|private_key|source_credentials|service_account_impersonation_url) field\.?$/.test(
      message,
    ) ||
    /^The incoming JSON object does not have the "(?:authorized_user|impersonated_service_account)" type\.?$/.test(
      message,
    ) ||
    /^Must pass in a JSON object containing (?:the user refresh token|the service account auth settings|an {2}impersonated refresh token)\.?$/.test(
      message,
    )
  )
}

export function friendlyBigQueryError(error: unknown): string {
  if (error instanceof BigQueryProviderError) return error.message
  const { code, reasons, message } = bigQueryErrorInfo(error)
  const reason = reasons.join(' ')
  const details = message ? ` Details: ${message}` : ''
  if (code === 400 && reasons.includes('invalidQuery'))
    return message
      ? `BigQuery query failed. ${message}`
      : 'BigQuery query failed. Review the SQL and try again.'
  if (isBigQueryAdcLoadingFailure(error))
    return 'BigQuery authentication failed: the Google Application Default Credentials (ADC) JSON is incomplete or invalid. Check GOOGLE_APPLICATION_CREDENTIALS or recreate user ADC with gcloud auth application-default login, then reconnect.'
  const authentication =
    'BigQuery authentication failed. DataKoala uses Google Application Default Credentials (ADC). Review GOOGLE_APPLICATION_CREDENTIALS or run gcloud auth application-default login, then reconnect; gcloud auth login alone does not configure ADC.'
  if (
    /invalid_grant|invalid_rapt|(?:token|credential|authentication).*(?:expired|revoked)|(?:expired|revoked).*(?:token|credential)|reauthentication/i.test(
      `${reason} ${message}`,
    )
  )
    return 'BigQuery authentication has expired or was revoked. DataKoala uses Google Application Default Credentials (ADC). Renew ADC with gcloud auth application-default login, then reconnect.'
  if (code === 401 || /authError|unauthenticated|invalid_client/i.test(reason))
    return authentication
  if (
    /accessNotConfigured|serviceDisabled/i.test(reason) ||
    /(?:bigquery|api).*(?:disabled|has not been used|not enabled)/i.test(
      message,
    )
  )
    return `The BigQuery API is disabled for the configured project. Enable bigquery.googleapis.com in the billing project and verify the selected data project.${details}`
  if (
    /billingNotEnabled|billingNotConfigured/i.test(reason) ||
    /billing.*(?:disabled|not enabled|not configured|invalid|not found|permission)/i.test(
      message,
    )
  )
    return `BigQuery billing-project configuration failed. Check Billing project, its active billing account and permission to create query jobs; Data project selects the datasets.${details}`
  if (
    /location mismatch|(?:dataset|table).*\blocation\b|does not match.*location/i.test(
      message,
    )
  )
    return `BigQuery location mismatch. Match the configured location to the dataset region, or remove the override. Queries are not retried elsewhere.${details}`
  if (
    /unable to detect a project|project id.*(?:required|specified)/i.test(
      message,
    )
  )
    return 'BigQuery could not determine a project. Set Billing project and Data project in the connection, or review the ADC default project.'
  if (
    (code === 404 && /project/i.test(message)) ||
    /project.*(?:not found|inaccessible)|not found:\s*project/i.test(message)
  )
    return `BigQuery project was not found or is inaccessible. Verify the Billing project and Data project IDs and your access to each.${details}`

  if (
    code === 429 ||
    /quotaExceeded|rateLimitExceeded|jobRateLimitExceeded/i.test(reason)
  )
    return `BigQuery quota or rate limit reached. Wait before trying again and review the project quotas.${details}`
  if (code === 403 || reasons.includes('accessDenied'))
    return `BigQuery permission denied. Check dataset read permissions in Data project and permission to create query jobs in Billing project.${details}`
  if (
    (typeof code === 'number' && (code >= 500 || code === 408)) ||
    /^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)$/i.test(
      String(code),
    ) ||
    /backendError|internalError|serviceUnavailable/i.test(reason)
  )
    return `BigQuery is temporarily unavailable. Check your network and try again.${details || (code ? ` Code: ${code}.` : '')}`
  if (/credential|authentication|unauthenticated/i.test(message))
    return authentication
  return message
    ? `BigQuery request failed. ${message}`
    : 'BigQuery request failed without diagnostic details. Try again and review the connection configuration and Google Cloud status.'
}

export class BigQueryProviderError extends Error {
  constructor(cause: unknown) {
    super(friendlyBigQueryError(cause), { cause })
    this.name = 'BigQueryProviderError'
  }
}

/** Metadata/discovery calls share provider guidance without changing query validation. */
export async function withBigQueryErrors<T>(
  execute: () => Promise<T>,
): Promise<T> {
  try {
    return await execute()
  } catch (error) {
    if (error instanceof BigQueryProviderError) throw error
    throw new BigQueryProviderError(error)
  }
}
