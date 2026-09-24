import type { TempoDatasourceOption } from '../shared/tempoDatasource.ts'
import { parseGcxJson, runGcxCommand } from './gcx-command.ts'

export async function discoverTempoDatasources(context?: string): Promise<TempoDatasourceOption[]> {
  const args = ['api', '/api/datasources', ...(context ? ['--context', context] : []), '-o', 'json']
  const raw = parseGcxJson((await runGcxCommand(args)).stdout, 'Grafana datasources')
  if (!Array.isArray(raw)) throw new Error('gcx returned an invalid Grafana datasource response.')
  return raw.filter((item): item is TempoDatasourceOption => !!item && typeof item === 'object' && typeof item.uid === 'string' && typeof item.name === 'string' && typeof item.type === 'string' && /tempo/i.test(item.type)).sort((a, b) => a.name.localeCompare(b.name))
}
