import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const select = {
  id: true,
  number: true,
  heading: true,
  partHeading: true,
  act: { select: { shortTitle: true } },
} as const

function format(s: { id: number; number: string; heading: string; partHeading: string | null; act: { shortTitle: string } }) {
  return { id: s.id, number: s.number, heading: s.heading, partHeading: s.partHeading, actShortTitle: s.act.shortTitle }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const section = await prisma.section.findUnique({ where: { id: Number(id) }, select })
    if (!section) return NextResponse.json(null, { status: 404 })
    return NextResponse.json(format(section))
  }

  const q = req.nextUrl.searchParams.get('q') ?? ''
  const sections = await prisma.section.findMany({
    where: q
      ? {
          OR: [
            { number: { contains: q, mode: 'insensitive' } },
            { heading: { contains: q, mode: 'insensitive' } },
            { fullText: { contains: q, mode: 'insensitive' } },
          ],
        }
      : undefined,
    select,
    orderBy: [{ actId: 'asc' }, { number: 'asc' }],
    take: 50,
  })

  return NextResponse.json(sections.map(format))
}
