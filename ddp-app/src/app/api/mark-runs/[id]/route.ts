import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const runId = parseInt(id, 10)
  if (isNaN(runId)) return new Response('Bad request', { status: 400 })

  const run = await prisma.markingRun.findUnique({ where: { id: runId } })
  if (!run) return new Response('Not found', { status: 404 })
  if (run.status !== 'pending_review') {
    return new Response('Run is not pending review', { status: 409 })
  }

  const updated = await prisma.markingRun.update({
    where: { id: runId },
    data: { status: 'confirmed' },
    include: { criteria: true },
  })

  return new Response(JSON.stringify(updated), {
    headers: { 'Content-Type': 'application/json' },
  })
}
