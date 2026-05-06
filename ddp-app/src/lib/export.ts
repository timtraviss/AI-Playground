const TYPE_LABEL: Record<string, string> = {
  SA: 'Short Answer',
  CL: 'Criminal Liability',
  MC: 'Multi-choice',
  PR: 'Practical',
}

export interface ExportQuestion {
  id: number
  code: string | null
  name: string
  type: string
  questionText: string
  defaultGrade: number
  createdAt: string
  topic: string | null
  section: { number: string; heading: string } | null
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function toBulkMarkdown(questions: ExportQuestion[]): string {
  return questions.map((q) => {
    const title = [q.code, q.name].filter(Boolean).join(' — ')
    const meta: string[] = [`**Type:** ${TYPE_LABEL[q.type] ?? q.type}`]
    if (q.topic) meta.push(`**Topic:** ${q.topic}`)
    if (q.section) meta.push(`**Section:** s${q.section.number} ${q.section.heading}`)
    meta.push(`**Marks:** ${q.defaultGrade}`)

    let body: string
    if (q.type === 'MC') {
      try {
        const mc = JSON.parse(q.questionText) as { stem: string; options: { text: string; correct: boolean }[] }
        const opts = mc.options
          .map((o, i) => `${String.fromCharCode(65 + i)}. ${o.text}${o.correct ? ' ✓' : ''}`)
          .join('\n')
        body = `${mc.stem}\n\n${opts}`
      } catch {
        body = q.questionText
      }
    } else {
      body = stripHtml(q.questionText)
    }

    return `## ${title}\n\n${meta.join(' | ')}\n\n${body}`
  }).join('\n\n---\n\n')
}

export function toTotaraXml(questions: ExportQuestion[]): string {
  const items = questions.map((q) => {
    const fullName = escXml([q.code, q.name].filter(Boolean).join(' — '))

    if (q.type === 'MC') {
      let mc: { stem: string; options: { text: string; correct: boolean }[] }
      try { mc = JSON.parse(q.questionText) } catch { mc = { stem: q.questionText, options: [] } }

      const answers = mc.options.map((o) =>
        `    <answer fraction="${o.correct ? 100 : 0}" format="html">
      <text><![CDATA[${escXml(o.text)}]]></text>
      <feedback format="html"><text></text></feedback>
    </answer>`
      ).join('\n')

      return `  <question type="multichoice">
    <name><text>${fullName}</text></name>
    <questiontext format="html">
      <text><![CDATA[<p>${escXml(mc.stem)}</p>]]></text>
    </questiontext>
    <defaultgrade>${q.defaultGrade}</defaultgrade>
    <penalty>0.3333333</penalty>
    <hidden>0</hidden>
    <single>1</single>
    <shuffleanswers>1</shuffleanswers>
    <answernumbering>abc</answernumbering>
${answers}
  </question>`
    }

    return `  <question type="essay">
    <name><text>${fullName}</text></name>
    <questiontext format="html">
      <text><![CDATA[${q.questionText}]]></text>
    </questiontext>
    <defaultgrade>${q.defaultGrade}</defaultgrade>
    <penalty>0</penalty>
    <hidden>0</hidden>
    <responseformat>editor</responseformat>
    <responserequired>1</responserequired>
    <responsefieldlines>15</responsefieldlines>
    <attachments>0</attachments>
    <attachmentsrequired>0</attachmentsrequired>
  </question>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n${items.join('\n')}\n</quiz>`
}

export function downloadAs(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
