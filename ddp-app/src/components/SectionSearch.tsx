'use client'

import { useState } from 'react'
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
      <h2 className="text-lg font-semibold mb-3">Section search</h2>
      <input
        type="text"
        value={q}
        onChange={(e) => search(e.target.value)}
        placeholder="Search by section number or heading (e.g. 219, robbery, theft)…"
        className="w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {loading && <p className="text-sm text-gray-400 mt-2">Searching…</p>}
      {results.length > 0 && (
        <ul className="mt-3 divide-y border rounded-lg bg-white">
          {results.map((s) => (
            <li key={s.id} className="px-4 py-3">
              <span className="font-mono text-blue-700 text-sm">s{s.number}</span>
              <span className="mx-2 text-gray-300">—</span>
              <span className="text-sm font-medium">{s.heading}</span>
              {s.partHeading && (
                <span className="ml-2 text-xs text-gray-400">{s.partHeading}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {!loading && q.trim() && results.length === 0 && (
        <p className="text-sm text-gray-400 mt-2">No results.</p>
      )}
    </div>
  )
}
