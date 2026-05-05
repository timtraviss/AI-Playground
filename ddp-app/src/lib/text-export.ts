const TYPE_LABEL: Record<string, string> = {
  SA: 'Short Answer',
  CL: 'Criminal Liability',
  MC: 'Multi-choice',
  PR: 'Practical',
}

export interface QuestionExportData {
  name: string
  type: string
  questionText: string
  defaultGrade: number
  sectionNumber: string
  sectionHeading: string
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

export function toMarkdown(q: QuestionExportData): string {
  return [
    `## ${q.name}`,
    `**Section:** s${q.sectionNumber} — ${q.sectionHeading}`,
    `**Type:** ${TYPE_LABEL[q.type] ?? q.type}`,
    `**Marks:** ${q.defaultGrade}`,
    '',
    stripHtml(q.questionText),
    '',
    '---',
  ].join('\n')
}

export function toPlainText(q: QuestionExportData): string {
  return [
    q.name,
    `Section: s${q.sectionNumber} — ${q.sectionHeading}`,
    `Type: ${TYPE_LABEL[q.type] ?? q.type}`,
    `Marks: ${q.defaultGrade}`,
    '',
    stripHtml(q.questionText),
    '',
    '---',
  ].join('\n')
}

export function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
