export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { prisma } from '@/lib/db'

const TYPE_LABEL: Record<string, string> = {
  SA: 'Short Answer',
  CL: 'Criminal Liability',
  MC: 'Multi-choice',
  PR: 'Practical',
}

const TYPE_COLOR: Record<string, string> = {
  SA: 'bg-blue-100 text-blue-700',
  CL: 'bg-purple-100 text-purple-700',
  MC: 'bg-green-100 text-green-700',
  PR: 'bg-orange-100 text-orange-700',
}

export default async function LibraryPage() {
  const questions = await prisma.question.findMany({
    include: { section: { select: { number: true, heading: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <main className="max-w-4xl mx-auto p-8">
      <div className="mb-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
        <h1 className="text-2xl font-bold mt-2">Question library</h1>
        <p className="text-gray-500 text-sm mt-1">{questions.length} saved question{questions.length !== 1 ? 's' : ''}</p>
      </div>

      {questions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p>No questions saved yet.</p>
          <Link href="/generate" className="mt-3 inline-block text-blue-600 hover:underline text-sm">
            Generate your first question →
          </Link>
        </div>
      ) : (
        <ul className="divide-y border rounded-lg bg-white">
          {questions.map((q) => (
            <li key={q.id} className="px-5 py-4 flex items-start gap-4">
              <span
                className={`mt-0.5 shrink-0 text-xs font-medium px-2 py-0.5 rounded ${TYPE_COLOR[q.type] ?? 'bg-gray-100 text-gray-600'}`}
              >
                {q.type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{q.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  s{q.section.number} — {q.section.heading} · {q.defaultGrade} marks
                </p>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {new Date(q.createdAt).toLocaleDateString('en-NZ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
