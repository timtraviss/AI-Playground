import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(['SA', 'CL', 'MC', 'PR']).optional(),
  tag: z.enum(['practice', 'exam']).optional(),
  defaultGrade: z.number().positive().optional(),
  questionText: z.string().min(1).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const parsed = PatchSchema.safeParse(await req.json())
  if (!parsed.success)
    return NextResponse.json({ error: 'Bad request', issues: parsed.error.issues }, { status: 400 })

  try {
    const updated = await prisma.question.update({
      where: { id: numId },
      data: parsed.data,
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = parseInt(id, 10)
  if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  try {
    await prisma.question.delete({ where: { id: numId } })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return new NextResponse(null, { status: 204 })
}
