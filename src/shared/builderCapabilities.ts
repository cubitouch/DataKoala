import { isTimeType, type SqlDialect } from './types.ts'

export const BUILDER_AGGREGATIONS = [
  'count',
  'sum',
  'average',
  'minimum',
  'maximum',
] as const
export type BuilderAggregation = (typeof BUILDER_AGGREGATIONS)[number]

export const BUILDER_TIME_BUCKETS = [
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
] as const
export type BuilderTimeBucket = (typeof BUILDER_TIME_BUCKETS)[number]

const BUILDER_TEMPORAL_TYPES = new Set([
  'date',
  'datetime',
  'timestamp',
  'timestamptz',
  'timestamp_s',
  'timestamp_ms',
  'timestamp_ns',
  'timestamp with time zone',
  'timestamp without time zone',
])

export function isBuilderTemporalDataType(
  dataTypeName: string | undefined,
): boolean {
  return Boolean(
    dataTypeName &&
      BUILDER_TEMPORAL_TYPES.has(dataTypeName.trim().toLowerCase()) &&
      isTimeType(dataTypeName),
  )
}

export function isBuilderTimeBucketSupported(
  dataTypeName: string | undefined,
  bucket: BuilderTimeBucket,
  dialect?: SqlDialect,
): boolean {
  return !(
    dialect === 'google-sql' &&
    dataTypeName?.trim().toLowerCase() === 'date' &&
    (bucket === 'minute' || bucket === 'hour')
  )
}
