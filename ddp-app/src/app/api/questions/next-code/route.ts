import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCodeForModuleId, getCodeForSectionId, nextQuestionCode } from '@/lib/question-code'

const QuerySchema = z.object({
  type: z.enum(['SA', 'CL', 'MC', 'PR']),
  sectionId: z.coerce.number().int().positive().optional(),
  moduleId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const { type, sectionId, moduleId } = parsed.data

  let moduleCode: string | null = null
  if (moduleId) {
    moduleCode = getCodeForModuleId(moduleId)
  } else if (sectionId) {
    moduleCode = await getCodeForSectionId(sectionId)
  }

  if (!moduleCode) return NextResponse.json({ code: null })

  const code = await nextQuestionCode(moduleCode, type)
  return NextResponse.json({ code })
}
