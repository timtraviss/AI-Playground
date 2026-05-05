'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { apiUrl } from '@/lib/api'

interface QuestionSummary {
  id: number
  name: string
  type: string
  defaultGrade: number
  section: { number: string; heading: string }
}

interface BulkResult {
  fileName: string
  runId: number
  totalMark: number
  maxMark: number
  band: string
  status: string
  error?: string
}

const bandColour: Record<string, string> = {
  'Not Achieved': 'bg-red-100 text-red-800',
  'Developing': 'bg-yellow-100 text-yellow-800',
  'Achieved': 'bg-blue-100 text-blue-800',
  'Merit': 'bg-purple-100 text-purple-800',
  'Excellence': 'bg-green-100 text-green-800',
}

export default function BulkMarkPage() {
  const [questions, setQuestions] = useState<QuestionSummary[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(true)
  const [selectedId, setSelectedId] = useState<number | ''>('')
  const [files, setFiles] = useState<File[]>([])
  const [mode, setMode] = useState<'auto' | 'draft'>('auto')

  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [results, setResults] = useState<BulkResult[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(apiUrl('/api/questions'))
      .then((r) => r.json())
      .then((data) =>
        setQuestions((data as QuestionSummary[]).filter((q) => q.type === 'SA' || q.type === 'CL'))
      )
      .catch(() => setQuestions([]))
      .finally(() => setLoadingQuestions(false))
  }, [])

  const selected = questions.find((q) => q.id === selectedId)

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.name.endsWith('.txt'))
    setFiles(picked)
    setResults([])
  }

  async function markAll() {
    if (!selectedId || files.length === 0) return
    setProcessing(true)
    setResults([])
    setProgress({ current: 0, total: files.length })

    for (const file of files) {
      let result: BulkResult
      try {
        const answerText = await file.text()
        const res = await fetch(apiUrl('/api/mark'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questionId: selectedId, answerText, mode, fileName: file.name }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? res.statusText)
        result = {
          fileName: file.name,
          runId: data.id,
          totalMark: data.totalMark,
          maxMark: selected!.defaultGrade,
          band: data.overallBand,
          status: data.status,
        }
      } catch (err) {
        result = {
          fileName: file.name,
          runId: 0,
          totalMark: 0,
          maxMark: selected?.defaultGrade ?? 0,
          band: '—',
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        }
      }
      setResults((prev) => [...prev, result])
      setProgress((prev) => ({ ...prev, current: prev.current + 1 }))
    }

    setProcessing(false)
  }

  function exportCSV() {
    if (!results.length || !selected) return
    const header = 'File,Question,Mark,Max Mark,Percentage,Band,Status'
    const rows = results.map((r) =>
      [
        `"${r.fileName}"`,
        `"${selected.name}"`,
        r.totalMark,
        r.maxMark,
        r.status === 'error' ? 'error' : `${Math.round((r.totalMark / r.maxMark) * 100)}%`,
        `"${r.band}"`,
        r.status,
      ].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `marking-${selected.name.replace(/\s+/g, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const canMark = !!selectedId && files.length > 0 && !processing
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <main className="max-w-3xl mx-auto p-8">
      <div className="mb-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
        <h1 className="text-2xl font-bold mt-2">Bulk mark</h1>
        <p className="text-sm text-gray-500 mt-1">Mark multiple answer files against the same question.</p>
      </div>

      <div className="space-y-5">
        {/* Question picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
          {loadingQuestions ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : questions.length === 0 ? (
            <p className="text-sm text-gray-500">
              No SA or CL questions saved yet.{' '}
              <Link href="/generate" className="text-blue-600 hover:underline">Generate one first.</Link>
            </p>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                setResults([])
              }}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— select a question —</option>
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  [{q.type} · s{q.section.number} · {q.defaultGrade}m] {q.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* File picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Answer files <span className="font-normal text-gray-400">(.txt, one per trainee)</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            multiple
            onChange={handleFiles}
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {files.length > 0 && (
            <p className="mt-1 text-xs text-gray-400">{files.length} file{files.length !== 1 ? 's' : ''} selected</p>
          )}
        </div>

        {/* Mode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
          <div className="flex gap-2">
            {(['auto', 'draft'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  mode === m ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 hover:border-blue-400'
                }`}
              >
                {m === 'auto' ? 'Auto — confirm immediately' : 'Draft — review before confirming'}
              </button>
            ))}
          </div>
        </div>

        {/* Mark all button */}
        <button
          onClick={markAll}
          disabled={!canMark}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors"
        >
          {processing ? `Marking… (${progress.current}/${progress.total})` : `Mark ${files.length || ''} answer${files.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {/* Progress bar */}
      {processing && (
        <div className="mt-6">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Processing files</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Results — {results.length} of {files.length}</h2>
            {!processing && (
              <button
                onClick={exportCSV}
                className="px-4 py-1.5 border hover:bg-gray-50 text-sm rounded-lg transition-colors"
              >
                Export CSV
              </button>
            )}
          </div>

          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">File</th>
                  <th className="px-4 py-2 text-center font-medium">Mark</th>
                  <th className="px-4 py-2 text-center font-medium">%</th>
                  <th className="px-4 py-2 font-medium">Band</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r, i) => (
                  <tr key={i} className={r.status === 'error' ? 'bg-red-50' : ''}>
                    <td className="px-4 py-2.5 font-mono text-xs truncate max-w-xs">{r.fileName}</td>
                    <td className="px-4 py-2.5 text-center">
                      {r.status === 'error' ? '—' : `${r.totalMark}/${r.maxMark}`}
                    </td>
                    <td className="px-4 py-2.5 text-center text-gray-500">
                      {r.status === 'error' ? '—' : `${Math.round((r.totalMark / r.maxMark) * 100)}%`}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.status === 'error' ? (
                        <span className="text-red-600 text-xs">{r.error}</span>
                      ) : (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${bandColour[r.band] ?? 'bg-gray-100 text-gray-700'}`}>
                          {r.band}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 capitalize">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary stats */}
          {!processing && results.filter((r) => r.status !== 'error').length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              {(() => {
                const valid = results.filter((r) => r.status !== 'error')
                const avg = valid.reduce((s, r) => s + r.totalMark, 0) / valid.length
                const max = Math.max(...valid.map((r) => r.totalMark))
                const min = Math.min(...valid.map((r) => r.totalMark))
                const maxMark = valid[0].maxMark
                return (
                  <>
                    <div className="bg-white border rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-blue-600">{avg.toFixed(1)}</div>
                      <div className="text-xs text-gray-500">avg / {maxMark}</div>
                    </div>
                    <div className="bg-white border rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-green-600">{max}</div>
                      <div className="text-xs text-gray-500">highest</div>
                    </div>
                    <div className="bg-white border rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-red-500">{min}</div>
                      <div className="text-xs text-gray-500">lowest</div>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </main>
  )
}
