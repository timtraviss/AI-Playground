import { NextResponse } from 'next/server'
import { getModules } from '@/lib/knowledge'

export async function GET() {
  return NextResponse.json(getModules())
}
