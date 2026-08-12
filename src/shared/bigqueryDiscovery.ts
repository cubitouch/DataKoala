export interface BigQueryProjectOption {
  projectId: string
  friendlyName?: string
}

export interface BigQueryDatasetOption {
  projectId: string
  datasetId: string
  friendlyName?: string
  location?: string
}

export interface BigQueryDiscoveryDefaults {
  projectId?: string
}

export interface ParsedBigQueryReference {
  projectId: string
  datasetId?: string
  tableId?: string
}

const segment = '[A-Za-z0-9_-]+'

/** Parse common BigQuery identifiers without ever interpreting credentials or URLs. */
export function parseBigQueryReference(input: string): ParsedBigQueryReference | null {
  const value = input.trim().replace(/^`|`$/g, '')
  let match = value.match(new RegExp(`^projects/(${segment})/datasets/(${segment})(?:/tables/(${segment}))?$`))
  if (match) return { projectId: match[1], datasetId: match[2], ...(match[3] ? { tableId: match[3] } : {}) }
  match = value.match(new RegExp(`^(${segment})(?:[.:](${segment}))?(?:[.](${segment}))?$`))
  if (!match || !match[2]) return null
  return { projectId: match[1], datasetId: match[2], ...(match[3] ? { tableId: match[3] } : {}) }
}
