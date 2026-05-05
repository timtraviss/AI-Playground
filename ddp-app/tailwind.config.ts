import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas:  'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        edge:    'var(--border)',
        ink:     'var(--text)',
        sub:     'var(--text-sub)',
        muted:   'var(--text-muted)',
        accent:  'var(--brand)',
      },
    },
  },
  plugins: [],
}
export default config
