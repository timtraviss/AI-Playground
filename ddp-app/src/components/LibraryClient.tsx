'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toBulkMarkdown, toTotaraXml, downloadAs, type ExportQuestion } from '@/lib/export'
import { apiUrl } from '@/lib/api'

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

const TAG_COLOR: Record<string, string> = {
  exam:     'bg-green-500/20 text-green-300',
  practice: 'bg-amber-500/20 text-amber-300',
  DDP:      'bg-sky-500/20 text-sky-300',
  DMP:      'bg-purple-500/20 text-purple-300',
}

const ALL_TAGS = ['exam', 'practice', 'DDP', 'DMP'] as const
type Tag = typeof ALL_TAGS[number]

interface ImportRow {
  name: string
  questionText: string
  defaultGrade: number
  type: 'SA' | 'CL' | 'MC' | 'PR'
}

interface LibraryClientProps {
  questions: ExportQuestion[]
  modules: Array<{ id: string; name: string; code: string | null }>
}

function MCDisplay({ questionText }: { questionText: string }) {
  let data: { stem: string; options: { text: string; correct: boolean }[] } | null = null
  try { data = JSON.parse(questionText) } catch { /* fall through */ }
  if (!data) return <p className="text-sm text-sub whitespace-pre-wrap">{questionText}</p>
  return (
    <div className="space-y-3">
      <p className="font-medium text-ink text-sm">{data.stem}</p>
      <ol className="space-y-2 list-[upper-alpha] list-inside text-sm">
        {data.options.map((opt, i) => (
          <li key={i} className={opt.correct ? 'text-green-400 font-medium' : 'text-sub'}>
            {opt.text}
            {opt.correct && <span className="ml-1 text-xs opacity-70">(correct)</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

export default function LibraryClient({ questions: initialQuestions, modules }: LibraryClientProps) {
  const router = useRouter()
  const [questions, setQuestions] = useState(initialQuestions)
  const [typeFilter, setTypeFilter] = useState('')
  const [topicFilter, setTopicFilter] = useState('')
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [panelId, setPanelId] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editValues, setEditValues] = useState<{ name: string; type: string; tags: string[]; defaultGrade: number; questionText: string; graderInfo: string } | null>(null)
  const [graderInfoOpen, setGraderInfoOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tagging, setTagging] = useState(false)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Topic modules for code assignment
  const [topicModules, setTopicModules] = useState<Array<{ id: string; name: string; code: string; topic: string }>>([])
  const [editTopicModuleId, setEditTopicModuleId] = useState<string>('')
  const [editNextCode, setEditNextCode] = useState<string | null>(null)
  const [fetchingCode, setFetchingCode] = useState(false)

  // Bulk topic assignment
  const [bulkTopicOpen, setBulkTopicOpen] = useState(false)
  const [bulkTopicModuleId, setBulkTopicModuleId] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [bulkAssignDone, setBulkAssignDone] = useState(0)

  // Bulk grader info generation
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkGenerateDone, setBulkGenerateDone] = useState(0)
  const [bulkGenerateTotal, setBulkGenerateTotal] = useState(0)

  // Import state
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importModuleId, setImportModuleId] = useState('')
  const [importTags, setImportTags] = useState<string[]>(['exam'])
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)

  // Sync local state when server refreshes props after router.refresh()
  useEffect(() => {
    setQuestions(initialQuestions)
  }, [initialQuestions])

  useEffect(() => {
    fetch(apiUrl('/api/questions/topics'))
      .then((r) => r.json())
      .then(setTopicModules)
      .catch(() => {})
  }, [])

  const types = [...new Set(questions.map((q) => q.type))].sort()
  const topics = [...new Set(questions.map((q) => q.topic).filter((t): t is string => !!t))].sort()

  const filtered = questions.filter((q) => {
    if (typeFilter && q.type !== typeFilter) return false
    if (topicFilter && q.topic !== topicFilter) return false
    if (tagFilters.length > 0 && !tagFilters.some((f) => q.tags.includes(f))) return false
    return true
  })

  const allChecked = filtered.length > 0 && filtered.every((q) => selected.has(q.id))
  const someChecked = filtered.some((q) => selected.has(q.id))

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someChecked && !allChecked
    }
  }, [someChecked, allChecked])

  useEffect(() => {
    setDeleteConfirm(false)
    setEditMode(false)
    setEditValues(null)
    setEditTopicModuleId('')
    setEditNextCode(null)
    setGraderInfoOpen(false)
  }, [panelId])

  function toggleAll() {
    setSelected((s) => {
      const n = new Set(s)
      if (allChecked) filtered.forEach((q) => n.delete(q.id))
      else filtered.forEach((q) => n.add(q.id))
      return n
    })
  }

  function toggleOne(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const selectedQuestions = questions.filter((q) => selected.has(q.id))
  const panelQuestion = panelId != null ? questions.find((q) => q.id === panelId) ?? null : null

  function exportFilename(ext: string): string | null {
    if (selectedQuestions.length === 1) {
      const q = selectedQuestions[0]
      const base = (q.code ?? q.name).replace(/[/\\?%*:|"<>]/g, '-')
      return `${base}.${ext}`
    }
    const input = window.prompt('Export filename:', 'questions')
    if (input === null) return null
    return `${input.trim() || 'questions'}.${ext}`
  }

  function exportMd() {
    const filename = exportFilename('md')
    if (!filename) return
    downloadAs(toBulkMarkdown(selectedQuestions), filename, 'text/markdown')
  }

  function exportXml() {
    const filename = exportFilename('xml')
    if (!filename) return
    downloadAs(toTotaraXml(selectedQuestions), filename, 'application/xml')
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: '2-digit' })
  }

  // ── Tag quick-toggle ─────────────────────────────────────────────────────────

  async function handleTagToggle(t: Tag) {
    if (!panelQuestion) return
    const current = panelQuestion.tags
    const next = current.includes(t) ? current.filter((x) => x !== t) : [...current, t]
    // Optimistic update — reflect change immediately, roll back on failure
    setQuestions((prev) => prev.map((q) =>
      q.id === panelQuestion.id ? { ...q, tags: next } : q
    ))
    setTagging(true)
    try {
      const res = await fetch(apiUrl(`/api/questions/${panelQuestion.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: next }),
      })
      if (!res.ok) {
        setQuestions((prev) => prev.map((q) =>
          q.id === panelQuestion.id ? { ...q, tags: current } : q
        ))
      }
    } catch {
      setQuestions((prev) => prev.map((q) =>
        q.id === panelQuestion.id ? { ...q, tags: current } : q
      ))
    } finally {
      setTagging(false)
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!panelQuestion) return
    if (!deleteConfirm) { setDeleteConfirm(true); return }

    setDeleting(true)
    try {
      await fetch(apiUrl(`/api/questions/${panelQuestion.id}`), { method: 'DELETE' })
      setQuestions((prev) => prev.filter((q) => q.id !== panelQuestion.id))
      setSelected((prev) => { const n = new Set(prev); n.delete(panelQuestion.id); return n })
      setPanelId(null)
    } finally {
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────

  function startEdit() {
    if (!panelQuestion) return
    setEditValues({
      name: panelQuestion.name,
      type: panelQuestion.type,
      tags: panelQuestion.tags,
      defaultGrade: panelQuestion.defaultGrade,
      questionText: panelQuestion.questionText,
      graderInfo: panelQuestion.graderInfo ?? '',
    })
    // Pre-select topic from existing code
    if (panelQuestion.code && topicModules.length > 0) {
      const matched = topicModules.find((m) => panelQuestion.code!.startsWith(m.code))
      setEditTopicModuleId(matched?.id ?? '')
    } else {
      setEditTopicModuleId('')
    }
    setEditNextCode(panelQuestion.code ?? null)
    setEditMode(true)
  }

  function cancelEdit() {
    setEditMode(false)
    setEditValues(null)
    setEditTopicModuleId('')
    setEditNextCode(null)
  }

  async function handleEditTopicChange(newModuleId: string) {
    setEditTopicModuleId(newModuleId)
    if (!newModuleId) { setEditNextCode(null); return }
    const type = editValues?.type ?? panelQuestion?.type ?? 'SA'
    setFetchingCode(true)
    try {
      const params = new URLSearchParams({ type, moduleId: newModuleId })
      const r = await fetch(apiUrl(`/api/questions/next-code?${params}`))
      const { code } = await r.json()
      setEditNextCode(code ?? null)
    } finally {
      setFetchingCode(false)
    }
  }

  async function handleSave() {
    if (!panelQuestion || !editValues) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = { ...editValues }
      // Include new code only if it differs from the current one
      if (editNextCode && editNextCode !== panelQuestion.code) {
        body.code = editNextCode
      }
      const res = await fetch(apiUrl(`/api/questions/${panelQuestion.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const updated = await res.json()
        const newCode: string | null = updated.code ?? panelQuestion.code ?? null
        const newTopic = newCode
          ? (topicModules.find((m) => newCode.startsWith(m.code))?.topic ?? null)
          : null
        setQuestions((prev) => prev.map((q) =>
          q.id === panelQuestion.id
            ? {
                ...q,
                name: updated.name,
                type: updated.type,
                // server returns tags as a JSON string; use local edit array to stay parsed
                tags: editValues?.tags ?? q.tags,
                defaultGrade: updated.defaultGrade,
                questionText: updated.questionText,
                graderInfo: editValues?.graderInfo ?? q.graderInfo,
                code: newCode,
                topic: newTopic,
              }
            : q
        ))
        setEditMode(false)
        setEditValues(null)
        setEditTopicModuleId('')
        setEditNextCode(null)
      }
    } finally {
      setSaving(false)
    }
  }

  // ── XML Import ───────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, 'text/xml')
      const rows: ImportRow[] = []

      doc.querySelectorAll('question[type="essay"]').forEach((q) => {
        const name = q.querySelector('name text')?.textContent?.trim() ?? ''
        const questionText = q.querySelector('questiontext text')?.textContent?.trim() ?? ''
        const grade = parseFloat(q.querySelector('defaultgrade')?.textContent ?? '0')
        if (!name || !questionText) return
        const type = grade <= 1 ? 'MC' : grade <= 4 ? 'SA' : 'CL'
        rows.push({ name, questionText, defaultGrade: grade, type })
      })

      doc.querySelectorAll('question[type="multichoice"]').forEach((q) => {
        const name = q.querySelector('name text')?.textContent?.trim() ?? ''
        const stem = q.querySelector('questiontext text')?.textContent?.trim() ?? ''
        const grade = parseFloat(q.querySelector('defaultgrade')?.textContent ?? '1')
        if (!name || !stem) return
        const options = Array.from(q.querySelectorAll('answer')).map((a) => ({
          text: a.querySelector('text')?.textContent?.trim() ?? '',
          correct: a.getAttribute('fraction') === '100',
        })).filter((o) => o.text)
        if (options.length === 0) return
        const questionText = JSON.stringify({ stem, options })
        rows.push({ name, questionText, defaultGrade: grade, type: 'MC' })
      })

      setImportRows(rows)
      setImportOpen(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function setRowType(i: number, type: 'SA' | 'CL' | 'MC' | 'PR') {
    setImportRows((prev) => prev.map((r, idx) => idx === i ? { ...r, type } : r))
  }

  async function doImport() {
    setImporting(true)
    try {
      const body = importRows.map((r) => ({
        name: r.name,
        questionText: r.questionText,
        type: r.type,
        tags: importTags,
        defaultGrade: r.defaultGrade,
        moduleId: importModuleId || undefined,
      }))
      const res = await fetch(apiUrl('/api/questions/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setImportOpen(false)
        setImportRows([])
        setImportModuleId('')
        setImportTags(['exam'])
        router.refresh()
      }
    } finally {
      setImporting(false)
    }
  }

  function closeImport() {
    if (importing) return
    setImportOpen(false)
    setImportRows([])
    setImportModuleId('')
    setImportTags(['exam'])
  }

  // ── Bulk topic assign ────────────────────────────────────────────────────────

  async function doBulkAssign() {
    if (!bulkTopicModuleId || bulkAssigning) return
    setBulkAssigning(true)
    setBulkAssignDone(0)

    const toAssign = [...selected]
      .map((id) => questions.find((q) => q.id === id))
      .filter((q): q is NonNullable<typeof q> => !!q)

    for (const q of toAssign) {
      try {
        const params = new URLSearchParams({ type: q.type, moduleId: bulkTopicModuleId })
        const codeRes = await fetch(apiUrl(`/api/questions/next-code?${params}`))
        const { code } = await codeRes.json()
        if (!code) continue

        await fetch(apiUrl(`/api/questions/${q.id}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })

        const newTopic = topicModules.find((m) => code.startsWith(m.code))?.topic ?? null
        setQuestions((prev) =>
          prev.map((pq) => (pq.id === q.id ? { ...pq, code, topic: newTopic } : pq))
        )
        setBulkAssignDone((n) => n + 1)
      } catch {
        // skip failed question, continue with rest
      }
    }

    setBulkAssigning(false)
    setBulkTopicOpen(false)
    setBulkTopicModuleId('')
  }

  async function doGenerateGraderInfo() {
    if (bulkGenerating) return
    const toGenerate = [...selected]
      .map((id) => questions.find((q) => q.id === id))
      .filter((q): q is NonNullable<typeof q> => !!q && (q.type === 'SA' || q.type === 'CL'))

    if (toGenerate.length === 0) return
    setBulkGenerating(true)
    setBulkGenerateDone(0)
    setBulkGenerateTotal(toGenerate.length)

    for (const q of toGenerate) {
      try {
        const res = await fetch(apiUrl(`/api/questions/${q.id}/generate-grader-info`), {
          method: 'POST',
        })
        if (!res.ok) continue
        const { graderInfo } = await res.json()
        setQuestions((prev) =>
          prev.map((pq) => (pq.id === q.id ? { ...pq, graderInfo } : pq))
        )
      } catch {
        // skip failed question, continue
      }
      setBulkGenerateDone((n) => n + 1)
    }

    setBulkGenerating(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-surface2 border border-edge rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}
        </select>
        <select
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          className="bg-surface2 border border-edge rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">All topics</option>
          {topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          {ALL_TAGS.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilters((prev) =>
                prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
              )}
              className={`text-xs font-medium px-3 py-1.5 rounded-full capitalize transition-colors ${
                tagFilters.includes(t) ? TAG_COLOR[t] : 'bg-surface2 text-muted hover:text-ink'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted">
          {filtered.length} question{filtered.length !== 1 ? 's' : ''}
          {(typeFilter || topicFilter || tagFilters.length > 0) ? ' (filtered)' : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 border border-edge hover:bg-surface2 text-sm text-sub rounded-lg transition-colors"
          >
            Import XML
          </button>
          <input ref={fileInputRef} type="file" accept=".xml" className="hidden" onChange={handleFileChange} />
        </div>
      </div>

      {/* Export toolbar */}
      {selected.size > 0 && (
        <div className="flex flex-col gap-2 mb-4 px-4 py-3 bg-accent/10 border border-accent/30 rounded-lg">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-ink">{selected.size} selected</span>
            <button onClick={exportMd} className="px-3 py-1.5 bg-accent hover:opacity-90 text-white text-sm rounded-lg font-medium transition-colors">
              Export .md
            </button>
            <button onClick={exportXml} className="px-3 py-1.5 bg-accent hover:opacity-90 text-white text-sm rounded-lg font-medium transition-colors">
              Export XML (Totara)
            </button>
            {topicModules.length > 0 && (
              <button
                onClick={() => { setBulkTopicOpen((v) => !v); setBulkTopicModuleId('') }}
                className="px-3 py-1.5 border border-accent/50 hover:bg-accent/10 text-sm text-accent rounded-lg font-medium transition-colors"
              >
                Assign topic
              </button>
            )}
            {(() => {
              const saClCount = [...selected]
                .map((id) => questions.find((q) => q.id === id))
                .filter((q): q is NonNullable<typeof q> => !!q && (q.type === 'SA' || q.type === 'CL'))
                .length
              if (saClCount === 0) return null
              return (
                <button
                  onClick={doGenerateGraderInfo}
                  disabled={bulkGenerating}
                  className="px-3 py-1.5 border border-accent/50 hover:bg-accent/10 disabled:opacity-40 text-sm text-accent rounded-lg font-medium transition-colors"
                >
                  {bulkGenerating
                    ? `Generating ${bulkGenerateDone}/${bulkGenerateTotal}…`
                    : `Generate grader info (${saClCount})`}
                </button>
              )
            })()}
            <button onClick={() => setSelected(new Set())} className="ml-auto text-sm text-muted hover:text-ink transition-colors">
              Clear selection
            </button>
          </div>

          {bulkTopicOpen && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-accent/20">
              <select
                value={bulkTopicModuleId}
                onChange={(e) => setBulkTopicModuleId(e.target.value)}
                disabled={bulkAssigning}
                className="bg-surface border border-edge rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="">— Pick a topic —</option>
                {topicModules.map((m) => (
                  <option key={m.id} value={m.id}>{m.topic}</option>
                ))}
              </select>
              <button
                onClick={doBulkAssign}
                disabled={!bulkTopicModuleId || bulkAssigning}
                className="px-4 py-1.5 bg-accent hover:opacity-90 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors"
              >
                {bulkAssigning
                  ? `Assigning ${bulkAssignDone}/${selected.size}…`
                  : `Assign to ${selected.size} question${selected.size !== 1 ? 's' : ''}`}
              </button>
              {!bulkAssigning && (
                <button
                  onClick={() => setBulkTopicOpen(false)}
                  className="text-sm text-muted hover:text-ink transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state / table */}
      {questions.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <p>No questions saved yet.</p>
          <Link href="/generate" className="mt-3 inline-block text-accent hover:underline text-sm">
            Generate your first question →
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-12 text-muted text-sm">No questions match the current filters.</p>
      ) : (
        <div className="border border-edge rounded-lg bg-surface overflow-hidden">
          {/* Header */}
          <div
            className="hidden lg:grid items-center px-4 py-2.5 border-b border-edge bg-surface2 text-xs font-medium text-muted uppercase tracking-wide"
            style={{ gridTemplateColumns: '40px 120px 80px 80px 150px 1fr 170px 80px' }}
          >
            <input ref={selectAllRef} type="checkbox" checked={allChecked} onChange={toggleAll} className="rounded accent-accent cursor-pointer" />
            <span>Type</span>
            <span>Code</span>
            <span>Tag</span>
            <span>Topic</span>
            <span>Name</span>
            <span>Details</span>
            <span>Date</span>
          </div>

          {/* Rows */}
          {filtered.map((q) => (
            <div
              key={q.id}
              onClick={() => setPanelId(q.id)}
              className="grid items-center px-4 py-3 border-b border-edge last:border-0 hover:bg-surface2 cursor-pointer transition-colors"
              style={{ gridTemplateColumns: '40px 1fr' }}
            >
              <input
                type="checkbox"
                checked={selected.has(q.id)}
                onChange={() => {}}
                onClick={(e) => toggleOne(q.id, e)}
                className="rounded accent-accent cursor-pointer"
              />
              <div className="hidden lg:grid items-center min-w-0 gap-x-3"
                style={{ gridTemplateColumns: '120px 80px 80px 150px 1fr 170px 80px' }}>
                <span className={`text-xs font-medium px-2 py-0.5 rounded w-fit ${TYPE_COLOR[q.type] ?? 'bg-surface2 text-sub'}`}>
                  {TYPE_LABEL[q.type] ?? q.type}
                </span>
                <span className="font-mono text-xs text-accent truncate">{q.code ?? '—'}</span>
                <div className="flex gap-1 flex-wrap">
                  {q.tags.map((t) => (
                    <span key={t} className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${TAG_COLOR[t] ?? 'bg-surface2 text-sub'}`}>
                      {t}
                    </span>
                  ))}
                </div>
                <span className="text-sm text-sub truncate">{q.topic ?? '—'}</span>
                <span className="text-sm text-ink font-medium truncate min-w-0">{q.name}</span>
                <span className="text-xs text-muted truncate">
                  {q.section ? `s${q.section.number} · ${q.section.heading} · ` : ''}{q.defaultGrade}m
                </span>
                <span className="text-xs text-muted whitespace-nowrap">{formatDate(q.createdAt)}</span>
              </div>
              <div className="lg:hidden flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${TYPE_COLOR[q.type] ?? 'bg-surface2 text-sub'}`}>
                    {TYPE_LABEL[q.type] ?? q.type}
                  </span>
                  {q.code && <span className="font-mono text-xs text-accent">{q.code}</span>}
                  {q.tags.map((t) => (
                    <span key={t} className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${TAG_COLOR[t] ?? 'bg-surface2 text-sub'}`}>
                      {t}
                    </span>
                  ))}
                </div>
                <p className="text-sm font-medium text-ink truncate">{q.name}</p>
                <p className="text-xs text-muted">
                  {q.topic ? `${q.topic} · ` : ''}{q.defaultGrade}m · {formatDate(q.createdAt)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Side panel backdrop */}
      {panelQuestion && (
        <div className="fixed inset-0 bg-black/50 z-40 transition-opacity" onClick={() => setPanelId(null)} />
      )}

      {/* Side panel */}
      <div className={`fixed right-0 top-0 h-full w-full max-w-lg bg-surface border-l border-edge z-50 flex flex-col overflow-hidden transition-transform duration-200 ${panelQuestion ? 'translate-x-0' : 'translate-x-full'}`}>
        {panelQuestion && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-edge shrink-0">
              <div className="flex items-center gap-3">
                {editMode && editValues ? (
                  <select
                    value={editValues.type}
                    onChange={(e) => setEditValues((v) => v ? { ...v, type: e.target.value } : v)}
                    className="bg-surface2 border border-edge rounded px-2 py-0.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="SA">Short Answer</option>
                    <option value="CL">Criminal Liability</option>
                    <option value="MC">Multi-choice</option>
                    <option value="PR">Practical</option>
                  </select>
                ) : (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${TYPE_COLOR[panelQuestion.type] ?? 'bg-surface2 text-sub'}`}>
                    {TYPE_LABEL[panelQuestion.type] ?? panelQuestion.type}
                  </span>
                )}
                {(editMode ? editNextCode : panelQuestion.code) && (
                  <span className="font-mono text-sm text-accent">
                    {editMode ? editNextCode : panelQuestion.code}
                  </span>
                )}
              </div>
              <button onClick={() => setPanelId(null)} className="text-muted hover:text-ink transition-colors text-lg leading-none">✕</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {editMode && editValues ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted uppercase tracking-wide block mb-1">Name</label>
                    <input
                      type="text"
                      value={editValues.name}
                      onChange={(e) => setEditValues((v) => v ? { ...v, name: e.target.value } : v)}
                      className="w-full bg-surface2 border border-edge rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <div className="flex items-start gap-4">
                    <div>
                      <label className="text-xs text-muted uppercase tracking-wide block mb-1">Marks</label>
                      <input
                        type="number"
                        min={1}
                        value={editValues.defaultGrade}
                        onChange={(e) => setEditValues((v) => v ? { ...v, defaultGrade: parseFloat(e.target.value) || 1 } : v)}
                        className="w-20 bg-surface2 border border-edge rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted uppercase tracking-wide block mb-1">Tags</label>
                      <div className="flex gap-2 flex-wrap">
                        {ALL_TAGS.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setEditValues((v) => {
                              if (!v) return v
                              const next = v.tags.includes(t)
                                ? v.tags.filter((x) => x !== t)
                                : [...v.tags, t]
                              return { ...v, tags: next }
                            })}
                            className={`text-xs font-medium px-3 py-1 rounded-full capitalize transition-colors ${
                              editValues?.tags.includes(t) ? TAG_COLOR[t] : 'bg-surface2 text-muted hover:text-ink'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Topic / code assignment */}
                  {topicModules.length > 0 && (
                    <div>
                      <label className="text-xs text-muted uppercase tracking-wide block mb-1">Topic</label>
                      <select
                        value={editTopicModuleId}
                        onChange={(e) => handleEditTopicChange(e.target.value)}
                        className="w-full bg-surface2 border border-edge rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        <option value="">— No topic —</option>
                        {topicModules.map((m) => (
                          <option key={m.id} value={m.id}>{m.topic}</option>
                        ))}
                      </select>
                      {editNextCode && (
                        <p className="mt-1 text-xs text-muted">
                          Code: <span className="font-mono text-accent">{fetchingCode ? '…' : editNextCode}</span>
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-muted uppercase tracking-wide block mb-1">Question text (HTML)</label>
                    <textarea
                      value={editValues.questionText}
                      onChange={(e) => setEditValues((v) => v ? { ...v, questionText: e.target.value } : v)}
                      rows={14}
                      className="w-full bg-surface2 border border-edge rounded-lg px-3 py-2 text-xs text-ink font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent resize-y"
                    />
                  </div>
                  {(editValues.type === 'SA' || editValues.type === 'CL') && (
                    <div>
                      <label className="text-xs text-muted uppercase tracking-wide block mb-1">Grader info (model answer)</label>
                      <textarea
                        value={editValues.graderInfo}
                        onChange={(e) => setEditValues((v) => v ? { ...v, graderInfo: e.target.value } : v)}
                        rows={10}
                        placeholder="Claude-generated model answer for markers. Leave blank to generate later."
                        className="w-full bg-surface2 border border-edge rounded-lg px-3 py-2 text-xs text-ink leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent resize-y"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <h2 className="text-base font-bold text-ink">{panelQuestion.name}</h2>

                  {/* Tag toggle */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted">Tags:</span>
                    {ALL_TAGS.map((t) => (
                      <button
                        key={t}
                        disabled={tagging}
                        onClick={() => handleTagToggle(t)}
                        className={`text-xs font-medium px-3 py-1 rounded-full capitalize transition-colors ${
                          panelQuestion.tags.includes(t)
                            ? TAG_COLOR[t]
                            : 'bg-surface2 text-muted hover:text-ink'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    {panelQuestion.topic && <span>{panelQuestion.topic}</span>}
                    {panelQuestion.section && <span>s{panelQuestion.section.number} — {panelQuestion.section.heading}</span>}
                    <span>{panelQuestion.defaultGrade} marks</span>
                    <span>{formatDate(panelQuestion.createdAt)}</span>
                  </div>

                  <div className="pt-2">
                    <p className="text-xs text-muted uppercase tracking-wide mb-2">Question</p>
                    {panelQuestion.type === 'MC' ? (
                      <MCDisplay questionText={panelQuestion.questionText} />
                    ) : (
                      <div className="prose prose-sm max-w-none text-sub leading-relaxed" dangerouslySetInnerHTML={{ __html: panelQuestion.questionText }} />
                    )}
                  </div>
                  {(panelQuestion.type === 'SA' || panelQuestion.type === 'CL') && panelQuestion.graderInfo && (
                    <div className="pt-2 border-t border-edge">
                      <button
                        onClick={() => setGraderInfoOpen((v) => !v)}
                        className="flex items-center gap-2 text-xs text-muted uppercase tracking-wide hover:text-ink transition-colors w-full text-left"
                      >
                        <span>Grader info</span>
                        <span className="ml-auto">{graderInfoOpen ? '▲' : '▼'}</span>
                      </button>
                      {graderInfoOpen && (
                        <p className="mt-2 text-sm text-sub whitespace-pre-wrap leading-relaxed">
                          {panelQuestion.graderInfo}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-edge shrink-0 flex gap-2">
              {editMode ? (
                <>
                  <button onClick={cancelEdit} disabled={saving} className="px-3 py-1.5 border border-edge hover:bg-surface2 disabled:opacity-40 text-sm text-sub rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving || !editValues?.name.trim()} className="px-4 py-1.5 bg-accent hover:opacity-90 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors">
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={startEdit}
                    className="px-3 py-1.5 bg-accent hover:opacity-90 text-white text-sm rounded-lg font-medium transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => downloadAs(toBulkMarkdown([panelQuestion]), `${panelQuestion.code ?? panelQuestion.name}.md`, 'text/markdown')}
                    className="px-3 py-1.5 border border-edge hover:bg-surface2 text-sm text-sub rounded-lg transition-colors"
                  >
                    Download .md
                  </button>
                  <button
                    onClick={() => downloadAs(toTotaraXml([panelQuestion]), `${panelQuestion.code ?? panelQuestion.name}.xml`, 'application/xml')}
                    className="px-3 py-1.5 border border-edge hover:bg-surface2 text-sm text-sub rounded-lg transition-colors"
                  >
                    Download XML
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className={`ml-auto px-3 py-1.5 text-sm rounded-lg transition-colors font-medium ${
                      deleteConfirm
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'border border-edge hover:bg-red-900/30 hover:border-red-700 text-muted hover:text-red-400'
                    }`}
                  >
                    {deleting ? 'Deleting…' : deleteConfirm ? 'Confirm delete' : 'Delete'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Import modal */}
      {importOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={closeImport} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-surface border border-edge rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl pointer-events-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-edge shrink-0">
                <div>
                  <h2 className="text-base font-bold text-ink">Import questions</h2>
                  <p className="text-xs text-muted mt-0.5">{importRows.length} question{importRows.length !== 1 ? 's' : ''} found in file</p>
                </div>
                <button onClick={closeImport} className="text-muted hover:text-ink transition-colors text-lg leading-none">✕</button>
              </div>

              <div className="px-5 py-3 border-b border-edge bg-surface2 shrink-0 space-y-2">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-sub whitespace-nowrap w-28">Assign module:</label>
                  <select
                    value={importModuleId}
                    onChange={(e) => setImportModuleId(e.target.value)}
                    className="flex-1 bg-surface border border-edge rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="">No module (no code assigned)</option>
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}{m.code ? ` (${m.code})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-sub whitespace-nowrap w-28">Tag all as:</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {ALL_TAGS.map((t) => (
                      <button
                        key={t}
                        onClick={() => setImportTags((prev) =>
                          prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                        )}
                        className={`text-xs font-medium px-3 py-1 rounded-full capitalize transition-colors ${
                          importTags.includes(t) ? TAG_COLOR[t] : 'bg-surface text-muted hover:text-ink'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {importRows.length === 0 ? (
                  <p className="text-center py-12 text-muted text-sm">No questions found in file.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface2 border-b border-edge">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted uppercase tracking-wide">Name</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted uppercase tracking-wide w-36">Type</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted uppercase tracking-wide w-20">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((row, i) => (
                        <tr key={i} className="border-b border-edge last:border-0 hover:bg-surface2">
                          <td className="px-4 py-2.5 text-ink font-medium">{row.name}</td>
                          <td className="px-4 py-2.5">
                            <select
                              value={row.type}
                              onChange={(e) => setRowType(i, e.target.value as 'SA' | 'CL' | 'MC' | 'PR')}
                              className="bg-surface border border-edge rounded px-2 py-1 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                            >
                              <option value="SA">Short Answer</option>
                              <option value="CL">Criminal Liability</option>
                              <option value="MC">Multi-choice</option>
                              <option value="PR">Practical</option>
                            </select>
                          </td>
                          <td className="px-4 py-2.5 text-muted">{row.defaultGrade}m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="px-5 py-4 border-t border-edge shrink-0 flex items-center justify-between gap-3">
                <button onClick={closeImport} disabled={importing} className="px-3 py-1.5 border border-edge hover:bg-surface2 disabled:opacity-40 text-sm text-sub rounded-lg transition-colors">
                  Cancel
                </button>
                <button
                  onClick={doImport}
                  disabled={importing || importRows.length === 0}
                  className="px-4 py-1.5 bg-accent hover:opacity-90 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-colors"
                >
                  {importing ? 'Importing…' : `Import ${importRows.length} question${importRows.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
