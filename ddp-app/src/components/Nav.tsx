'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/',           label: 'Dashboard' },
  { href: '/generate',   label: 'Generate questions' },
  { href: '/mark',       label: 'Mark answer' },
  { href: '/mark/bulk',  label: 'Bulk mark' },
  { href: '/library',    label: 'Question library' },
]

export default function Nav() {
  const [open, setOpen] = useState(false)
  const [light, setLight] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setLight(document.body.classList.contains('light'))
  }, [])

  function toggleTheme() {
    const next = !light
    setLight(next)
    document.body.classList.toggle('light', next)
    try { localStorage.setItem('theme', next ? 'light' : 'dark') } catch {}
  }

  const close = () => setOpen(false)

  return (
    <>
      <nav className="site-nav">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu">
          <span /><span /><span />
        </button>
        <Link href="/" className="nav-brand-group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logomark.svg" className="nav-logo-img" alt="" />
          <span className="nav-wordmark">DDP</span>
        </Link>
        <button className="nav-theme-btn" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
          {light ? '☀' : '☾'}
        </button>
      </nav>

      {open && <div className="nav-overlay" onClick={close} />}

      <div className={`nav-drawer ${open ? 'open' : ''}`}>
        <div className="nav-drawer-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logomark.svg" alt="" />
          <span>DDP</span>
        </div>
        <ul className="nav-links">
          {links.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={close}
                className={pathname === href ? 'active' : ''}
              >
                {label}
              </Link>
            </li>
          ))}
          <li><div className="nav-divider" /></li>
          <li><a href="/" className="!text-muted">← Main site</a></li>
        </ul>
      </div>
    </>
  )
}
