import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const requireFromApi = createRequire(new URL('../apps/api/package.json', import.meta.url))
const ts = requireFromApi('typescript')

const root = path.resolve('apps/web/src')
const runtimePath = path.join(root, 'i18n/runtime.ts')
const catalogPath = path.join(root, 'i18n/feature-catalog.ts')
const sourceFiles = []

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(target)
    else if (/\.(tsx|ts)$/.test(entry.name) && target !== runtimePath && target !== catalogPath)
      sourceFiles.push(target)
  }
}

walk(root)

const runtime = `${fs.readFileSync(runtimePath, 'utf8')}\n${fs.readFileSync(catalogPath, 'utf8')}`
const translated = new Set(
  [...runtime.matchAll(/\[\s*'((?:\\.|[^'])*)'\s*,\s*'((?:\\.|[^'])*)'\s*\]/g)].map(match =>
    match[1].replaceAll("\\'", "'"),
  ),
)
const candidates = new Map()
const hasVietnamese = value => /[À-ỹĐđ]/u.test(value)
const clean = value => value.replace(/\s+/g, ' ').trim()
const intentionalBusinessOrNativeLabels = new Set([
  'Čeština',
  'Español',
  'Français',
  'Português',
  'Tiếng Việt',
  'Türkçe',
  'Русский',
  'العربية',
  'हिन्दी',
  'ไทย',
  'Việt Nam (UTC+07:00)',
  'Công ty ABC',
  'Hành chính',
  'Kế toán',
  'Kỹ thuật',
  'Đợt KK-2026-08 · Văn phòng Hà Nội · 18/08/2026 đến 31/08/2026',
])

function add(value, file, line) {
  const text = clean(value)
  if (!text || !hasVietnamese(text) || translated.has(text) || intentionalBusinessOrNativeLabels.has(text)) return
  const refs = candidates.get(text) || []
  refs.push(`${path.relative(process.cwd(), file)}:${line}`)
  candidates.set(text, refs)
}

for (const file of sourceFiles) {
  const sourceText = fs.readFileSync(file, 'utf8')
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const visit = node => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
    if (ts.isJsxText(node)) add(node.getText(source), file, line)
    if (
      ts.isJsxAttribute(node) &&
      ['placeholder', 'title', 'aria-label'].includes(node.name.getText(source)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    )
      add(node.initializer.text, file, line)
    if (
      ts.isStringLiteral(node) &&
      node.parent &&
      (ts.isJsxExpression(node.parent) ||
        ts.isConditionalExpression(node.parent) ||
        ts.isArrayLiteralExpression(node.parent))
    )
      add(node.text, file, line)
    ts.forEachChild(node, visit)
  }
  visit(source)
}

for (const [text, refs] of [...candidates].sort(([a], [b]) => a.localeCompare(b, 'vi'))) {
  console.log(`${text}\t${refs[0]}`)
}
console.error(`Missing static Vietnamese UI translations: ${candidates.size}`)
process.exitCode = candidates.size ? 1 : 0
