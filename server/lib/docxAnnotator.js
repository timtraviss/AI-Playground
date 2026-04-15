/**
 * DOCX Comment + Tracked Change Annotator
 *
 * Uses pizzip to open a DOCX archive, inject Word comments and tracked changes
 * for each review issue found by Claude, and repack the archive.
 *
 * Comments are added at paragraph level: each issue is anchored to the first
 * paragraph whose plain-text content contains the issue's searchText. Issues
 * with no searchText (or unmatched text) are bundled into a general comment on
 * the opening paragraph.
 *
 * Tracked changes (w:del / w:ins pairs) are injected at run level inside the
 * same paragraph when the issue provides originalText + suggestedText.
 * Tracked changes live directly in document.xml — no new files are needed.
 */

import PizZip from 'pizzip';
import { readFileSync, writeFileSync } from 'fs';

const AUTHOR = 'Reviewer';
const DATE   = new Date().toISOString().slice(0, 19) + 'Z';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Escape special XML characters in a plain-text string. */
function xmlEscape(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  const escaped = xmlEscape(text);

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

/**
 * Scan the document XML for the highest existing w:id value so our new
 * tracked-change IDs start above it and don't collide with anything Word
 * already has in the document (existing comments, tracked changes, bookmarks).
 */
function maxExistingId(docXml) {
  let max = 0;
  const re = /\bw:id="(\d+)"/g;
  let m;
  while ((m = re.exec(docXml)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

/**
 * Inject a tracked deletion + insertion into a paragraph at run level.
 *
 * Finds originalText inside a single <w:r> run, splits that run into
 * before / deleted / inserted / after parts, and returns the modified
 * paragraph XML.  If the text is not found in any run, the paragraph
 * is returned unchanged (the comment will still be applied).
 *
 * @param {string} pXml         - The <w:p>…</w:p> XML to modify
 * @param {string} originalText - Verbatim text to strike through
 * @param {string} suggestedText - Replacement text to insert
 * @param {number} delId        - Unique w:id for the <w:del> element
 * @param {number} insId        - Unique w:id for the <w:ins> element
 * @returns {string} Modified paragraph XML
 */
function injectTrackedChange(pXml, originalText, suggestedText, delId, insId) {
  // Match individual runs — <w:r> elements do not nest so lazy matching is safe.
  // Captures: (1) opening tag, (2) inner XML, (3) closing tag.
  const runRegex = /(<w:r(?:\s[^>]*)?>)([\s\S]*?)(<\/w:r>)/g;
  let m;

  while ((m = runRegex.exec(pXml)) !== null) {
    const fullRun  = m[0];
    const openTag  = m[1];
    const innerXml = m[2];

    // Find the text node inside this run
    const tMatch = /<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>/.exec(innerXml);
    if (!tMatch) continue;

    const runText = tMatch[1];
    const pos = runText.toLowerCase().indexOf(originalText.toLowerCase());
    if (pos === -1) continue;

    // Exact casing from the document for the deletion
    const exact  = runText.slice(pos, pos + originalText.length);
    const before = runText.slice(0, pos);
    const after  = runText.slice(pos + originalText.length);

    // Preserve run properties (bold, italic, etc.) in the new runs
    const rPrMatch = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(innerXml);
    const rPr = rPrMatch ? rPrMatch[0] : '';

    let replacement = '';

    // Text that precedes the change — keep in original run
    if (before) {
      replacement += `${openTag}${rPr}<w:t xml:space="preserve">${xmlEscape(before)}</w:t></w:r>`;
    }

    // Deletion (struck-through in Track Changes view)
    replacement +=
      `<w:del w:id="${delId}" w:author="${xmlEscape(AUTHOR)}" w:date="${DATE}">` +
        `<w:r>${rPr}<w:delText>${xmlEscape(exact)}</w:delText></w:r>` +
      `</w:del>`;

    // Insertion (underlined in Track Changes view)
    replacement +=
      `<w:ins w:id="${insId}" w:author="${xmlEscape(AUTHOR)}" w:date="${DATE}">` +
        `<w:r>${rPr}<w:t>${xmlEscape(suggestedText)}</w:t></w:r>` +
      `</w:ins>`;

    // Text that follows the change — keep in a new run with same formatting
    if (after) {
      replacement += `${openTag}${rPr}<w:t xml:space="preserve">${xmlEscape(after)}</w:t></w:r>`;
    }

    // Replace exactly the matched run and return — one change per call
    return pXml.slice(0, m.index) + replacement + pXml.slice(m.index + fullRun.length);
  }

  return pXml; // originalText not found in any run — leave paragraph unchanged
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
 * Add Word comments and tracked changes to a DOCX file based on review issues.
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

  // Build paragraph metadata once — used for both tracked changes and comments
  const paraTexts = parts.map((p, i) => ({
    index: i,
    isPara: p.startsWith('<w:p'),
    text: p.startsWith('<w:p') ? paragraphText(p) : '',
  }));

  // ── Step 1: Inject tracked changes (del/ins) at run level ─────────────
  // Must happen before comment wrapping so the run-level XML is still clean.
  // IDs for w:del and w:ins must not collide with existing w:id values in
  // the document (comments, bookmarks, existing tracked changes).
  const annotatedParts = [...parts];
  let changeId = maxExistingId(docXml) + 1;

  for (const issue of issues) {
    const orig = issue.originalText?.trim();
    const sugg = issue.suggestedText;
    if (!orig || sugg == null) continue; // no tracked change for this issue

    // Find the best paragraph to inject into:
    // prefer searchText match, fall back to originalText match
    const searchStr = issue.searchText?.trim() || orig;
    const match = paraTexts.find(
      p => p.isPara && p.text.toLowerCase().includes(searchStr.toLowerCase())
    ) || paraTexts.find(
      p => p.isPara && p.text.toLowerCase().includes(orig.toLowerCase())
    );

    if (!match) continue;

    const modified = injectTrackedChange(
      annotatedParts[match.index],
      orig,
      sugg,
      changeId,      // w:id for <w:del>
      changeId + 1,  // w:id for <w:ins>
    );

    if (modified !== annotatedParts[match.index]) {
      annotatedParts[match.index] = modified;
      changeId += 2;
    }
  }

  // ── Step 2: Assign comments to paragraphs ─────────────────────────────
  // commentAssignments: Map<paragraphIndex, commentId[]>
  const commentAssignments = new Map();
  const commentElements    = [];
  let   commentId          = 0;

  const anchored = issues.filter(i => i.searchText && i.searchText.trim());
  const general  = issues.filter(i => !i.searchText || !i.searchText.trim());

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
      const firstParaIdx = paraTexts.find(p => p.isPara)?.index;
      if (firstParaIdx !== undefined) {
        if (!commentAssignments.has(firstParaIdx)) commentAssignments.set(firstParaIdx, []);
        commentAssignments.get(firstParaIdx).push(commentId);
      }
    }
    commentId++;
  }

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

  // ── Step 3: Inject comment markers into paragraph segments ─────────────
  for (const [paraIdx, ids] of commentAssignments.entries()) {
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

    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      zip.file('[Content_Types].xml', ensureCommentContentType(ctFile.asText()));
    }

    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      zip.file('word/_rels/document.xml.rels', ensureCommentRelationship(relsFile.asText()));
    }
  }

  // ── Repack and write ───────────────────────────────────────────────────
  const outBuf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  writeFileSync(outputPath, outBuf);
}
