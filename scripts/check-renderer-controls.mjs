import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve('src/renderer/src')
const allowedInputs = new Set([
  path.join(root, 'components/ui/TextInput.tsx'),
  path.join(root, 'components/ui/Checkbox.tsx')
])
const failures = []
function visitDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) visitDirectory(file)
    else if (entry.name.endsWith('.tsx') && !/\.(?:test|spec|mock)\.tsx$/.test(entry.name)) inspect(file)
  }
}
function inspect(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source)
      if (tag === 'select' || (tag === 'input' && !allowedInputs.has(file))) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
        failures.push(`${path.relative(root, file)}:${line + 1}\n${tag === 'select' ? 'Native <select> is not allowed.\nUse Combobox or MultiCombobox.' : 'Native <input> is not allowed in renderer components.\nUse TextInput or Checkbox from components/ui/.'}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}
visitDirectory(root)
if (failures.length) { console.error(failures.join('\n\n')); process.exitCode = 1 }
else console.log('Renderer controls check passed.')
