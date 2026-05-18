import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCodeForSectionId, nextQuestionCode } from '@/lib/question-code'

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!process.env.REINDEX_TOKEN || token !== process.env.REINDEX_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const questions = await prisma.question.findMany({
    where: { code: null },
    include: { section: { include: { act: { select: { workId: true } } } } },
    orderBy: { createdAt: 'asc' },
  })

  const results: { id: number; name: string; code: string | null; status: string }[] = []

  for (const q of questions) {
    let moduleCode: string | null = null
    if (q.sectionId) moduleCode = await getCodeForSectionId(q.sectionId)

    if (!moduleCode) {
      results.push({ id: q.id, name: q.name, code: null, status: 'skipped — section not mapped' })
      continue
    }

    const tags: string[] = (() => { try { return JSON.parse(q.tags) } catch { return [] } })()
    const code = await nextQuestionCode(moduleCode, q.type, tags.includes('practice'))
    await prisma.question.update({ where: { id: q.id }, data: { code } })
    results.push({ id: q.id, name: q.name, code, status: 'updated' })
  }

  const updated = results.filter((r) => r.status === 'updated').length
  return NextResponse.json({ total: questions.length, updated, results })
}
