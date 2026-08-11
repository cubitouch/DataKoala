import { useRef } from 'react'
import { createResultFilter, type ResultFilter } from '../../lib/resultFilters'

export function CellFilterMenu({ column, value, nativeType, onAdd }: {
  column: string
  value: unknown
  nativeType?: string
  onAdd: (filter: ResultFilter) => void
}) {
  const details = useRef<HTMLDetailsElement>(null)
  const isNull = value === null || value === undefined
  const add = (filter: ResultFilter) => {
    onAdd(filter)
    details.current?.removeAttribute('open')
  }
  return <details className="cell-filter-menu" ref={details} onKeyDown={(event) => {
    if (event.key === 'Escape') details.current?.removeAttribute('open')
  }}>
    <summary aria-label={`Filter actions for ${column}`}>⋮</summary>
    <div className="cell-filter-menu-items">
      {isNull ? <>
        <button type="button" onClick={() => add(createResultFilter(column, 'isNull', undefined, nativeType))}>Show only NULL</button>
        <button type="button" onClick={() => add(createResultFilter(column, 'isNotNull', undefined, nativeType))}>Exclude NULL</button>
      </> : <>
        <button type="button" onClick={() => add(createResultFilter(column, 'equals', value, nativeType))}>Filter to this value</button>
        <button type="button" onClick={() => add(createResultFilter(column, 'notEquals', value, nativeType))}>Exclude this value</button>
      </>}
    </div>
  </details>
}
