import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const acts = await prisma.act.findMany({
    select: { id: true, shortTitle: true },
    orderBy: { shortTitle: 'asc' },
  })
  return NextResponse.json(acts)
}
