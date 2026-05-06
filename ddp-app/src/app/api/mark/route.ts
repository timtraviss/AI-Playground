import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { anthropic } from '@/lib/anthropic'
import { buildMarkShortAnswerPrompt } from '@/lib/prompts/mark-sa'
import { buildMarkCriminalLiabilityPrompt } from '@/lib/prompts/mark-cl'
import { ShortAnswerMarkingZ, CriminalLiabilityMarkingZ } from '@/lib/schemas'
import { z } from 'zod'

const BodySchema = z.object({
  questionId: z.number().int().positive(),
  answerText: z.string().min(1),
  mode: z.enum(['auto', 'draft']),
  fileName: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json())
  if (!parsed.success) return new Response('Bad request', { status: 400 })

  const { questionId, answerText, mode, fileName } = parsed.data

  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { section: true },
  })
  if (!question) return new Response('Question not found', { status: 404 })

  if (question.type !== 'SA' && question.type !== 'CL') {
    return new Response('Marking only supported for SA and CL question types', { status: 400 })
  }

  const promptInput = {
    questionText: question.questionText,
    sectionFullText: question.section?.fullText ?? '',
    sectionNumber: question.section?.number ?? '',
    sectionHeading: question.section?.heading ?? '',
    answerText,
  }

  const prompt =
    question.type === 'SA'
      ? buildMarkShortAnswerPrompt(promptInput)
      : buildMarkCriminalLiabilityPrompt(promptInput)

  let rawJson: string
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    })
    const block = msg.content[0]
    if (block.type !== 'text') throw new Error('Unexpected response type from LLM')
    rawJson = block.text.trim()
    // Strip markdown fences if present
    rawJson = rawJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }

  let marking: z.infer<typeof ShortAnswerMarkingZ> | z.infer<typeof CriminalLiabilityMarkingZ>
  try {
    const raw = JSON.parse(rawJson)
    const schema = question.type === 'SA' ? ShortAnswerMarkingZ : CriminalLiabilityMarkingZ
    marking = schema.parse(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: `LLM returned invalid JSON: ${msg}`, raw: rawJson }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const run = await prisma.markingRun.create({
    data: {
      questionId,
      answerText,
      fileName: fileName ?? null,
      totalMark: marking.totalMark,
      overallBand: marking.overallBand,
      overallFeedback: marking.overallFeedback,
      mode,
      status: mode === 'auto' ? 'confirmed' : 'pending_review',
      criteria: {
        create: marking.criteria.map((c) => ({
          name: c.name,
          marksAvailable: c.marksAvailable,
          marksAwarded: c.marksAwarded,
          band: c.band,
          descriptor: c.descriptor,
          evidence: c.evidence,
          suggestion: c.suggestion,
        })),
      },
    },
    include: { criteria: true },
  })

  return new Response(JSON.stringify(run), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })
}
