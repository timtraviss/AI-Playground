'use client'

import { useState, useEffect } from 'react'
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

interface Module { id: string; name: string }
interface ModuleSection { title: string; level: 1 | 3 }

type QuestionType = 'SA' | 'CL' | 'MC' | 'PR'
type SourceType = 'legislation' | 'module'

export default function GeneratePage() {
  const [type, setType] = useState<QuestionType>('SA')
  const [sourceType, setSourceType] = useState<SourceType>('legislation')
  const [focusNote, setFocusNote] = useState('')

  // Legislation source
  const [section, setSection] = useState<SectionResult | null>(null)

  // Module source
  const [modules, setModules] = useState<Module[]>([])
  const [moduleId, setModuleId] = useState('')
  const [moduleSections, setModuleSections] = useState<ModuleSection[]>([])
  const [moduleSection, setModuleSection] = useState('')

  useEffect(() => {
    fetch(apiUrl('/api/modules'))
      .then((r) => r.json())
      .then(setModules)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!moduleId) { setModuleSections([]); setModuleSection(''); return }
    fetch(apiUrl(`/api/modules/${moduleId}/sections`))
      .then((r) => r.json())
      .then(setModuleSections)
      .catch(() => setModuleSections([]))
    setModuleSection('')
  }, [moduleId])

  // Pre-load section if ?sectionId= is in the URL (linked from dashboard search)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('sectionId')
    if (!id) return
    fetch(apiUrl(`/api/sections?id=${id}`))
      .then((r) => r.ok ? r.json() : null)
      .then((s) => { if (s) setSection(s) })
      .catch(() => {})
  }, [])

  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [draft, setDraft] = useState<DraftQuestion | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setError(null)
    setDraft(null)
    setStreamText('')
    setStreaming(true)

    try {
      const res = await fetch(apiUrl('/api/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId: sourceType === 'legislation' ? section?.id : undefined,
          type,
          focusNote: focusNote || undefined,
          moduleId: sourceType === 'module' ? moduleId || undefined : undefined,
          moduleName: sourceType === 'module' && moduleId
            ? modules.find((m) => m.id === moduleId)?.name
            : undefined,
          moduleSection: sourceType === 'module' ? moduleSection || undefined : undefined,
        }),
      })

      if (!res.ok || !res.body) {
        setError(`Generation failed (${res.status}). The service may be temporarily unavailable — please try again.`)
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

  const canGenerate = !streaming && (
    (sourceType === 'legislation' && !!section) ||
    (sourceType === 'module' && !!moduleId)
  )

  return (
    <main className="max-w-3xl mx-auto p-8">
      <div className="mb-6">
        <Link href="/" className="text-sm text-accent hover:underline">← Dashboard</Link>
        <h1 className="text-2xl font-bold mt-2 text-ink">Generate question</h1>
      </div>

      <div className="space-y-5">
        {/* Question type */}
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
            Question type
          </label>
          <div className="flex gap-2 flex-wrap">
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
                    ? 'bg-accent border-accent text-white'
                    : 'border-edge text-sub hover:border-accent hover:text-accent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Source toggle */}
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
            Question source
          </label>
          <div className="inline-flex rounded-lg border border-edge overflow-hidden">
            {(['legislation', 'module'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSourceType(s)}
                className={`px-5 py-2 text-sm font-medium transition-colors ${
                  sourceType === s
                    ? 'bg-accent text-white'
                    : 'bg-surface2 text-sub hover:text-ink'
                }`}
              >
                {s === 'legislation' ? 'Legislation' : 'DDP Module'}
              </button>
            ))}
          </div>
        </div>

        {/* Legislation picker */}
        {sourceType === 'legislation' && (
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Legislation section
            </label>
            <SectionPicker value={section} onChange={setSection} />
          </div>
        )}

        {/* Module picker */}
        {sourceType === 'module' && (
          <>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
                DDP module
              </label>
              {modules.length === 0 ? (
                <p className="text-sm text-muted">No modules available.</p>
              ) : (
                <select
                  value={moduleId}
                  onChange={(e) => setModuleId(e.target.value)}
                  className="w-full bg-surface2 border border-edge rounded-lg px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">— Select a module —</option>
                  {modules.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              )}
            </div>

            {moduleId && moduleSections.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
                  Module section <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <select
                  value={moduleSection}
                  onChange={(e) => setModuleSection(e.target.value)}
                  className="w-full bg-surface2 border border-edge rounded-lg px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">— Entire module —</option>
                  {moduleSections.map((s) => (
                    <option key={s.title} value={s.title}>
                      {s.level === 3 ? `↳ ${s.title}` : s.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {/* Focus note */}
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
            Focus note <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            value={focusNote}
            onChange={(e) => setFocusNote(e.target.value)}
            rows={2}
            placeholder="e.g. Focus on evidential sufficiency for the mens rea element"
            className="w-full bg-surface2 border border-edge rounded-lg px-4 py-2 text-sm text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none"
          />
        </div>

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={!canGenerate}
          className="w-full py-3 bg-accent hover:opacity-90 disabled:opacity-40 text-white font-medium rounded-lg transition-colors"
        >
          {streaming ? 'Generating…' : 'Generate'}
        </button>
      </div>

      {/* Streaming preview */}
      {streaming && streamText && (
        <div className="mt-8">
          <p className="text-xs text-muted mb-2 uppercase tracking-wide">Generating…</p>
          <pre className="whitespace-pre-wrap text-sm bg-gray-50 border rounded-lg p-4 font-mono text-gray-600 max-h-60 overflow-auto">
            {streamText}
          </pre>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Question editor — pass null section when module-only */}
      {draft && (
        <div className="mt-8">
          <QuestionEditor
            draft={draft}
            section={sourceType === 'legislation' ? section : null}
            moduleId={sourceType === 'module' ? moduleId : undefined}
            type={type}
            onNameChange={(name) => setDraft((d) => d ? { ...d, name } : d)}
            onRegenerate={() => { setDraft(null); generate() }}
          />
        </div>
      )}
    </main>
  )
}
