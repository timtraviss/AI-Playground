/**
 * L3 Investigative Interview Report Generator
 *
 * Exports:
 *   ratingLabel(n)                    — numeric rating → descriptive label
 *   buildMarkdownReport(form, review) — returns a Markdown string
 *   buildDocxBuffer(form, review)     — returns a Buffer containing a .docx file
 */

import PizZip from 'pizzip';

// ── Rating label ───────────────────────────────────────────────────────────────

const RATING_LABELS = {
  1: 'Very Poor',
  2: 'Poor',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent',
};

export function ratingLabel(n) {
  return RATING_LABELS[n] ?? String(n);
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function val(v) {
  if (v === null || v === undefined || v === '') return 'Not provided';
  if (Array.isArray(v)) return v.length > 0 ? v.join(', ') : 'Not provided';
  return String(v);
}

// ── Markdown builder ───────────────────────────────────────────────────────────

function checkRow(item) {
  const assessment = item.comment
    ? `${item.result} — ${item.comment}`
    : item.result;
  return `| ${item.item} | ${assessment} |`;
}

function freqRow(item) {
  const freq = item.comment
    ? `${item.frequency} — ${item.comment}`
    : item.frequency;
  return `| ${item.item} | ${freq} |`;
}

function mdTable(headers, rows) {
  const sep = headers.map(() => '---').join(' | ');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${sep} |`,
    ...rows,
  ].join('\n');
}

function sectionChecklist(title, sectionData, isFrequency = false) {
  const rating = sectionData.rating
    ? `**Overall rating: ${sectionData.rating}/5 — ${sectionData.ratingLabel ?? ratingLabel(sectionData.rating)}**`
    : '';

  const items = isFrequency ? (sectionData.items ?? []) : (sectionData.checklist ?? []);
  const col2 = isFrequency ? 'Frequency' : 'Assessment';
  const rowFn = isFrequency ? freqRow : checkRow;

  const table = items.length > 0
    ? mdTable(['Item', col2], items.map(rowFn))
    : '_No items recorded._';

  return [rating, table].filter(Boolean).join('\n\n');
}

export function buildMarkdownReport(formData, review) {
  const f = formData;
  const r = review;

  const lines = [];

  // Title
  lines.push('# NZ Police Level 3 Investigative Interview Assessment');
  lines.push('');

  // Verdict
  lines.push(`**Verdict: ${val(r.verdict)}**`);
  lines.push('');

  // Narrative summary
  if (r.narrativeSummary) {
    lines.push(r.narrativeSummary);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Interview Details
  lines.push('## Interview Details');
  lines.push('');
  lines.push(mdTable(
    ['Field', 'Value'],
    [
      `| Date of Interview | ${val(f.dateOfInterview)} |`,
      `| Reason for Interview | ${val(f.reasonForInterview)} |`,
      `| File Number | ${val(f.fileNumber)} |`,
      `| Length (minutes) | ${val(f.lengthMinutes)} |`,
    ],
  ));
  lines.push('');

  // Section 1 — Interviewer
  lines.push('## Section 1 — Interviewer');
  lines.push('');
  lines.push(mdTable(
    ['Field', 'Value'],
    [
      `| Name | ${val(f.interviewerName)} |`,
      `| QID | ${val(f.interviewerQid)} |`,
      `| Section | ${val(f.interviewerSection)} |`,
      `| Supervisor | ${val(f.interviewerSupervisor)} |`,
      `| Wellcheck Acknowledged | ${val(f.wellcheckAcknowledged)} |`,
      `| First Time Accreditation | ${val(f.firstTimeAccreditation)} |`,
    ],
  ));
  lines.push('');

  // Section 2 — Assessor
  lines.push('## Section 2 — Assessor');
  lines.push('');
  lines.push(mdTable(
    ['Field', 'Value'],
    [
      `| Name | ${val(f.assessorName)} |`,
      `| QID | ${val(f.assessorQid)} |`,
      `| Date Evaluated | ${val(f.dateEvaluated)} |`,
      `| Date Feedback Given | ${val(f.dateFeedbackGiven)} |`,
    ],
  ));
  lines.push('');

  // Section 3 — Interviewee
  lines.push('## Section 3 — Interviewee');
  lines.push('');
  lines.push(mdTable(
    ['Field', 'Value'],
    [
      `| Name | ${val(f.intervieweeName)} |`,
      `| Gender | ${val(f.intervieweeGender)} |`,
      `| Special Considerations | ${val(f.specialConsiderations)} |`,
      `| Other Persons Present | ${val(f.otherPersonsPresent)} |`,
      `| Supporting Documents | ${val(f.supportingDocuments)} |`,
    ],
  ));
  lines.push('');

  // Section 4 — Planning and Preparation
  lines.push('## Section 4 — Planning and Preparation');
  lines.push('');
  lines.push(`**Planning Notes:** ${val(f.planningNotes)}`);
  lines.push('');
  lines.push(`**Detailed Knowledge:** ${val(f.detailedKnowledge)}`);
  lines.push('');
  lines.push(`**Planning Comments:** ${val(f.planningComments)}`);
  lines.push('');

  lines.push('---');
  lines.push('');

  // Section 5 — Engage and Explain
  lines.push('## Section 5 — Engage and Explain');
  lines.push('');
  lines.push(sectionChecklist('Section 5', r.section5 ?? {}));
  lines.push('');

  // Section 6 — Account
  lines.push('## Section 6 — Account');
  lines.push('');
  lines.push(sectionChecklist('Section 6', r.section6 ?? {}));
  lines.push('');

  // Section 7 — Questioning
  lines.push('## Section 7 — Questioning');
  lines.push('');
  lines.push(sectionChecklist('Section 7', r.section7 ?? {}, true));
  lines.push('');

  // Section 8 — Closure
  lines.push('## Section 8 — Closure');
  lines.push('');
  const s8items = r.section8?.checklist ?? [];
  const s8table = s8items.length > 0
    ? mdTable(['Item', 'Assessment'], s8items.map(checkRow))
    : '_No items recorded._';
  lines.push(s8table);
  lines.push('');

  lines.push('---');
  lines.push('');

  // Strengths
  lines.push('## Strengths');
  lines.push('');
  if (Array.isArray(r.strengths) && r.strengths.length > 0) {
    r.strengths.forEach(s => lines.push(`- ${s}`));
  } else {
    lines.push('_None recorded._');
  }
  lines.push('');

  // Learning Points
  lines.push('## Learning Points');
  lines.push('');
  if (Array.isArray(r.learningPoints) && r.learningPoints.length > 0) {
    r.learningPoints.forEach(lp => lines.push(`- ${lp}`));
  } else {
    lines.push('_None recorded._');
  }
  lines.push('');

  // AI-Suggested Assessor Feedback
  lines.push('## AI-Suggested Assessor Feedback');
  lines.push('');
  if (r.aiSuggestedFeedback) {
    lines.push(`**Positive:** ${val(r.aiSuggestedFeedback.positive)}`);
    lines.push('');
    lines.push(`**Learning:** ${val(r.aiSuggestedFeedback.learning)}`);
    lines.push('');
  }

  // Section 9 — Evaluation
  lines.push('## Section 9 — Evaluation');
  lines.push('');
  lines.push(`**Enquiries Identified:** ${val(f.enquiriesIdentified)}`);
  lines.push('');
  lines.push(`**What Went Well:** ${val(f.whatWentWell)}`);
  lines.push('');
  lines.push(`**Learning Points Identified by Interviewer:** ${val(f.learningPoints)}`);
  lines.push('');
  lines.push(`**Assessor Positive Feedback:** ${val(f.assessorPositiveFeedback)}`);
  lines.push('');
  lines.push(`**Assessor Learning Points:** ${val(f.assessorLearningPoints)}`);
  lines.push('');
  if (f.learningDevelopmentPlan) {
    lines.push(`**Learning & Development Plan:** ${f.learningDevelopmentPlan}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Final outcome
  lines.push(`**Overall Outcome: ${val(r.verdict)}**`);

  return lines.join('\n');
}

// ── DOCX builder ───────────────────────────────────────────────────────────────

function xmlEsc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function para(text, opts = {}) {
  const { bold = false, size = null, color = null } = opts;
  const rPr = [
    bold ? '<w:b/>' : '',
    size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : '',
    color ? `<w:color w:val="${color}"/>` : '',
  ].join('');

  return (
    `<w:p>` +
    `<w:r>` +
    (rPr ? `<w:rPr>${rPr}</w:rPr>` : '') +
    `<w:t xml:space="preserve">${xmlEsc(text)}</w:t>` +
    `</w:r>` +
    `</w:p>`
  );
}

const BORDER_XML =
  `<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>` +
  `<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>` +
  `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>` +
  `<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;

function cell(text, opts = {}) {
  const { shade = null, bold = false } = opts;
  const tcPr = shade
    ? `<w:tcPr><w:tcBorders>${BORDER_XML}</w:tcBorders><w:shd w:val="clear" w:color="auto" w:fill="${shade}"/></w:tcPr>`
    : `<w:tcPr><w:tcBorders>${BORDER_XML}</w:tcBorders></w:tcPr>`;
  const rPr = bold ? `<w:rPr><w:b/></w:rPr>` : '';
  return (
    `<w:tc>${tcPr}` +
    `<w:p><w:r>${rPr}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>` +
    `</w:tc>`
  );
}

function tableRow(label, value) {
  return `<w:tr>${cell(label, { bold: true })}${cell(value)}</w:tr>`;
}

function checklistHeader(col2Label) {
  return (
    `<w:tr>` +
    cell('Item', { shade: 'D9D9D9', bold: true }) +
    cell(col2Label, { shade: 'D9D9D9', bold: true }) +
    cell('Comment', { shade: 'D9D9D9', bold: true }) +
    `</w:tr>`
  );
}

function checklistRow(item) {
  return (
    `<w:tr>` +
    cell(item.item ?? '') +
    cell(item.result ?? item.frequency ?? '') +
    cell(item.comment ?? '') +
    `</w:tr>`
  );
}

function table(...rows) {
  return (
    `<w:tbl>` +
    `<w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>` +
    rows.join('') +
    `</w:tbl>`
  );
}

export function buildDocxBuffer(formData, review) {
  const f = formData;
  const r = review;

  const verdictColor = r.verdict === 'COMPETENT' ? '00703C' : 'C0392B';

  const bodyParts = [];

  // Title
  bodyParts.push(para('NZ Police Level 3 Investigative Interview Assessment', { bold: true, size: '32' }));

  // Verdict
  bodyParts.push(para(`Verdict: ${val(r.verdict)}`, { bold: true, size: '28', color: verdictColor }));

  // Narrative
  if (r.narrativeSummary) {
    bodyParts.push(para(r.narrativeSummary));
  }

  // Interview Details
  bodyParts.push(para('Interview Details', { bold: true, size: '28' }));
  bodyParts.push(table(
    tableRow('Date of Interview', val(f.dateOfInterview)),
    tableRow('Reason for Interview', val(f.reasonForInterview)),
    tableRow('File Number', val(f.fileNumber)),
    tableRow('Length (minutes)', val(f.lengthMinutes)),
  ));

  // Section 1
  bodyParts.push(para('Section 1 — Interviewer', { bold: true, size: '28' }));
  bodyParts.push(table(
    tableRow('Name', val(f.interviewerName)),
    tableRow('QID', val(f.interviewerQid)),
    tableRow('Section', val(f.interviewerSection)),
    tableRow('Supervisor', val(f.interviewerSupervisor)),
    tableRow('Wellcheck Acknowledged', val(f.wellcheckAcknowledged)),
    tableRow('First Time Accreditation', val(f.firstTimeAccreditation)),
  ));

  // Section 2
  bodyParts.push(para('Section 2 — Assessor', { bold: true, size: '28' }));
  bodyParts.push(table(
    tableRow('Name', val(f.assessorName)),
    tableRow('QID', val(f.assessorQid)),
    tableRow('Date Evaluated', val(f.dateEvaluated)),
    tableRow('Date Feedback Given', val(f.dateFeedbackGiven)),
  ));

  // Section 3
  bodyParts.push(para('Section 3 — Interviewee', { bold: true, size: '28' }));
  bodyParts.push(table(
    tableRow('Name', val(f.intervieweeName)),
    tableRow('Gender', val(f.intervieweeGender)),
    tableRow('Special Considerations', val(f.specialConsiderations)),
    tableRow('Other Persons Present', val(f.otherPersonsPresent)),
    tableRow('Supporting Documents', val(f.supportingDocuments)),
  ));

  // Section 4
  bodyParts.push(para('Section 4 — Planning and Preparation', { bold: true, size: '28' }));
  bodyParts.push(para(`Planning Notes: ${val(f.planningNotes)}`));
  bodyParts.push(para(`Detailed Knowledge: ${val(f.detailedKnowledge)}`));
  bodyParts.push(para(`Planning Comments: ${val(f.planningComments)}`));

  // Section 5
  bodyParts.push(para('Section 5 — Engage and Explain', { bold: true, size: '28' }));
  if (r.section5?.rating) {
    bodyParts.push(para(`Overall rating: ${r.section5.rating}/5 — ${r.section5.ratingLabel ?? ratingLabel(r.section5.rating)}`, { bold: true }));
  }
  if ((r.section5?.checklist ?? []).length > 0) {
    bodyParts.push(table(
      checklistHeader('Assessment'),
      ...(r.section5.checklist.map(checklistRow)),
    ));
  }

  // Section 6
  bodyParts.push(para('Section 6 — Account', { bold: true, size: '28' }));
  if (r.section6?.rating) {
    bodyParts.push(para(`Overall rating: ${r.section6.rating}/5 — ${r.section6.ratingLabel ?? ratingLabel(r.section6.rating)}`, { bold: true }));
  }
  if ((r.section6?.checklist ?? []).length > 0) {
    bodyParts.push(table(
      checklistHeader('Assessment'),
      ...(r.section6.checklist.map(checklistRow)),
    ));
  }

  // Section 7
  bodyParts.push(para('Section 7 — Questioning', { bold: true, size: '28' }));
  if (r.section7?.rating) {
    bodyParts.push(para(`Overall rating: ${r.section7.rating}/5 — ${r.section7.ratingLabel ?? ratingLabel(r.section7.rating)}`, { bold: true }));
  }
  if ((r.section7?.items ?? []).length > 0) {
    bodyParts.push(table(
      checklistHeader('Frequency'),
      ...(r.section7.items.map(checklistRow)),
    ));
  }

  // Section 8
  bodyParts.push(para('Section 8 — Closure', { bold: true, size: '28' }));
  if ((r.section8?.checklist ?? []).length > 0) {
    bodyParts.push(table(
      checklistHeader('Assessment'),
      ...(r.section8.checklist.map(checklistRow)),
    ));
  }

  // Strengths
  bodyParts.push(para('Strengths', { bold: true, size: '28' }));
  if (Array.isArray(r.strengths) && r.strengths.length > 0) {
    r.strengths.forEach(s => bodyParts.push(para(`• ${s}`)));
  }

  // Learning Points
  bodyParts.push(para('Learning Points', { bold: true, size: '28' }));
  if (Array.isArray(r.learningPoints) && r.learningPoints.length > 0) {
    r.learningPoints.forEach(lp => bodyParts.push(para(`• ${lp}`)));
  }

  // AI-Suggested Feedback
  if (r.aiSuggestedFeedback) {
    bodyParts.push(para('AI-Suggested Assessor Feedback', { bold: true, size: '28' }));
    bodyParts.push(para(`Positive: ${val(r.aiSuggestedFeedback.positive)}`));
    bodyParts.push(para(`Learning: ${val(r.aiSuggestedFeedback.learning)}`));
  }

  // Section 9
  bodyParts.push(para('Section 9 — Evaluation', { bold: true, size: '28' }));
  bodyParts.push(para(`Enquiries Identified: ${val(f.enquiriesIdentified)}`));
  bodyParts.push(para(`What Went Well: ${val(f.whatWentWell)}`));
  bodyParts.push(para(`Learning Points Identified by Interviewer: ${val(f.learningPoints)}`));
  bodyParts.push(para(`Assessor Positive Feedback: ${val(f.assessorPositiveFeedback)}`));
  bodyParts.push(para(`Assessor Learning Points: ${val(f.assessorLearningPoints)}`));
  if (f.learningDevelopmentPlan) {
    bodyParts.push(para(`Learning & Development Plan: ${f.learningDevelopmentPlan}`));
  }

  // Final verdict
  bodyParts.push(para(`Overall Outcome: ${val(r.verdict)}`, { bold: true, size: '28', color: verdictColor }));

  // ── Build DOCX archive ─────────────────────────────────────────────────────

  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document ${NS} ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<w:body>` +
    bodyParts.join('') +
    `</w:body>` +
    `</w:document>`;

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const relsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const docRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `</Relationships>`;

  const zip = new PizZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', relsXml);
  zip.file('word/_rels/document.xml.rels', docRelsXml);
  zip.file('word/document.xml', documentXml);

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
