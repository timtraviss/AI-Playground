import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCodeForModuleId, getCodeForSectionId, nextQuestionCode } from '@/lib/question-code'
import { z } from 'zod'

const SaveSchema = z.object({
  sectionId: z.number().int().positive().optional(),
  moduleId: z.string().optional(),
  code: z.string().optional(),
  type: z.enum(['SA', 'CL', 'MC', 'PR']),
  name: z.string().min(1).max(200),
  questionText: z.string().min(1),
  defaultGrade: z.number().positive(),
  focusNote: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const parsed = SaveSchema.safeParse(await req.json())
  if (!parsed.success)
    return NextResponse.json({ error: 'Bad request', issues: parsed.error.issues }, { status: 400 })

  const { sectionId, moduleId, code: clientCode, type, name, questionText, defaultGrade, focusNote } = parsed.data

  // Use client-provided code if given (avoids sequence race); otherwise generate
  let code: string | undefined = clientCode
  if (!code) {
    let moduleCode: string | null = null
    if (moduleId) moduleCode = getCodeForModuleId(moduleId)
    else if (sectionId) moduleCode = await getCodeForSectionId(sectionId)
    if (moduleCode) code = await nextQuestionCode(moduleCode, type)
  }

  const question = await prisma.question.create({
    data: { sectionId, type, code, name, questionText, defaultGrade, focusNote },
  })

  return NextResponse.json(question, { status: 201 })
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? undefined
  const sectionIdStr = req.nextUrl.searchParams.get('sectionId')
  const sectionId = sectionIdStr ? parseInt(sectionIdStr) : undefined

  const questions = await prisma.question.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(sectionId ? { sectionId } : {}),
    },
    include: { section: { select: { number: true, heading: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(questions)
}
