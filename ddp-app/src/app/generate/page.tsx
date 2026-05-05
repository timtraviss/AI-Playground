'use client'

import { useState } from 'react'
import Link from 'next/link'
import SectionPicker from '@/components/SectionPicker'
import QuestionEditor from '@/components/QuestionEditor'
import { apiUrl } from '@/lib/api'

interface SectionResult {
  id: number
  number: string
  heading: string
  partHeading: string | null
  actShortTitle: string
}

interface DraftQuestion {
  name: string
  questionText: string
  defaultGrade: number
}

type QuestionType = 'SA' | 'CL' | 'MC' | 'PR'

export default function GeneratePage() {
  const [section, setSection] = useState<SectionResult | null>(null)
  const [type, setType] = useState<QuestionType>('SA')
  const [focusNote, setFocusNote] = useState('')

  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [draft, setDraft] = useState<DraftQuestion | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    if (!section) return
    setError(null)
    setDraft(null)
    setStreamText('')
    setStreaming(true)

    try {
      const res = await fetch(apiUrl('/api/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: section.id, type, focusNote: focusNote || undefined }),
      })

      if (!res.ok || !res.body) {
        setError(`Generation failed (${res.status}). Check that ANTHROPIC_API_KEY is set in .env.local.`)
        return
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let accumulated = ''

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') {
            try {
              const parsed = JSON.parse(accumulated)
              // MC has stem+options instead of questionText — normalise before storing
              if (type === 'MC') {
                setDraft({
                  name: parsed.name,
                  questionText: JSON.stringify({ stem: parsed.stem, options: parsed.options }),
                  defaultGrade: parsed.defaultGrade,
                })
              } else {
                setDraft(parsed)
              }
            } catch {
              setError('LLM returned invalid JSON. Try regenerating.')
            }
            break outer
          }
          try {
            const { delta, error: errMsg } = JSON.parse(payload)
            if (errMsg) { setError(errMsg); break outer }
            if (delta) {
              accumulated += delta
              setStreamText(accumulated)
            }
          } catch {
            // skip malformed line
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStreaming(false)
    }
  }

  const canGenerate = !!section && !streaming

  return (
    <main className="max-w-3xl mx-auto p-8">
      <div className="mb-6">
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Dashboard</Link>
        <h1 className="text-2xl font-bold mt-2">Generate question</h1>
      </div>

      <div className="space-y-5">
        {/* Section picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Legislation section
          </label>
          <SectionPicker value={section} onChange={setSection} />
        </div>

        {/* Type selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Question type
          </label>
          <div className="flex gap-2">
            {(
              [
                { t: 'SA', label: 'SA — Short Answer (4 marks)' },
                { t: 'CL', label: 'CL — Criminal Liability (10 marks)' },
                { t: 'MC', label: 'MC — Multi-choice (1 mark)' },
                { t: 'PR', label: 'PR — Practical (10 marks)' },
              ] as const
            ).map(({ t, label }) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  type === t
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-gray-300 hover:border-blue-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Focus note */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Focus note <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            value={focusNote}
            onChange={(e) => setFocusNote(e.target.value)}
            rows={2}
            placeholder="e.g. Focus on evidential sufficiency for the mens rea element"
            className="w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={!canGenerate}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium rounded-lg transition-colors"
        >
          {streaming ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {/* Streaming preview */}
      {streaming && streamText && (
        <div className="mt-8">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Generating…</p>
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 border rounded-lg p-4 font-mono text-gray-600 max-h-60 overflow-auto">
            {streamText}
          </pre>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Question editor */}
      {draft && section && (
        <div className="mt-8">
          <QuestionEditor
            draft={draft}
            section={section}
            type={type}
            onNameChange={(name) => setDraft((d) => d ? { ...d, name } : d)}
            onRegenerate={() => { setDraft(null); generate() }}
          />
        </div>
      )}
    </main>
  )
}
