'use client'

import { useState } from 'react'
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
  section: SectionRef
  type: 'SA' | 'CL' | 'MC' | 'PR'
  onNameChange: (name: string) => void
  onRegenerate: () => void
}

export default function QuestionEditor({
  draft,
  section,
  type,
  onNameChange,
  onRegenerate,
}: QuestionEditorProps) {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(apiUrl('/api/questions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionId: section.id,
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
        sectionNumber: section.number,
        sectionHeading: section.heading,
      }),
      `${draft.name.replace(/\s+/g, '-').toLowerCase()}.md`
    )
  }

  function downloadTxt() {
    downloadText(
      toPlainText({
        name: draft.name,
        type,
        questionText: draft.questionText,
        defaultGrade: draft.defaultGrade,
        sectionNumber: section.number,
        sectionHeading: section.heading,
      }),
      `${draft.name.replace(/\s+/g, '-').toLowerCase()}.txt`
    )
  }

  const typeLabel: Record<string, string> = {
    SA: 'Short Answer', CL: 'Criminal Liability', MC: 'Multi-choice', PR: 'Practical',
  }

  // MC stores stem+options as JSON in questionText
  let mcData: { stem: string; options: { text: string; correct: boolean }[] } | null = null
  if (type === 'MC') {
    try { mcData = JSON.parse(draft.questionText) } catch { /* render as-is */ }
  }

  return (
    <div className="bg-white border rounded-lg p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
          {typeLabel[type]} · s{section.number} · {draft.defaultGrade} marks
        </span>
        <button
          onClick={onRegenerate}
          className="text-sm text-blue-600 hover:underline"
        >
          Regenerate ↺
        </button>
      </div>

      {/* Editable name */}
      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide">Question name</label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onNameChange(e.target.value)}
          className="mt-1 w-full border rounded px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Question body */}
      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide">Question</label>
        {mcData ? (
          <div className="mt-1 p-4 bg-gray-50 rounded border text-sm space-y-3">
            <p className="font-medium">{mcData.stem}</p>
            <ol className="space-y-1 list-[upper-alpha] list-inside">
              {mcData.options.map((opt, i) => (
                <li key={i} className={opt.correct ? 'text-green-700 font-medium' : ''}>
                  {opt.text}
                  {opt.correct && <span className="ml-1 text-xs">(correct)</span>}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div
            className="mt-1 prose prose-sm max-w-none p-4 bg-gray-50 rounded border text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: draft.questionText }}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={save}
          disabled={saving || saved}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm rounded-lg font-medium transition-colors"
        >
          {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save to library'}
        </button>
        <button
          onClick={downloadMd}
          className="px-4 py-2 border hover:bg-gray-50 text-sm rounded-lg transition-colors"
        >
          Download .md
        </button>
        <button
          onClick={downloadTxt}
          className="px-4 py-2 border hover:bg-gray-50 text-sm rounded-lg transition-colors"
        >
          Download .txt
        </button>
        <button
          disabled
          title="XML export coming in Phase 3"
          className="px-4 py-2 border text-gray-300 text-sm rounded-lg cursor-not-allowed"
        >
          Export XML
        </button>
      </div>

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
    </div>
  )
}
