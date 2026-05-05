import type { Metadata } from 'next'
import './globals.css'
import Nav from '@/components/Nav'

export const metadata: Metadata = {
  title: 'DDP Question Builder & Marker',
  description: 'NZ Police Detective Development Programme',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
      </head>
      <body suppressHydrationWarning>
        {/* Restore theme before first paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('theme')==='light')document.body.classList.add('light')}catch(e){}` }} />
        <Nav />
        <div style={{ paddingTop: 'var(--nav-height)' }}>
          {children}
        </div>
      </body>
    </html>
  )
}
