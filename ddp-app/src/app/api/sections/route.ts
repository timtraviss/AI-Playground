import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''

  const sections = await prisma.section.findMany({
    where: q
      ? {
          OR: [
            { number: { contains: q } },
            { heading: { contains: q } },
            { fullText: { contains: q } },
          ],
        }
      : undefined,
    select: {
      id: true,
      number: true,
      heading: true,
      partHeading: true,
      act: { select: { shortTitle: true } },
    },
    orderBy: [{ actId: 'asc' }, { number: 'asc' }],
    take: 50,
  })

  return NextResponse.json(
    sections.map((s) => ({
      id: s.id,
      number: s.number,
      heading: s.heading,
      partHeading: s.partHeading,
      actShortTitle: s.act.shortTitle,
    }))
  )
}
