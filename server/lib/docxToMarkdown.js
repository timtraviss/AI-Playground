import mammoth from 'mammoth';

const STYLE_MAP = [
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Quote DDP'] => blockquote > p:fresh",
  "p[style-name='annotation text'] => p.annotation:fresh",
  "p[style-name='List Paragraph'] => ul > li:fresh",
];

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

export function htmlToMarkdown(html) {
  let md = html;

  // Inline formatting first (before block tags)
  md = md.replace(/<strong>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<em>([\s\S]*?)<\/em>/gi, '*$1*');

  // Headings
  md = md.replace(/<h1>([\s\S]*?)<\/h1>/gi, (_, t) => `# ${stripTags(t)}\n`);
  md = md.replace(/<h2>([\s\S]*?)<\/h2>/gi, (_, t) => `## ${stripTags(t)}\n`);
  md = md.replace(/<h3>([\s\S]*?)<\/h3>/gi, (_, t) => `### ${stripTags(t)}\n`);

  // Tables (before generic <p> handling)
  md = md.replace(/<table[\s\S]*?<\/table>/gi, (match) => convertTable(match));

  // Blockquotes
  md = md.replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const lines = inner
      .replace(/<p>([\s\S]*?)<\/p>/gi, '$1\n')
      .replace(/<[^>]+>/g, '')
      .trim()
      .split('\n')
      .filter(l => l.trim());
    return lines.map(l => `> ${l.trim()}`).join('\n') + '\n';
  });

  // Annotation paragraphs
  md = md.replace(/<p class="annotation">([\s\S]*?)<\/p>/gi,
    (_, t) => `*${stripTags(t).trim()}*\n`);

  // List items
  md = md.replace(/<ul>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    const items = [...inner.matchAll(/<li>([\s\S]*?)<\/li>/gi)];
    return items.map(m => `- ${stripTags(m[1]).trim()}`).join('\n') + '\n';
  });

  // Paragraphs
  md = md.replace(/<p>([\s\S]*?)<\/p>/gi, (_, t) => {
    const text = stripTags(t).trim();
    return text ? `${text}\n\n` : '';
  });

  // Strip any remaining tags
  md = md.replace(/<[^>]+>/g, '');

  // Normalise whitespace
  md = md.replace(/\n{3,}/g, '\n\n').trim();

  return md;
}

function convertTable(tableHtml) {
  const rows = [...tableHtml.matchAll(/<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi)];
  if (!rows.length) return '';

  const results = [];
  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
    if (cells.length < 2) continue;

    const label = stripTags(cells[0][1]).trim();
    const contentLines = cells[1][1]
      .replace(/<p>([\s\S]*?)<\/p>/gi, '$1\n')
      .replace(/<[^>]+>/g, '')
      .trim()
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    if (label) {
      results.push(`**${label}**`);
      contentLines.forEach(l => results.push(`> ${l}`));
      results.push('');
    }
  }
  return results.join('\n') + '\n';
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '');
}

export async function convertDocxToMarkdown(filePath) {
  const result = await mammoth.convertToHtml(
    { path: filePath },
    { styleMap: STYLE_MAP }
  );
  return htmlToMarkdown(result.value);
}
