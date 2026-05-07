import { NextResponse } from 'next/server'
import { getAllTopicModules } from '@/lib/question-code'

export async function GET() {
  return NextResponse.json(getAllTopicModules())
}
