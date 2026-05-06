import { readFileSync, existsSync } from 'fs'
import path from 'path'

const KNOWLEDGE_DIR = path.resolve(process.cwd(), '../server/data/knowledge')

const PREAMBLE = [
  /using this module/i,
  /table of contents/i,
  /learning objectives/i,
]

export function getModules(): Array<{ id: string; name: string }> {
  const p = path.join(KNOWLEDGE_DIR, 'modules.json')
  if (!existsSync(p)) return []
  const raw = readFileSync(p, 'utf-8')
  const all: Array<{ id: string; name: string }> = JSON.parse(raw)
  return all.map(({ id, name }) => ({ id, name }))
}

export function getModuleSections(id: string): Array<{ title: string; level: 1 | 3 }> {
  const markdown = readModule(id)
  if (!markdown) return []
  const results: Array<{ title: string; level: 1 | 3 }> = []
  for (const line of markdown.split('\n')) {
    const h1 = line.match(/^# (.+)$/)
    const h3 = line.match(/^### (.+)$/)
    if (h1) {
      const title = h1[1].trim()
      if (!PREAMBLE.some((p) => p.test(title))) results.push({ title, level: 1 })
    } else if (h3) {
      results.push({ title: h3[1].trim(), level: 3 })
    }
  }
  return results
}

export function readModule(id: string, sectionTitle?: string): string | null {
  const safeId = id.replace(/[^a-z0-9_-]/gi, '')
  const filePath = path.join(KNOWLEDGE_DIR, `${safeId}.md`)
  if (!existsSync(filePath)) return null
  const markdown = readFileSync(filePath, 'utf-8')
  if (!sectionTitle) return markdown

  // Extract text from the matching H1 or H3 to the next heading of equal/higher level
  const lines = markdown.split('\n')
  let capturing = false
  const out: string[] = []
  for (const line of lines) {
    const h1 = line.match(/^# (.+)$/)
    const h3 = line.match(/^### (.+)$/)
    if (h1) {
      if (h1[1].trim() === sectionTitle) { capturing = true; out.push(line); continue }
      if (capturing) break
    }
    if (h3) {
      if (h3[1].trim() === sectionTitle) { capturing = true; out.push(line); continue }
      if (capturing) break
    }
    if (capturing) out.push(line)
  }
  return out.length > 0 ? out.join('\n') : markdown
}
