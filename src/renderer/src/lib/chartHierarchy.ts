import { toFiniteNumber, type Aggregation } from './resultVisualization.ts'

export interface HierarchyNode {
  name: string
  value: number
  children?: HierarchyNode[]
}

export interface HierarchyInput {
  rows: readonly Record<string, unknown>[]
  dimensions: readonly string[]
  valueColumn: string | null
  aggregation: Aggregation
}

const label = (value: unknown) => value == null ? 'NULL' : String(value)

function aggregate(values: readonly number[], rows: number, aggregation: Aggregation): number {
  if (aggregation === 'count') return rows
  if (!values.length) return 0
  if (aggregation === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length
  if (aggregation === 'minimum') return Math.min(...values)
  if (aggregation === 'maximum') return Math.max(...values)
  return values.reduce((sum, value) => sum + value, 0)
}

interface MutableNode { name: string; rows: number; values: number[]; children: Map<string, MutableNode> }

/** Builds the shared semantic tree consumed by treemap and sunburst renderers. */
export function buildHierarchy(input: HierarchyInput): HierarchyNode[] {
  const roots = new Map<string, MutableNode>()
  for (const row of input.rows) {
    let level = roots
    for (const dimension of input.dimensions) {
      const rawDimension = row[dimension]
      const name = label(rawDimension)
      const key = `${typeof rawDimension}:${String(rawDimension)}`
      const node: MutableNode = level.get(key) ?? { name, rows: 0, values: [], children: new Map<string, MutableNode>() }
      node.rows++
      const value = input.valueColumn ? toFiniteNumber(row[input.valueColumn]) : null
      if (value !== null) node.values.push(value)
      level.set(key, node)
      level = node.children
    }
  }
  const finalize = (node: MutableNode): HierarchyNode => {
    const children = [...node.children.values()].map(finalize).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    return { name: node.name, value: aggregate(node.values, node.rows, input.aggregation), ...(children.length ? { children } : {}) }
  }
  return [...roots.values()].map(finalize).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

export interface DimensionCardinality { column: string; distinctCount: number }

/** Uses only the current result rows, so recommending hierarchy order never queries the datasource. */
export function hierarchyCardinalities(rows: readonly Record<string, unknown>[], dimensions: readonly string[]): DimensionCardinality[] {
  return dimensions.map((column) => ({ column, distinctCount: new Set(rows.map((row) => `${typeof row[column]}:${String(row[column])}`)).size }))
}

export function suggestHierarchyDimensions(rows: readonly Record<string, unknown>[], dimensions: readonly string[]): string[] {
  const originalIndex = new Map(dimensions.map((column, index) => [column, index]))
  return hierarchyCardinalities(rows, dimensions).sort((a, b) => a.distinctCount - b.distinctCount || originalIndex.get(a.column)! - originalIndex.get(b.column)!).map(({ column }) => column)
}
