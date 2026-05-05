'use client'

import { useState, useRef, useEffect } from 'react'
import { apiUrl } from '@/lib/api'

interface SectionResult {
  id: number
  number: string
  heading: string
  partHeading: string | null
  actShortTitle: string
}

interface SectionPickerProps {
  value: SectionResult | null
  onChange: (section: SectionResult | null) => void
  placeholder?: string
}

export default function SectionPicker({
  value,
  onChange,
  placeholder = 'Search by number or heading…',
}: SectionPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SectionResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function search(q: string) {
    setQuery(q)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    setLoading(true)
    setOpen(true)
    try {
      const res = await fetch(apiUrl(`/api/sections?q=${encodeURIComponent(q)}`))
      setResults(await res.json())
    } finally {
      setLoading(false)
    }
  }

  function select(s: SectionResult) {
    onChange(s)
    setQuery(`s${s.number} — ${s.heading}`)
    setOpen(false)
    setResults([])
  }

  function clear() {
    onChange(null)
    setQuery('')
    setResults([])
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex">
        <input
          type="text"
          value={query}
          onChange={(e) => search(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="flex-1 border rounded-l-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {value && (
          <button
            onClick={clear}
            className="border border-l-0 rounded-r-lg px-3 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <ul className="absolute z-10 w-full mt-1 max-h-60 overflow-auto bg-white border rounded-lg shadow-lg">
          {loading && (
            <li className="px-4 py-2 text-sm text-gray-400">Searching…</li>
          )}
          {!loading && results.length === 0 && (
            <li className="px-4 py-2 text-sm text-gray-400">No results.</li>
          )}
          {results.map((s) => (
            <li
              key={s.id}
              onMouseDown={() => select(s)}
              className="px-4 py-2 cursor-pointer hover:bg-blue-50 text-sm"
            >
              <span className="font-mono text-blue-700">s{s.number}</span>
              <span className="mx-2 text-gray-300">—</span>
              <span className="font-medium">{s.heading}</span>
            </li>
          ))}
        </ul>
      )}

      {value && (
        <p className="mt-1 text-xs text-gray-500">
          {value.actShortTitle}
          {value.partHeading ? ` · ${value.partHeading}` : ''}
        </p>
      )}
    </div>
  )
}
