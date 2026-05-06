export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { prisma } from '@/lib/db'
import SectionSearch from '@/components/SectionSearch'
import PendingReviewList from '@/components/PendingReviewList'

export default async function Home() {
  let sectionCount = 0
  let actCount = 0
  let questionCount = 0
  let runCount = 0
  try {
    ;[sectionCount, actCount, questionCount, runCount] = await Promise.all([
      prisma.section.count(),
      prisma.act.count(),
      prisma.question.count(),
      prisma.markingRun.count(),
    ])
  } catch {
    // DB not migrated yet — show zeros
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold mb-1 text-ink">DDP Question Builder & Marker</h1>
      <p className="text-muted mb-8 text-sm">Detective Development Programme</p>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <Stat label="Sections loaded" value={sectionCount} />
        <Stat label="Acts synced" value={actCount} />
        <Stat label="Questions saved" value={questionCount} />
        <Stat label="Marking runs" value={runCount} />
      </div>

      <div className="grid grid-cols-4 gap-4 mb-10">
        <ActionCard href="/generate" label="Generate questions" />
        <ActionCard href="/mark" label="Mark single" />
        <ActionCard href="/mark/bulk" label="Mark bulk" />
        <ActionCard href="/library" label="Question library" />
      </div>

      <PendingReviewList />

      <div className="mt-10">
        <SectionSearch />
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface border border-edge rounded-lg p-5">
      <div className="text-3xl font-bold text-accent">{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  )
}

function ActionCard({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="bg-accent hover:opacity-90 text-white rounded-lg p-5 flex items-center justify-center text-sm font-medium transition-opacity"
    >
      {label}
    </Link>
  )
}
