import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCodeForModuleId, nextQuestionCode } from '@/lib/question-code'
import { z } from 'zod'

const ImportItem = z.object({
  name: z.string().min(1).max(200),
  questionText: z.string().min(1),
  type: z.enum(['SA', 'CL', 'MC', 'PR']),
  tag: z.enum(['practice', 'exam']).default('exam'),
  defaultGrade: z.number().positive(),
  moduleId: z.string().optional(),
})

const ImportSchema = z.array(ImportItem).min(1)

export async function POST(req: NextRequest) {
  const parsed = ImportSchema.safeParse(await req.json())
  if (!parsed.success)
    return NextResponse.json({ error: 'Bad request', issues: parsed.error.issues }, { status: 400 })

  const results = []
  for (const item of parsed.data) {
    let code: string | undefined
    if (item.moduleId) {
      const moduleCode = getCodeForModuleId(item.moduleId)
      if (moduleCode) code = await nextQuestionCode(moduleCode, item.type)
    }

    const question = await prisma.question.create({
      data: {
        type: item.type,
        tag: item.tag,
        name: item.name,
        questionText: item.questionText,
        defaultGrade: item.defaultGrade,
        code,
      },
    })
    results.push(question)
  }

  return NextResponse.json(results, { status: 201 })
}
