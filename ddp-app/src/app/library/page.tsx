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
  SA: 'bg-sky-500/20 text-sky-300',
  CL: 'bg-purple-500/20 text-purple-300',
  MC: 'bg-green-500/20 text-green-300',
  PR: 'bg-amber-500/20 text-amber-300',
}

export default async function LibraryPage() {
  const questions = await prisma.question.findMany({
    include: { section: { select: { number: true, heading: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Link href="/" className="text-sm text-accent hover:underline">← Dashboard</Link>
        <h1 className="text-2xl font-bold mt-2 text-ink">Question library</h1>
        <p className="text-muted text-sm mt-1">{questions.length} saved question{questions.length !== 1 ? 's' : ''}</p>
      </div>

      {questions.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <p>No questions saved yet.</p>
          <Link href="/generate" className="mt-3 inline-block text-accent hover:underline text-sm">
            Generate your first question →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-edge border border-edge rounded-lg bg-surface">
          {questions.map((q) => (
            <li key={q.id} className="px-5 py-4 flex items-start gap-4">
              <span className={`mt-0.5 shrink-0 text-xs font-medium px-2 py-0.5 rounded ${TYPE_COLOR[q.type] ?? 'bg-surface-2 text-sub'}`}>
                {TYPE_LABEL[q.type] ?? q.type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate text-ink font-mono">
                  {q.code && q.code !== q.name
                    ? <><span className="text-accent">{q.code}</span> — {q.name}</>
                    : q.name}
                </p>
                <p className="text-xs text-muted mt-0.5">
                  {q.section ? `s${q.section.number} — ${q.section.heading} · ` : ''}{q.defaultGrade} marks
                </p>
              </div>
              <span className="text-xs text-muted whitespace-nowrap">
                {new Date(q.createdAt).toLocaleDateString('en-NZ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
