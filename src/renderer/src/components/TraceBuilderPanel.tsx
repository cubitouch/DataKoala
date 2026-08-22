import { useMemo } from 'react'
import type { DatabaseSchemaNode } from '@shared/types'
import type { MetadataStatus } from '../store/useStore'
import {
  type TraceBuilderState,
  type TraceProtocol,
  type TraceSpanKind,
  type TraceStatus
} from '../lib/traceBuilder'
import { Combobox, type ComboboxOption } from './ui/combobox'
import styles from './TraceBuilderPanel.module.css'

interface TraceBuilderPanelProps {
  value: TraceBuilderState
  traceql: string
  schemas: DatabaseSchemaNode[]
  metadataStatus: MetadataStatus
  metadataError: string | null
  messagingSystems: string[]
  messagingSystemsLoading: boolean
  messagingSystemsError: string | null
  onChange: (patch: Partial<TraceBuilderState>) => void
}

const spanKindOptions: ComboboxOption[] = [
  { value: 'any', label: 'Any kind' },
  { value: 'server', label: 'Server', subtitle: 'Incoming request' },
  { value: 'client', label: 'Client', subtitle: 'Outgoing request' },
  { value: 'producer', label: 'Producer', subtitle: 'Publishes a message' },
  { value: 'consumer', label: 'Consumer', subtitle: 'Receives or processes a message' },
  { value: 'internal', label: 'Internal', subtitle: 'In-process work' },
  { value: 'unspecified', label: 'Unspecified' }
]

const protocolOptions: ComboboxOption[] = [
  { value: 'any', label: 'Any protocol' },
  { value: 'http', label: 'HTTP / network' },
  { value: 'rpc', label: 'RPC / gRPC' },
  { value: 'messaging', label: 'Messaging' },
  { value: 'database', label: 'Database' }
]

const httpMethodOptions: ComboboxOption[] = [
  { value: '', label: 'Any method' },
  ...['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'].map((method) => ({ value: method, label: method }))
]

const statusOptions: ComboboxOption[] = [
  { value: 'any', label: 'Any status' },
  { value: 'unset', label: 'Unset' },
  { value: 'ok', label: 'OK' },
  { value: 'error', label: 'Error' }
]

const rpcSystemOptions: ComboboxOption[] = [
  { value: '', label: 'Any RPC system' },
  { value: 'grpc', label: 'gRPC' },
  { value: 'jsonrpc', label: 'JSON-RPC' }
]

const messagingOperationOptions: ComboboxOption[] = [
  { value: '', label: 'Any operation' },
  { value: 'publish', label: 'Publish' },
  { value: 'receive', label: 'Receive' },
  { value: 'process', label: 'Process' },
  { value: 'settle', label: 'Settle' }
]

