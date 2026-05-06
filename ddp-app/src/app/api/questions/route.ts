import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const SaveSchema = z.object({
  sectionId: z.number().int().positive().optional(),
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

  const question = await prisma.question.create({ data: parsed.data })
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
