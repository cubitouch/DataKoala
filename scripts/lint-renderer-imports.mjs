import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const fix = process.argv.includes('--fix')
const repositoryRoot = process.cwd()
const rendererRoot = path.join(repositoryRoot, 'src/renderer/src')
const sharedRoot = path.join(repositoryRoot, 'src/shared')

const rendererAliases = [
  { directory: path.join(rendererRoot, 'components'), alias: '@components' },
  { directory: path.join(rendererRoot, 'lib'), alias: '@lib' },
  { directory: path.join(rendererRoot, 'store'), alias: '@store' },
  { directory: path.join(rendererRoot, 'test'), alias: '@test' },
  { directory: rendererRoot, alias: '@renderer' }
]

const sourceExtensions = new Set(['.ts', '.tsx'])
const vitestModuleSpecifierCalls = new Set(['mock', 'doMock', 'unmock', 'importActual', 'importMock'])

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}

function aliasForTarget(target) {
  for (const { directory, alias } of rendererAliases) {
    if (!isWithin(directory, target)) continue
    const relative = path.relative(directory, target).split(path.sep).join('/')
    if (!relative) return null
    return `${alias}/${relative}`
  }

  if (isWithin(sharedRoot, target)) {
    const relative = path.relative(sharedRoot, target).split(path.sep).join('/')
    return relative ? `@shared/${relative}` : null
  }

  return null
}

function isVitestModuleSpecifierCall(node) {
  if (!ts.isCallExpression(node) || !node.arguments.length) return false
  const expression = node.expression
  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'vi' &&
    vitestModuleSpecifierCalls.has(expression.name.text)
  )
}

function collectModuleSpecifiers(sourceFile) {
  const specifiers = []

  function add(node) {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node)
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier)
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      add(node.arguments[0])
    } else if (isVitestModuleSpecifierCall(node)) {
      add(node.arguments[0])
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      add(node.argument.literal)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return specifiers
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(absolute))
    } else if (
      entry.isFile() &&
      sourceExtensions.has(path.extname(entry.name)) &&
      !entry.name.endsWith('.d.ts')
    ) {
      files.push(absolute)
    }
  }

  return files
}

const violations = []
const files = await sourceFiles(rendererRoot)

for (const file of files) {
  const source = await readFile(file, 'utf8')
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )

  const replacements = []

  for (const literal of collectModuleSpecifiers(sourceFile)) {
    const specifier = literal.text
    if (specifier !== '..' && !specifier.startsWith('../')) continue

    const target = path.resolve(path.dirname(file), specifier)
    const suggested = aliasForTarget(target)
    const position = sourceFile.getLineAndCharacterOfPosition(literal.getStart(sourceFile))
    const relativeFile = path.relative(repositoryRoot, file)

    violations.push({
      file: relativeFile,
      line: position.line + 1,
      column: position.character + 1,
      specifier,
      suggested
    })

    if (fix && suggested) {
      replacements.push({
        start: literal.getStart(sourceFile) + 1,
        end: literal.getEnd() - 1,
        text: suggested
      })
    }
  }

  if (fix && replacements.length) {
    let updated = source
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
      updated = updated.slice(0, replacement.start) + replacement.text + updated.slice(replacement.end)
    }
    await writeFile(file, updated)
  }
}

if (!violations.length) {
  console.log('Renderer imports follow the local-relative/alias rule.')
  process.exit(0)
}

for (const violation of violations) {
  const suggestion = violation.suggested ? ` -> ${violation.suggested}` : ''
  console.log(`${violation.file}:${violation.line}:${violation.column} ${violation.specifier}${suggestion}`)
}

if (fix) {
  const fixable = violations.filter((violation) => violation.suggested).length
  const remaining = violations.length - fixable
  console.log(`\nRewrote ${fixable} parent-relative import${fixable === 1 ? '' : 's'}.`)
  if (remaining) {
    console.error(`${remaining} import${remaining === 1 ? '' : 's'} could not be mapped to a configured alias.`)
    process.exit(1)
  }
  console.log('Run pnpm lint:imports again to verify the result.')
  process.exit(0)
}

console.error(`\nFound ${violations.length} parent-relative import${violations.length === 1 ? '' : 's'}.`)
console.error('Use same-folder/child relative imports (./...) or a renderer alias.')
console.error('Run pnpm lint:imports:fix to rewrite imports that map to a configured alias.')
process.exit(1)