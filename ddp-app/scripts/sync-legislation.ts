import { XMLParser } from 'fast-xml-parser'
import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

interface ActConfig {
  shortTitle: string
  url: string
  workId: string
}

const ACTS: ActConfig[] = [
  {
    shortTitle: 'Crimes Act 1961',
    url: 'https://legislation.govt.nz/act/public/1961/43/en/latest.xml',
    workId: 'public/1961/43',
  },
]

// ── Text extraction ────────────────────────────────────────────────────────────

function extractText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join(' ')
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>
    if ('#text' in o) return String(o['#text'])
    return Object.entries(o)
      .filter(([k]) => !k.startsWith('@'))
      .map(([, v]) => extractText(v))
      .join(' ')
  }
  return ''
}

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

// ── Section collection ─────────────────────────────────────────────────────────

interface SectionData {
  number: string
  heading: string
  partHeading: string | null
  fullText: string
  rawXml: string
}

// Walk the parsed XML tree collecting anything that looks like a numbered section:
// a node with a `label` matching /^\d+[A-Z]{0,2}$/ and a non-empty `heading`.
// Context: as we descend, update partCtx when we see a Part-like node (has label
// and heading but no section-body indicators).
function collectSections(
  node: unknown,
  partCtx: string | null,
  out: SectionData[]
): string | null {
  if (!node || typeof node !== 'object') return partCtx
  if (Array.isArray(node)) {
    let ctx = partCtx
    for (const item of node) {
      ctx = collectSections(item, ctx, out) ?? ctx
    }
    return ctx
  }

  const o = node as Record<string, unknown>

  const rawLabel = o['label'] != null ? clean(extractText(o['label'])) : null
  const rawHeading = o['heading'] != null ? clean(extractText(o['heading'])) : null
  const isSectionNum = rawLabel != null && /^\d+[A-Z]{0,3}$/.test(rawLabel)

  let ctx = partCtx

  if (rawLabel && rawHeading) {
    if (isSectionNum) {
      // Looks like a numbered section — collect it
      out.push({
        number: rawLabel,
        heading: rawHeading,
        partHeading: ctx,
        fullText: clean(extractText(o)),
        rawXml: JSON.stringify(o),
      })
    } else {
      // Structural element (Part, Subpart, Schedule heading) — update context
      ctx = `${rawLabel} — ${rawHeading}`
    }
  }

  // Recurse into all child nodes (skip already-processed label/heading and attributes)
  for (const [key, val] of Object.entries(o)) {
    if (key.startsWith('@') || key === '#text' || key === 'label' || key === 'heading') continue
    if (val && typeof val === 'object') {
      ctx = collectSections(val, ctx, out) ?? ctx
    }
  }

  return ctx
}

// ── Network fetch ──────────────────────────────────────────────────────────────

async function fetchXml(config: ActConfig): Promise<string> {
  const apiKey = process.env.LEGISLATION_API_KEY
  const url = apiKey ? `${config.url}?api_key=${apiKey}` : config.url
  console.log(`Fetching ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  const text = await res.text()
  console.log(`  ${(text.length / 1024).toFixed(0)} KB received`)
  return text
}

// ── PDF fallback ───────────────────────────────────────────────────────────────

async function syncFromPdf(config: ActConfig, pdfPath: string) {
  console.log(`Using PDF fallback: ${pdfPath}`)
  const { default: pdfParse } = await import('pdf-parse')
  const buf = fs.readFileSync(pdfPath)
  const { text } = await pdfParse(buf)

  const re = /^(\d+[A-Z]?)\s{2,}(.+)$/gm
  const matches = [...text.matchAll(re)]

  const act = await prisma.act.upsert({
    where: { workId: config.workId },
    create: { shortTitle: config.shortTitle, workId: config.workId, versionId: 'pdf', versionDate: new Date() },
    update: { syncedAt: new Date() },
  })

  for (const m of matches) {
    await prisma.section.upsert({
      where: { actId_number: { actId: act.id, number: m[1] } },
      create: { actId: act.id, number: m[1], heading: m[2].trim(), partHeading: null, fullText: m[2].trim(), rawXml: '' },
      update: { heading: m[2].trim() },
    })
  }
  console.log(`PDF fallback: upserted ${matches.length} sections`)
}

// ── Main sync ──────────────────────────────────────────────────────────────────

async function syncAct(config: ActConfig) {
  let unique: SectionData[]

  // Try live network fetch first
  let xmlText = ''
  try {
    xmlText = await fetchXml(config)
  } catch (err) {
    console.error(`Fetch failed: ${err}`)
  }

  if (xmlText.length > 0) {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      isArray: (name) =>
        ['prov', 'subprov', 'para', 'part', 'subpart', 'schedule', 'item', 'def-para', 'indent'].includes(name),
      parseTagValue: false,
      trimValues: true,
    })

    const parsed = parser.parse(xmlText)
    const sections: SectionData[] = []
    collectSections(parsed, null, sections)

    const seen = new Set<string>()
    unique = sections.filter((s) => {
      if (seen.has(s.number)) return false
      seen.add(s.number)
      return true
    })

    console.log(`  Found ${sections.length} raw provisions → ${unique.length} unique section numbers`)
  } else {
    // Network returned empty — try JSON bundle, then PDF fallback
    const jsonFallback = path.join(__dirname, '..', 'data', `${config.workId.replace(/\//g, '-')}-sections.json`)
    if (fs.existsSync(jsonFallback)) {
      console.log(`  Network returned empty — using bundled JSON: ${path.basename(jsonFallback)}`)
      const bundle = JSON.parse(fs.readFileSync(jsonFallback, 'utf-8')) as { sections: SectionData[] }
      unique = bundle.sections
      console.log(`  Loaded ${unique.length} sections from bundle`)
    } else {
      const pdfFallback = path.join(__dirname, '..', 'data', 'crimes-act-fallback.pdf')
      if (fs.existsSync(pdfFallback)) {
        await syncFromPdf(config, pdfFallback)
        return
      }
      throw new Error('Network returned empty and no local fallback found')
    }
  }

  if (unique.length === 0) {
    console.error('No sections found')
    process.exit(1)
  }

  // Upsert Act record
  const act = await prisma.act.upsert({
    where: { workId: config.workId },
    create: { shortTitle: config.shortTitle, workId: config.workId, versionId: 'latest', versionDate: new Date() },
    update: { versionId: 'latest', versionDate: new Date(), syncedAt: new Date() },
  })

  console.log(`  Act id=${act.id} "${act.shortTitle}" — upserting sections...`)

  let n = 0
  for (const s of unique) {
    await prisma.section.upsert({
      where: { actId_number: { actId: act.id, number: s.number } },
      create: {
        actId: act.id,
        number: s.number,
        heading: s.heading,
        partHeading: s.partHeading,
        fullText: s.fullText,
        rawXml: s.rawXml,
      },
      update: {
        heading: s.heading,
        partHeading: s.partHeading,
        fullText: s.fullText,
        rawXml: s.rawXml,
      },
    })
    n++
    if (n % 100 === 0) process.stdout.write(`  ${n}...`)
  }

  console.log(`\n  ✓ Upserted ${n} sections for "${config.shortTitle}"`)
}

async function main() {
  for (const config of ACTS) {
    await syncAct(config)
  }
  const total = await prisma.section.count()
  console.log(`\nDone. Total sections in DB: ${total}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
