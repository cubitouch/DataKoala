import type { createTextSearch } from '@lib/textSearch'
import styles from './HighlightedText.module.css'

export function HighlightedText({
  text,
  search,
}: {
  text: string
  search?: ReturnType<typeof createTextSearch>
}) {
  if (!search) return text
  return search.segments(text).map((segment, index) =>
    segment.matched ? (
      <mark className={styles.match} key={index}>
        {segment.text}
      </mark>
    ) : (
      segment.text
    ),
  )
}
