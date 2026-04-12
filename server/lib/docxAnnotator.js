/**
 * DOCX Comment Annotator
 *
 * Uses pizzip to open a DOCX archive, inject Word comments for each review
 * issue found by Claude, and repack the archive.
 *
 * Comments are added at paragraph level: each issue is anchored to the first
 * paragraph whose plain-text content contains the issue's searchText. Issues
 * with no searchText (or unmatched text) are bundled into a general comment on
 * the opening paragraph.
 */

import PizZip from 'pizzip';
import { readFileSync, writeFileSync } from 'fs';

const AUTHOR = 'Reviewer';
const DATE   = new Date().toISOString().slice(0, 19) + 'Z';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Strip all XML tags and decode basic entities to get raw text of a paragraph. */
function paragraphText(xml) {
  return xml
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

/** Split docXml into an array of <w:p>…</w:p> segments plus the surrounding wrapper. */
function splitIntoParagraphs(docXml) {
  // Split on paragraph tags, keeping the delimiters
  const parts = docXml.split(/(<w:p[ >](?:.|\n)*?<\/w:p>)/);
  return parts;
}

/** Build a single <w:comment> element. */
function buildComment(id, text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return (
    `<w:comment w:id="${id}" w:author="${AUTHOR}" w:date="${DATE}" w:initials="R">` +
    `<w:p>` +
    `<w:pPr><w:pStyle w:val="CommentText"/></w:pPr>` +
    `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>` +
    `<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r>` +
    `</w:p>` +
    `</w:comment>`
  );
}

/** Wrap a paragraph segment with comment range markers. */
function wrapParagraph(pXml, id) {
  // Insert commentRangeStart just inside the opening <w:p> or <w:p …>
  // Insert commentRangeEnd + commentReference just before </w:p>
  const rangeStart = `<w:commentRangeStart w:id="${id}"/>`;
  const rangeEnd   =
    `<w:commentRangeEnd w:id="${id}"/>` +
    `<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>` +
    `<w:commentReference w:id="${id}"/></w:r>`;

  // Place rangeStart after the opening tag of <w:p>
  const withStart = pXml.replace(/(<w:p(?:\s[^>]*)?>)/, `$1${rangeStart}`);
  // Place rangeEnd before the closing tag </w:p>
  const withEnd   = withStart.replace(/<\/w:p>$/, `${rangeEnd}</w:p>`);
  return withEnd;
}

/** Build the full word/comments.xml content. */
function buildCommentsXml(commentElements) {
  const ns = [
    'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"',
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"',
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    'mc:Ignorable="w14"',
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  ].join(' ');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:comments ${ns}>` +
    commentElements.join('') +
    `</w:comments>`
  );
}

/** Ensure [Content_Types].xml registers comments.xml. */
function ensureCommentContentType(contentTypesXml) {
  const override =
    `<Override PartName="/word/comments.xml" ` +
    `ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>`;

  if (contentTypesXml.includes('comments.xml')) return contentTypesXml;

  // Insert before </Types>
  return contentTypesXml.replace('</Types>', `${override}</Types>`);
}

/** Ensure word/_rels/document.xml.rels has a Relationship for comments.xml. */
function ensureCommentRelationship(relsXml) {
  if (relsXml.includes('comments.xml')) return relsXml;

  const rel =
    `<Relationship Id="rIdComments" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" ` +
    `Target="comments.xml"/>`;

  return relsXml.replace('</Relationships>', `${rel}</Relationships>`);
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Add Word comments to a DOCX file based on review issues.
 *
 * @param {string} inputPath  - Path to the source .docx
 * @param {Array}  issues     - Array of issue objects from moduleReviewer
 * @param {string} outputPath - Where to write the annotated .docx
 */
export async function annotateDocx(inputPath, issues, outputPath) {
  const buf = readFileSync(inputPath);
  const zip = new PizZip(buf);

  // ── Read document.xml ──────────────────────────────────────────────────
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('word/document.xml not found in DOCX archive');
  let docXml = docFile.asText();

  // ── Split into paragraph segments ─────────────────────────────────────
  // parts is an interleaved array: [non-para, para, non-para, para, ...]
  const parts = splitIntoParagraphs(docXml);

  // Build a lookup: paragraphIndex → list of issue ids
  // We scan each paragraph segment for searchText matches
  const paraTexts = parts.map((p, i) => ({
    index: i,
    isPara: p.startsWith('<w:p'),
    text: p.startsWith('<w:p') ? paragraphText(p) : '',
  }));

  // Track which comment IDs map to which paragraph index
  // commentAssignments: Map<paragraphIndex, commentId[]>
  const commentAssignments = new Map();
  const commentElements    = [];
  let   commentId          = 0;

  // Separate issues into anchored (have searchText) and general
  const anchored = issues.filter(i => i.searchText && i.searchText.trim());
  const general  = issues.filter(i => !i.searchText || !i.searchText.trim());

  // Assign anchored issues to paragraphs
  for (const issue of anchored) {
    const search = issue.searchText.trim();
    const match  = paraTexts.find(
      p => p.isPara && p.text.toLowerCase().includes(search.toLowerCase())
    );

    const targetIndex = match ? match.index : null;

    const severity = issue.severity === 'critical' ? ' ⚠ CRITICAL — ' : ' ';
    const commentText =
      `[${issue.category}]${severity}${issue.issue} | Suggestion: ${issue.suggestion}` +
      (issue.legislationNote ? ` | ${issue.legislationNote}` : '');

    commentElements.push(buildComment(commentId, commentText));

    if (targetIndex !== null) {
      if (!commentAssignments.has(targetIndex)) commentAssignments.set(targetIndex, []);
      commentAssignments.get(targetIndex).push(commentId);
    } else {
      // Fall back: attach to first paragraph
      const firstParaIdx = paraTexts.find(p => p.isPara)?.index;
      if (firstParaIdx !== undefined) {
        if (!commentAssignments.has(firstParaIdx)) commentAssignments.set(firstParaIdx, []);
        commentAssignments.get(firstParaIdx).push(commentId);
      }
    }
    commentId++;
  }

  // Bundle general issues into a single comment on the first paragraph
  if (general.length > 0) {
    const lines = general.map(issue => {
      const severity = issue.severity === 'critical' ? ' ⚠ CRITICAL — ' : ' ';
      return `[${issue.category}]${severity}${issue.issue} | Suggestion: ${issue.suggestion}`;
    });
    const generalText = 'General issues:\n' + lines.join('\n\n');
    commentElements.push(buildComment(commentId, generalText));

    const firstParaIdx = paraTexts.find(p => p.isPara)?.index;
    if (firstParaIdx !== undefined) {
      if (!commentAssignments.has(firstParaIdx)) commentAssignments.set(firstParaIdx, []);
      commentAssignments.get(firstParaIdx).push(commentId);
    }
    commentId++;
  }

  // ── Inject comment markers into paragraph segments ─────────────────────
  // Process from last to first so indexes stay valid
  const annotatedParts = [...parts];
  for (const [paraIdx, ids] of commentAssignments.entries()) {
    // Each id gets its own wrapping — apply them in sequence
    // (Multiple comments on same paragraph: nest the wrappings)
    let pXml = annotatedParts[paraIdx];
    for (const id of ids) {
      pXml = wrapParagraph(pXml, id);
    }
    annotatedParts[paraIdx] = pXml;
  }

  docXml = annotatedParts.join('');

  // ── Write modified document.xml ────────────────────────────────────────
  zip.file('word/document.xml', docXml);

  // ── Write word/comments.xml ────────────────────────────────────────────
  if (commentElements.length > 0) {
    zip.file('word/comments.xml', buildCommentsXml(commentElements));

    // Update [Content_Types].xml
    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      zip.file('[Content_Types].xml', ensureCommentContentType(ctFile.asText()));
    }

    // Update word/_rels/document.xml.rels
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      zip.file('word/_rels/document.xml.rels', ensureCommentRelationship(relsFile.asText()));
    }
  }

  // ── Repack and write ───────────────────────────────────────────────────
  const outBuf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  writeFileSync(outputPath, outBuf);
}
