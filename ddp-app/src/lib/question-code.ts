import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { prisma } from './db'

const KNOWLEDGE_DIR = path.resolve(process.cwd(), '../server/data/knowledge')

interface SectionRange {
  workId: string
  from: number
  to: number
}

interface ModuleEntry {
  id: string
  code?: string
  sections?: SectionRange[]
}

function loadModules(): ModuleEntry[] {
  const p = path.join(KNOWLEDGE_DIR, 'modules.json')
  if (!existsSync(p)) return []
  return JSON.parse(readFileSync(p, 'utf-8'))
}

export function getCodeForModuleId(moduleId: string): string | null {
  return loadModules().find((m) => m.id === moduleId)?.code ?? null
}

export async function getCodeForSectionId(sectionId: number): Promise<string | null> {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { act: { select: { workId: true } } },
  })
  if (!section) return null

  const num = parseInt(section.number, 10)
  if (isNaN(num)) return null

  for (const m of loadModules()) {
    if (!m.code || !m.sections) continue
    for (const range of m.sections) {
      if (section.act.workId === range.workId && num >= range.from && num <= range.to) {
        return m.code
      }
    }
  }
  return null
}

export async function nextQuestionCode(moduleCode: string, type: string): Promise<string> {
  const prefix = `${moduleCode}${type}`
  const existing = await prisma.question.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  })

  let max = 0
  for (const q of existing) {
    if (!q.code) continue
    const n = parseInt(q.code.slice(prefix.length), 10)
    if (!isNaN(n) && n > max) max = n
  }

  return `${prefix}${String(max + 1).padStart(3, '0')}`
}
