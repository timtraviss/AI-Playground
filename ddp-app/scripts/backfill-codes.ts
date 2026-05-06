import { PrismaClient } from '@prisma/client'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const KNOWLEDGE_DIR = path.resolve(__dirname, '../../server/data/knowledge')
const QUESTION_TYPES = ['SA', 'CL', 'MC', 'PR']

interface SectionRange { workId: string; from: number; to: number }
interface ModuleEntry { id: string; code?: string; sections?: SectionRange[] }

function loadModules(): ModuleEntry[] {
  const p = path.join(KNOWLEDGE_DIR, 'modules.json')
  if (!existsSync(p)) return []
  return JSON.parse(readFileSync(p, 'utf-8'))
}

function getModuleCode(workId: string, sectionNumber: string): string | null {
  const num = parseInt(sectionNumber, 10)
  if (isNaN(num)) return null
  for (const m of loadModules()) {
    if (!m.code || !m.sections) continue
    for (const r of m.sections) {
      if (r.workId === workId && num >= r.from && num <= r.to) return m.code
    }
  }
  return null
}

const prisma = new PrismaClient()

async function nextCode(prisma: PrismaClient, moduleCode: string, type: string): Promise<string> {
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

async function main() {
  const questions = await prisma.question.findMany({
    where: { code: null },
    include: { section: { include: { act: { select: { workId: true } } } } },
    orderBy: { createdAt: 'asc' },
  })

  if (questions.length === 0) {
    console.log('All questions already have codes.')
    return
  }

  console.log(`Found ${questions.length} unnumbered question(s)\n`)

  let updated = 0
  for (const q of questions) {
    let moduleCode: string | null = null

    if (q.section) {
      moduleCode = getModuleCode(q.section.act.workId, q.section.number)
    }

    if (!moduleCode) {
      console.log(`  SKIP  [${q.id}] "${q.name}" — section not mapped to a module`)
      continue
    }

    const code = await nextCode(prisma, moduleCode, q.type)
    await prisma.question.update({ where: { id: q.id }, data: { code } })
    console.log(`  ✓  [${q.id}] "${q.name}" → ${code}`)
    updated++
  }

  console.log(`\nDone: ${updated} updated, ${questions.length - updated} skipped.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
