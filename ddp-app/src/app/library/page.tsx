export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { prisma } from '@/lib/db'
import { getTopicForCode } from '@/lib/question-code'
import LibraryClient from '@/components/LibraryClient'

export default async function LibraryPage() {
  const raw = await prisma.question.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      questionText: true,
      defaultGrade: true,
      createdAt: true,
      section: { select: { number: true, heading: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const questions = raw.map((q) => ({
    ...q,
    createdAt: q.createdAt.toISOString(),
    topic: q.code ? getTopicForCode(q.code) : null,
  }))

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/" className="text-sm text-accent hover:underline">← Dashboard</Link>
        <h1 className="text-2xl font-bold mt-2 text-ink">Question library</h1>
        <p className="text-muted text-sm mt-1">{questions.length} saved question{questions.length !== 1 ? 's' : ''}</p>
      </div>
      <LibraryClient questions={questions} />
    </main>
  )
}
