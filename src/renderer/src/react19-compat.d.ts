import 'react'

declare module 'react' {
  function useRef<T = undefined>(): RefObject<T | undefined>
}