const dbSystemOptions: ComboboxOption[] = [
  { value: '', label: 'Any database' },
  ...['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'elasticsearch'].map((system) => ({ value: system, label: system }))
]

function Control({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className={styles.control}><span className={styles.fieldLabel}>{label}</span>{children}{hint && <small className={styles.fieldHint}>{hint}</small>}</div>
}

export function TraceBuilderPanel({ value, traceql, schemas, metadataStatus, metadataError, messagingSystems, messagingSystemsLoading, messagingSystemsError, onChange }: TraceBuilderPanelProps) {
  const serviceRelations = useMemo(() => schemas.flatMap((schema) => schema.relations).filter((relation) => relation.kind === 'service'), [schemas])
  const namespaceOptions = useMemo<ComboboxOption[]>(() => {
    const namespaces = [...new Set(serviceRelations.flatMap((relation) => relation.details?.kind === 'service' && relation.details.serviceNamespace ? [relation.details.serviceNamespace] : []))].sort((left, right) => left.localeCompare(right))
    return [{ value: '', label: 'Any namespace' }, ...namespaces.map((namespace) => ({ value: namespace, label: namespace }))]
  }, [serviceRelations])
  const serviceOptions = useMemo<ComboboxOption[]>(() => {
    const names = [...new Set(serviceRelations
      .filter((relation) => !value.serviceNamespace || relation.details?.kind === 'service' && relation.details.serviceNamespace === value.serviceNamespace)
      .map((relation) => relation.name))].sort((left, right) => left.localeCompare(right))
    return [{ value: '', label: 'Any service' }, ...names.map((service) => ({ value: service, label: service }))]
  }, [serviceRelations, value.serviceNamespace])
  const metadataLoading = metadataStatus === 'loading'
  const metadataMessage = metadataError || null
  const messagingSystemOptions = useMemo<ComboboxOption[]>(() => {
    const systems = new Set(messagingSystems)
    if (value.messagingSystem) systems.add(value.messagingSystem)
    return [{ value: '', label: 'Any messaging system' }, ...[...systems].sort((left, right) => left.localeCompare(right)).map((system) => ({ value: system, label: system }))]
  }, [messagingSystems, value.messagingSystem])

  const changeNamespace = (serviceNamespace: string) => {
    const allowedServices = new Set(serviceRelations
      .filter((relation) => !serviceNamespace || relation.details?.kind === 'service' && relation.details.serviceNamespace === serviceNamespace)
      .map((relation) => relation.name))
    onChange({ serviceNamespace, ...(value.service && !allowedServices.has(value.service) ? { service: '' } : {}) })
  }

  return <div className={styles.root} data-tempo-builder="">
    <div className={styles.coreRow}>
      <Control label="Namespace"><Combobox label="Namespace" value={value.serviceNamespace} options={namespaceOptions} onChange={changeNamespace} searchable allowCustomValue loading={metadataLoading} error={metadataMessage} placeholder="Any namespace" emptyMessage="No namespaces found" /></Control>
      <Control label="Service"><Combobox label="Service" value={value.service} options={serviceOptions} onChange={(service) => onChange({ service })} searchable allowCustomValue loading={metadataLoading} error={metadataMessage} placeholder="Any service" emptyMessage="No services found" invalidationKey={value.serviceNamespace} /></Control>
      <Control label="Span kind"><Combobox label="Span kind" value={value.spanKind} options={spanKindOptions} onChange={(spanKind) => onChange({ spanKind: spanKind as TraceSpanKind })} /></Control>
      <Control label="Protocol / subsystem"><Combobox label="Protocol or subsystem" value={value.protocol} options={protocolOptions} onChange={(protocol) => onChange({ protocol: protocol as TraceProtocol })} /></Control>
      <Control label="Status"><Combobox label="Status" value={value.status} options={statusOptions} onChange={(status) => onChange({ status: status as TraceStatus })} /></Control>
      <Control label="Min duration (ms)"><input type="number" min="0" step="1" value={value.minDurationMs} onChange={(event) => onChange({ minDurationMs: event.target.value })} placeholder="300" /></Control>
    </div>

    {value.protocol === 'http' && <div className={styles.detailRow}>
      <Control label="HTTP method"><Combobox label="HTTP method" value={value.httpMethod} options={httpMethodOptions} onChange={(httpMethod) => onChange({ httpMethod })} /></Control>
      <Control label="Route / endpoint" hint={value.spanKind === 'client' ? 'Matches URL template/path for client spans.' : value.spanKind === 'server' ? 'Matches the instrumented HTTP route.' : 'Matches route, URL template or path.'}><input value={value.endpoint} onChange={(event) => onChange({ endpoint: event.target.value })} placeholder="/checkout/{id}" /></Control>
    </div>}

    {value.protocol === 'rpc' && <div className={styles.detailRow}>
      <Control label="RPC system"><Combobox label="RPC system" value={value.rpcSystem} options={rpcSystemOptions} onChange={(rpcSystem) => onChange({ rpcSystem })} searchable allowCustomValue /></Control>
      <Control label="RPC service"><input value={value.rpcService} onChange={(event) => onChange({ rpcService: event.target.value })} placeholder="CartService" /></Control>
      <Control label="RPC method"><input value={value.rpcMethod} onChange={(event) => onChange({ rpcMethod: event.target.value })} placeholder="Checkout" /></Control>
    </div>}

    {value.protocol === 'messaging' && <div className={styles.detailRow}>
      <Control label="Messaging system"><Combobox label="Messaging system" value={value.messagingSystem} options={messagingSystemOptions} onChange={(messagingSystem) => onChange({ messagingSystem })} searchable allowCustomValue loading={messagingSystemsLoading} error={messagingSystemsError} loadingMessage="Loading messaging systems…" emptyMessage="No messaging systems found. Type a custom value." placeholder="Any messaging system" /></Control>
      <Control label="Destination / topic"><input value={value.messagingDestination} onChange={(event) => onChange({ messagingDestination: event.target.value })} placeholder="orders" /></Control>
      <Control label="Operation"><Combobox label="Messaging operation" value={value.messagingOperation} options={messagingOperationOptions} onChange={(messagingOperation) => onChange({ messagingOperation })} searchable allowCustomValue /></Control>
    </div>}

    {value.protocol === 'database' && <div className={styles.detailRow}>
      <Control label="Database system"><Combobox label="Database system" value={value.dbSystem} options={dbSystemOptions} onChange={(dbSystem) => onChange({ dbSystem })} searchable allowCustomValue /></Control>
      <Control label="DB operation"><input value={value.dbOperation} onChange={(event) => onChange({ dbOperation: event.target.value })} placeholder="SELECT" /></Control>
    </div>}

    <details className={styles.advanced}>
      <summary>Advanced operation filter</summary>
      <Control label="Exact span / operation name" hint="Use this when semantic attributes are missing or the exact span name is the clearest filter."><input value={value.spanName} onChange={(event) => onChange({ spanName: event.target.value })} placeholder="POST /checkout" /></Control>
    </details>

    <div className={styles.generated}><span>Generated TraceQL</span><code title={traceql}>{traceql}</code></div>
  </div>
}
