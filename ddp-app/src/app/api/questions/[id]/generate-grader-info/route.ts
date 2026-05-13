import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { anthropic } from '@/lib/anthropic'
import { buildGenerateGraderInfoPrompt } from '@/lib/prompts/generate-grader-info'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const question = await prisma.question.findUnique({
    where: { id: numId },
    include: { section: true },
  })
  if (!question) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (question.type !== 'SA' && question.type !== 'CL')
    return NextResponse.json({ error: 'Only SA and CL questions are supported' }, { status: 400 })

  const { system, user } = buildGenerateGraderInfoPrompt({
    type: question.type as 'SA' | 'CL',
    questionText: question.questionText,
    sectionText: question.section?.fullText,
  })

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: user }],
  })

  const graderInfo =
    message.content[0].type === 'text' ? message.content[0].text.trim() : ''

  await prisma.question.update({
    where: { id: numId },
    data: { graderInfo },
  })

  return NextResponse.json({ graderInfo })
}
