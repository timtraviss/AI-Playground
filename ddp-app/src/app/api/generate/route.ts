import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { anthropic } from '@/lib/anthropic'
import { buildGenerateShortAnswerPrompt } from '@/lib/prompts/generate-sa'
import { buildGenerateCriminalLiabilityPrompt } from '@/lib/prompts/generate-cl'
import { buildGenerateMultiChoicePrompt } from '@/lib/prompts/generate-mc'
import { buildGeneratePracticalPrompt } from '@/lib/prompts/generate-practical'
import { z } from 'zod'

const BodySchema = z.object({
  sectionId: z.number().int().positive(),
  type: z.enum(['SA', 'CL', 'MC', 'PR']),
  focusNote: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json())
  if (!parsed.success) return new Response('Bad request', { status: 400 })

  const { sectionId, type, focusNote } = parsed.data
  const section = await prisma.section.findUnique({ where: { id: sectionId } })
  if (!section) return new Response('Section not found', { status: 404 })

  const prompt =
    type === 'SA' ? buildGenerateShortAnswerPrompt({ section, focusNote })
    : type === 'CL' ? buildGenerateCriminalLiabilityPrompt({ section, focusNote })
    : type === 'MC' ? buildGenerateMultiChoicePrompt({ section, focusNote })
    : buildGeneratePracticalPrompt({ section, focusNote })

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      try {
        const stream = anthropic.messages.stream({
          model: 'claude-opus-4-7',
          max_tokens: 2048,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
        })

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              enc.encode(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`)
            )
          }
        }

        controller.enqueue(enc.encode('data: [DONE]\n\n'))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: msg })}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
