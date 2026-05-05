'use client'

import { useState, useEffect } from 'react'
import { apiUrl } from '@/lib/api'

interface PendingRun {
  id: number
  totalMark: number
  overallBand: string
  overallFeedback: string
  mode: string
  status: string
  createdAt: string
  fileName: string | null
  question: {
    id: number
    name: string
    type: string
    defaultGrade: number
    section: { number: string; heading: string }
  }
}

const bandColour: Record<string, string> = {
  'Not Achieved': 'bg-red-500/20 text-red-300',
  'Developing': 'bg-amber-500/20 text-amber-300',
  'Achieved': 'bg-blue-100 text-blue-800',
  'Merit': 'bg-purple-100 text-purple-800',
  'Excellence': 'bg-green-500/20 text-green-300',
}

export default function PendingReviewList() {
  const [runs, setRuns] = useState<PendingRun[]>([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState<number | null>(null)

  useEffect(() => {
    fetch(apiUrl('/api/mark-runs?status=pending_review'))
      .then((r) => r.json())
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false))
  }, [])

  async function confirm(id: number) {
    setConfirming(id)
    try {
      const res = await fetch(apiUrl(`/api/mark-runs/${id}`), { method: 'PATCH' })
      if (!res.ok) throw new Error(await res.text())
      setRuns((prev) => prev.filter((r) => r.id !== id))
    } finally {
      setConfirming(null)
    }
  }

  if (loading) return null
  if (runs.length === 0) return null

  return (
    <div className="mt-10">
      <h2 className="text-lg font-semibold mb-3 text-ink flex items-center gap-2">
        Pending review
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
          {runs.length}
        </span>
      </h2>
      <div className="bg-surface border border-edge rounded-lg divide-y">
        {runs.map((run) => (
          <div key={run.id} className="px-5 py-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate text-ink">{run.question.name}</span>
                <span className="text-xs text-muted uppercase">{run.question.type}</span>
                <span className="text-xs text-muted">s{run.question.section.number}</span>
              </div>
              {run.fileName && (
                <p className="text-xs text-muted mt-0.5">{run.fileName}</p>
              )}
              <p className="text-xs text-muted mt-1 line-clamp-2">{run.overallFeedback}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <div className="text-sm font-semibold text-ink">
                  {run.totalMark}/{run.question.defaultGrade}
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${bandColour[run.overallBand] ?? 'bg-surface2 text-sub'}`}>
                  {run.overallBand}
                </span>
              </div>
              <button
                onClick={() => confirm(run.id)}
                disabled={confirming === run.id}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {confirming === run.id ? '…' : 'Confirm'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
