import styles from './Spinner.module.css'
/** Decorative spinner; put meaningful loading text in the surrounding status. */
export function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />
}
