'use client'

import { useState, useEffect } from 'react'
import { toMarkdown, toPlainText, downloadText } from '@/lib/text-export'
import { apiUrl } from '@/lib/api'

interface SectionRef {
  id: number
  number: string
  heading: string
}

interface DraftQuestion {
  name: string
  questionText: string
  defaultGrade: number
}

interface QuestionEditorProps {
  draft: DraftQuestion
  section: SectionRef | null
  moduleId?: string
  type: 'SA' | 'CL' | 'MC' | 'PR'
  onNameChange: (name: string) => void
  onRegenerate: () => void
}

export default function QuestionEditor({
  draft,
  section,
  moduleId,
  type,
  onNameChange,
  onRegenerate,
}: QuestionEditorProps) {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)

  // Fetch next code on mount — shown as read-only Question ID, does NOT overwrite name
  useEffect(() => {
    const params = new URLSearchParams({ type })
    if (section) params.set('sectionId', String(section.id))
    else if (moduleId) params.set('moduleId', moduleId)
    else return

    fetch(apiUrl(`/api/questions/next-code?${params}`))
      .then((r) => r.json())
      .then(({ code }: { code: string | null }) => { if (code) setGeneratedCode(code) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(apiUrl('/api/questions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId: section?.id,
          moduleId,
          code: generatedCode ?? undefined,
          type,
          name: draft.name,
          questionText: draft.questionText,
          defaultGrade: draft.defaultGrade,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaved(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  function downloadMd() {
    downloadText(
      toMarkdown({
        name: draft.name,
        type,
        questionText: draft.questionText,
        defaultGrade: draft.defaultGrade,
        sectionNumber: section?.number ?? '',
        sectionHeading: section?.heading ?? '',
      }),
      `${(generatedCode ?? draft.name).replace(/\s+/g, '-').toLowerCase()}.md`
    )
  }

  function downloadTxt() {
    downloadText(
      toPlainText({
        name: draft.name,
        type,
        questionText: draft.questionText,
        defaultGrade: draft.defaultGrade,
        sectionNumber: section?.number ?? '',
        sectionHeading: section?.heading ?? '',
      }),
      `${(generatedCode ?? draft.name).replace(/\s+/g, '-').toLowerCase()}.txt`
    )
  }

  const typeLabel: Record<string, string> = {
    SA: 'Short Answer', CL: 'Criminal Liability', MC: 'Multi-choice', PR: 'Practical',
  }

  let mcData: { stem: string; options: { text: string; correct: boolean }[] } | null = null
  if (type === 'MC') {
    try { mcData = JSON.parse(draft.questionText) } catch { /* render as-is */ }
  }

  return (
    <div className="bg-surface border border-edge rounded-lg p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {typeLabel[type]}{section ? ` · s${section.number}` : ''} · {draft.defaultGrade} marks
        </span>
        <button onClick={onRegenerate} className="text-sm text-accent hover:underline">
          Regenerate ↺
        </button>
      </div>

      {/* Question ID (read-only) */}
      {generatedCode && (
        <div>
          <label className="text-xs text-muted uppercase tracking-wide">Question ID</label>
          <p className="mt-1 px-3 py-2 bg-surface2 border border-edge rounded text-sm font-mono text-accent">
            {generatedCode}
          </p>
        </div>
      )}

      {/* Editable name */}
      <div>
        <label className="text-xs text-muted uppercase tracking-wide">Question name</label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onNameChange(e.target.value)}
          className="mt-1 w-full bg-surface2 border border-edge rounded px-3 py-2 text-sm font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {/* Question body */}
      <div>
        <label className="text-xs text-muted uppercase tracking-wide">Question</label>
        {mcData ? (
          <div className="mt-1 p-4 bg-surface2 rounded border border-edge text-sm space-y-3">
            <p className="font-medium text-ink">{mcData.stem}</p>
            <ol className="space-y-1 list-[upper-alpha] list-inside">
              {mcData.options.map((opt, i) => (
                <li key={i} className={opt.correct ? 'text-green-400 font-medium' : 'text-sub'}>
                  {opt.text}
                  {opt.correct && <span className="ml-1 text-xs">(correct)</span>}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div
            className="mt-1 prose prose-sm max-w-none p-4 bg-surface2 rounded border border-edge text-sm text-sub leading-relaxed"
            dangerouslySetInnerHTML={{ __html: draft.questionText }}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={save}
          disabled={saving || saved}
          className="px-4 py-2 bg-accent hover:opacity-90 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors"
        >
          {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save to library'}
        </button>
        <button
          onClick={downloadMd}
          className="px-4 py-2 border border-edge hover:bg-surface2 text-sm text-sub rounded-lg transition-colors"
        >
          Download .md
        </button>
        <button
          onClick={downloadTxt}
          className="px-4 py-2 border border-edge hover:bg-surface2 text-sm text-sub rounded-lg transition-colors"
        >
          Download .txt
        </button>
      </div>

      {saveError && <p className="text-sm text-red-400">{saveError}</p>}
    </div>
  )
}
