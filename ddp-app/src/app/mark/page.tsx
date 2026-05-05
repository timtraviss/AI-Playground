'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import MarkingSheet from '@/components/MarkingSheet'
import { apiUrl } from '@/lib/api'

interface QuestionSummary {
  id: number
  name: string
  type: string
  defaultGrade: number
  section: { number: string; heading: string }
}

interface MarkingRun {
  id: number
  totalMark: number
  overallBand: string
  overallFeedback: string
  status: string
  mode: string
  criteria: {
    id: number
    name: string
    marksAvailable: number
    marksAwarded: number
    band: string
    descriptor: string
    evidence: string
    suggestion: string
  }[]
}

const TYPE_LABEL: Record<string, string> = {
  SA: 'SA', CL: 'CL', MC: 'MC', PR: 'PR',
}

export default function MarkPage() {
  const [questions, setQuestions] = useState<QuestionSummary[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(true)

  const [selectedId, setSelectedId] = useState<number | ''>('')
  const [answerText, setAnswerText] = useState('')
  const [mode, setMode] = useState<'auto' | 'draft'>('auto')

  const [marking, setMarking] = useState(false)
  const [markingRun, setMarkingRun] = useState<MarkingRun | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(apiUrl('/api/questions'))
      .then((r) => r.json())
      .then((data) => {
        // Only SA and CL are markable
        setQuestions((data as QuestionSummary[]).filter((q) => q.type === 'SA' || q.type === 'CL'))
      })
      .catch(() => setQuestions([]))
      .finally(() => setLoadingQuestions(false))
  }, [])

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setAnswerText(ev.target?.result as string ?? '')
    reader.readAsText(file)
  }

  async function mark() {
    if (!selectedId || !answerText.trim()) return
    setError(null)
    setMarkingRun(null)
    setMarking(true)
    try {
      const res = await fetch(apiUrl('/api/mark'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: selectedId,
          answerText: answerText.trim(),
          mode,
          fileName: fileInputRef.current?.files?.[0]?.name,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? res.statusText)
      setMarkingRun(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setMarking(false)
    }
  }

  const selected = questions.find((q) => q.id === selectedId)
  const canMark = !!selectedId && !!answerText.trim() && !marking

  return (
    <main className="max-w-3xl mx-auto p-8">
      <div className="mb-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
        <h1 className="text-2xl font-bold mt-2">Mark answer</h1>
      </div>

      <div className="space-y-5">
        {/* Question picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Question
          </label>
          {loadingQuestions ? (
            <p className="text-sm text-gray-400">Loading questions…</p>
          ) : questions.length === 0 ? (
            <p className="text-sm text-gray-500">
              No SA or CL questions in the library yet.{' '}
              <Link href="/generate" className="text-blue-600 hover:underline">Generate one first.</Link>
            </p>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                setMarkingRun(null)
                setError(null)
              }}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— select a question —</option>
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  [{TYPE_LABEL[q.type]} · s{q.section.number} · {q.defaultGrade}m] {q.name}
                </option>
              ))}
            </select>
          )}
          {selected && (
            <p className="mt-1 text-xs text-gray-400">
              s{selected.section.number} — {selected.section.heading}
            </p>
          )}
        </div>

        {/* Answer input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">Trainee answer</label>
            <label className="text-sm text-blue-600 hover:underline cursor-pointer">
              Upload .txt
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>
          <textarea
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            rows={8}
            placeholder="Paste the trainee's answer here, or upload a .txt file above…"
            className="w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
          {answerText && (
            <p className="text-xs text-gray-400 mt-1">{answerText.trim().split(/\s+/).length} words</p>
          )}
        </div>

        {/* Mode toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
          <div className="flex gap-2">
            {(['auto', 'draft'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  mode === m
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-gray-300 hover:border-blue-400'
                }`}
              >
                {m === 'auto' ? 'Auto — confirm immediately' : 'Draft — review before confirming'}
              </button>
            ))}
          </div>
        </div>

        {/* Mark button */}
        <button
          onClick={mark}
          disabled={!canMark}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors"
        >
          {marking ? 'Marking…' : 'Mark'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Marking sheet */}
      {markingRun && selected && (
        <div className="mt-8">
          <MarkingSheet
            run={markingRun}
            maxMark={selected.defaultGrade}
            onConfirmed={(updated) => setMarkingRun(updated)}
          />
        </div>
      )}
    </main>
  )
}
