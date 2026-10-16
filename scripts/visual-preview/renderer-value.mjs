/** A fixed JSON.parse call with an encoded data literal; accepts no source code. */
export function rendererValue(value) {
  const json = JSON.stringify(value)
  if (json === undefined) throw new TypeError('Renderer values must be JSON data')
  // JSON already escapes quotes, backslashes and controls. Escape HTML delimiters
  // and JS line separators too, so this literal is safe in either script context.
  const literal = JSON.stringify(json).replace(/[<>\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
  // Parse JSON rather than emitting an object literal: even a "__proto__" key is
  // ordinary data, and cannot change the resulting object's prototype.
  return `JSON.parse(${literal})`
}
