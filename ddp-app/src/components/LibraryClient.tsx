'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { toBulkMarkdown, toTotaraXml, downloadAs, type ExportQuestion } from '@/lib/export'

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

interface LibraryClientProps {
  questions: ExportQuestion[]
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

export default function LibraryClient({ questions }: LibraryClientProps) {
  const [typeFilter, setTypeFilter] = useState('')
  const [topicFilter, setTopicFilter] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [panelId, setPanelId] = useState<number | null>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)

  const types = [...new Set(questions.map((q) => q.type))].sort()
  const topics = [...new Set(questions.map((q) => q.topic).filter((t): t is string => !!t))].sort()

  const filtered = questions.filter((q) => {
    if (typeFilter && q.type !== typeFilter) return false
    if (topicFilter && q.topic !== topicFilter) return false
    return true
  })

  const allChecked = filtered.length > 0 && filtered.every((q) => selected.has(q.id))
  const someChecked = filtered.some((q) => selected.has(q.id))

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someChecked && !allChecked
    }
  }, [someChecked, allChecked])

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

  function exportMd() {
    downloadAs(toBulkMarkdown(selectedQuestions), 'questions.md', 'text/markdown')
  }

  function exportXml() {
    downloadAs(toTotaraXml(selectedQuestions), 'questions.xml', 'application/xml')
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: '2-digit' })
  }

  if (questions.length === 0) {
    return (
      <div className="text-center py-16 text-muted">
        <p>No questions saved yet.</p>
        <Link href="/generate" className="mt-3 inline-block text-accent hover:underline text-sm">
          Generate your first question →
        </Link>
      </div>
    )
  }

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
        <span className="text-sm text-muted ml-auto">
          {filtered.length} question{filtered.length !== 1 ? 's' : ''}
          {(typeFilter || topicFilter) ? ' (filtered)' : ''}
        </span>
      </div>

      {/* Export toolbar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 px-4 py-3 bg-accent/10 border border-accent/30 rounded-lg">
          <span className="text-sm font-medium text-ink">{selected.size} selected</span>
          <button
            onClick={exportMd}
            className="px-3 py-1.5 bg-accent hover:opacity-90 text-white text-sm rounded-lg font-medium transition-colors"
          >
            Export .md
          </button>
          <button
            onClick={exportXml}
            className="px-3 py-1.5 bg-accent hover:opacity-90 text-white text-sm rounded-lg font-medium transition-colors"
          >
            Export XML (Totara)
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-sm text-muted hover:text-ink transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="text-center py-12 text-muted text-sm">No questions match the current filters.</p>
      ) : (
        <div className="border border-edge rounded-lg bg-surface overflow-hidden">
          {/* Header */}
          <div className="hidden lg:grid items-center px-4 py-2.5 border-b border-edge bg-surface2 text-xs font-medium text-muted uppercase tracking-wide"
            style={{ gridTemplateColumns: '40px 130px 90px 160px 1fr 180px 80px' }}>
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="rounded accent-accent cursor-pointer"
            />
            <span>Type</span>
            <span>Code</span>
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
              {/* Mobile: checkbox + full content in two columns */}
              <input
                type="checkbox"
                checked={selected.has(q.id)}
                onChange={() => {}}
                onClick={(e) => toggleOne(q.id, e)}
                className="rounded accent-accent cursor-pointer"
              />

              {/* Desktop: full grid row inside */}
              <div className="hidden lg:grid items-center min-w-0 gap-x-3"
                style={{ gridTemplateColumns: '130px 90px 160px 1fr 180px 80px' }}>
                <span className={`text-xs font-medium px-2 py-0.5 rounded w-fit ${TYPE_COLOR[q.type] ?? 'bg-surface2 text-sub'}`}>
                  {TYPE_LABEL[q.type] ?? q.type}
                </span>
                <span className="font-mono text-xs text-accent truncate">{q.code ?? '—'}</span>
                <span className="text-sm text-sub truncate">{q.topic ?? '—'}</span>
                <span className="text-sm text-ink font-medium truncate min-w-0">{q.name}</span>
                <span className="text-xs text-muted truncate">
                  {q.section ? `s${q.section.number} · ${q.section.heading} · ` : ''}{q.defaultGrade}m
                </span>
                <span className="text-xs text-muted whitespace-nowrap">{formatDate(q.createdAt)}</span>
              </div>

              {/* Mobile: stacked layout */}
              <div className="lg:hidden flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${TYPE_COLOR[q.type] ?? 'bg-surface2 text-sub'}`}>
                    {TYPE_LABEL[q.type] ?? q.type}
                  </span>
                  {q.code && <span className="font-mono text-xs text-accent">{q.code}</span>}
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
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={() => setPanelId(null)}
        />
      )}

      {/* Side panel */}
      <div className={`fixed right-0 top-0 h-full w-full max-w-lg bg-surface border-l border-edge z-50 flex flex-col overflow-hidden transition-transform duration-200 ${panelQuestion ? 'translate-x-0' : 'translate-x-full'}`}>
        {panelQuestion && (
          <>
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-edge shrink-0">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${TYPE_COLOR[panelQuestion.type] ?? 'bg-surface2 text-sub'}`}>
                  {TYPE_LABEL[panelQuestion.type] ?? panelQuestion.type}
                </span>
                {panelQuestion.code && (
                  <span className="font-mono text-sm text-accent">{panelQuestion.code}</span>
                )}
              </div>
              <button
                onClick={() => setPanelId(null)}
                className="text-muted hover:text-ink transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <h2 className="text-base font-bold text-ink">{panelQuestion.name}</h2>

              {/* Meta pills */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                {panelQuestion.topic && <span>{panelQuestion.topic}</span>}
                {panelQuestion.section && (
                  <span>s{panelQuestion.section.number} — {panelQuestion.section.heading}</span>
                )}
                <span>{panelQuestion.defaultGrade} marks</span>
                <span>{formatDate(panelQuestion.createdAt)}</span>
              </div>

              {/* Question text */}
              <div className="pt-2">
                <p className="text-xs text-muted uppercase tracking-wide mb-2">Question</p>
                {panelQuestion.type === 'MC' ? (
                  <MCDisplay questionText={panelQuestion.questionText} />
                ) : (
                  <div
                    className="prose prose-sm max-w-none text-sub leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: panelQuestion.questionText }}
                  />
                )}
              </div>
            </div>

            {/* Panel footer */}
            <div className="px-5 py-4 border-t border-edge shrink-0 flex gap-2">
              <button
                onClick={() => {
                  downloadAs(
                    toBulkMarkdown([panelQuestion]),
                    `${panelQuestion.code ?? panelQuestion.name}.md`,
                    'text/markdown'
                  )
                }}
                className="px-3 py-1.5 border border-edge hover:bg-surface2 text-sm text-sub rounded-lg transition-colors"
              >
                Download .md
              </button>
              <button
                onClick={() => {
                  downloadAs(
                    toTotaraXml([panelQuestion]),
                    `${panelQuestion.code ?? panelQuestion.name}.xml`,
                    'application/xml'
                  )
                }}
                className="px-3 py-1.5 border border-edge hover:bg-surface2 text-sm text-sub rounded-lg transition-colors"
              >
                Download XML
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
