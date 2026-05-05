'use client'

import { useState } from 'react'
import { apiUrl } from '@/lib/api'

interface CriterionResult {
  id: number
  name: string
  marksAvailable: number
  marksAwarded: number
  band: string
  descriptor: string
  evidence: string
  suggestion: string
}

interface MarkingRun {
  id: number
  totalMark: number
  overallBand: string
  overallFeedback: string
  status: string
  mode: string
  criteria: CriterionResult[]
}

interface MarkingSheetProps {
  run: MarkingRun
  maxMark: number
  onConfirmed?: (updated: MarkingRun) => void
}

const bandColour: Record<string, string> = {
  'Not Achieved': 'bg-red-100 text-red-800',
  'Developing': 'bg-yellow-100 text-yellow-800',
  'Achieved': 'bg-blue-100 text-blue-800',
  'Merit': 'bg-purple-100 text-purple-800',
  'Excellence': 'bg-green-100 text-green-800',
}

function BandBadge({ band }: { band: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${bandColour[band] ?? 'bg-gray-100 text-gray-700'}`}>
      {band}
    </span>
  )
}

export default function MarkingSheet({ run, maxMark, onConfirmed }: MarkingSheetProps) {
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  async function confirm() {
    setConfirming(true)
    setConfirmError(null)
    try {
      const res = await fetch(apiUrl(`/api/mark-runs/${run.id}`), { method: 'PATCH' })
      if (!res.ok) throw new Error(await res.text())
      const updated = await res.json()
      onConfirmed?.(updated)
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : String(err))
    } finally {
      setConfirming(false)
    }
  }

  const pct = Math.round((run.totalMark / maxMark) * 100)

  return (
    <div className="bg-white border rounded-lg p-6 space-y-6">
      {/* Score header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-4xl font-bold text-gray-900">{run.totalMark}</span>
          <span className="text-xl text-gray-400">/{maxMark}</span>
          <span className="ml-2 text-sm text-gray-500">({pct}%)</span>
        </div>
        <div className="text-right space-y-1">
          <BandBadge band={run.overallBand} />
          {run.status === 'pending_review' && (
            <div className="text-xs text-amber-600 font-medium">Draft — not yet confirmed</div>
          )}
          {run.status === 'confirmed' && (
            <div className="text-xs text-green-600 font-medium">Confirmed</div>
          )}
        </div>
      </div>

      {/* Criteria table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 font-medium">Criterion</th>
              <th className="px-3 py-2 font-medium text-center">Marks</th>
              <th className="px-3 py-2 font-medium">Band</th>
              <th className="px-3 py-2 font-medium">Descriptor</th>
              <th className="px-3 py-2 font-medium">Evidence from answer</th>
              <th className="px-3 py-2 font-medium">To improve</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {run.criteria.map((c) => (
              <tr key={c.id} className="align-top">
                <td className="px-3 py-3 font-medium whitespace-nowrap">{c.name}</td>
                <td className="px-3 py-3 text-center whitespace-nowrap">
                  {c.marksAwarded}/{c.marksAvailable}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <BandBadge band={c.band} />
                </td>
                <td className="px-3 py-3 text-gray-600 max-w-xs">{c.descriptor}</td>
                <td className="px-3 py-3 text-gray-600 max-w-xs italic">"{c.evidence}"</td>
                <td className="px-3 py-3 text-gray-600 max-w-xs">{c.suggestion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Overall feedback */}
      <div className="bg-gray-50 border rounded-lg p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">Overall feedback</p>
        <p className="text-sm text-gray-800 leading-relaxed">{run.overallFeedback}</p>
      </div>

      {/* Confirm button for draft mode */}
      {run.status === 'pending_review' && (
        <div className="flex items-center gap-4">
          <button
            onClick={confirm}
            disabled={confirming}
            className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {confirming ? 'Confirming…' : 'Confirm mark'}
          </button>
          <p className="text-xs text-gray-500">
            Review the AI marking above before confirming. Once confirmed the run is locked.
          </p>
          {confirmError && <p className="text-sm text-red-600">{confirmError}</p>}
        </div>
      )}
    </div>
  )
}
