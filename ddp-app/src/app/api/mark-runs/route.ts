import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') ?? undefined

  const runs = await prisma.markingRun.findMany({
    where: status ? { status } : {},
    include: {
      question: {
        include: { section: { select: { number: true, heading: true } } },
      },
      criteria: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(runs)
}
