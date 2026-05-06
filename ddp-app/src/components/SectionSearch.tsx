'use client'

import { useState } from 'react'
import Link from 'next/link'
import { apiUrl } from '@/lib/api'

interface SectionResult {
  id: number
  number: string
  heading: string
  partHeading: string | null
  actShortTitle: string
}

export default function SectionSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SectionResult[]>([])
  const [loading, setLoading] = useState(false)

  async function search(query: string) {
    setQ(query)
    if (!query.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(apiUrl(`/api/sections?q=${encodeURIComponent(query)}`))
      setResults(await res.json())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3 text-ink">Section search</h2>
      <input
        type="text"
        value={q}
        onChange={(e) => search(e.target.value)}
        placeholder="Search by section number or heading (e.g. 219, robbery, theft)…"
        className="w-full bg-surface2 border border-edge rounded-lg px-4 py-2 text-sm text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent"
      />
      {loading && <p className="text-sm text-muted mt-2">Searching…</p>}
      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-edge border border-edge rounded-lg bg-surface">
          {results.map((s) => (
            <li key={s.id}>
              <Link
                href={`/generate?sectionId=${s.id}`}
                className="flex items-baseline gap-2 px-4 py-3 hover:bg-accent/10 transition-colors"
              >
                <span className="font-mono text-accent text-sm shrink-0">s{s.number}</span>
                <span className="text-edge">—</span>
                <span className="text-sm font-medium text-sub">{s.heading}</span>
                {s.partHeading && (
                  <span className="ml-1 text-xs text-muted">{s.partHeading}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!loading && q.trim() && results.length === 0 && (
        <p className="text-sm text-muted mt-2">No results.</p>
      )}
    </div>
  )
}
