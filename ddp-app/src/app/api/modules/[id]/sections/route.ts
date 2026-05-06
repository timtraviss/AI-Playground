import { NextRequest, NextResponse } from 'next/server'
import { getModuleSections } from '@/lib/knowledge'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return NextResponse.json(getModuleSections(id))
}
