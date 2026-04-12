/**
 * Legislation Verifier
 *
 * For LEGISLATION-category issues returned by Claude, this module fetches
 * the authoritative statutory text from legislation.govt.nz and appends it
 * as a `legislationNote` on each issue.  This makes LEGISLATION findings
 * authoritative rather than relying solely on Claude's training knowledge.
 *
 * If LEGISLATION_API_KEY is not set, or a fetch fails, the issue is returned
 * unchanged — the job is never failed due to a verification error.
 */

import { fetchStatutoryText } from './legislation.js';

// Matches: "Crimes Act 1961", "Arms Act 1983", "Search and Surveillance Act 2012" etc.
const ACT_RE  = /([A-Z][A-Za-z\s']+Act\s+\d{4})/;
// Matches: "s267(1)(a)", "Section 267(1)", "s 217", "section 216A"
const SEC_RE  = /[Ss](?:ection\s+)?(\d+[A-Za-z]?(?:\(\d+\))*(?:\([a-z]\))*)/;

function extractReference(text) {
  const actMatch = text.match(ACT_RE);
  const secMatch = text.match(SEC_RE);

  const actName     = actMatch ? actMatch[1].trim() : null;
  // Strip sub-section qualifiers — legislation.govt.nz uses top-level section numbers
  const sectionNum  = secMatch ? secMatch[1].replace(/\(.*$/, '') : null;

  return { actName, sectionNum };
}

/**
 * Verify LEGISLATION-category issues against legislation.govt.nz.
 *
 * @param {Array} issues - Only LEGISLATION issues (already filtered by caller)
 * @returns {Promise<Array>} Same issues, with `legislationNote` added where possible
 */
export async function verifyLegislationIssues(issues) {
  const apiKey = process.env.LEGISLATION_API_KEY || process.env.Legislation_API_KEY;
  if (!apiKey) {
    console.warn('[legislationVerifier] LEGISLATION_API_KEY not set — skipping');
    return issues;
  }

  const results = [];

  for (const issue of issues) {
    const combined = `${issue.issue || ''} ${issue.suggestion || ''} ${issue.searchText || ''}`;
    const { actName, sectionNum } = extractReference(combined);

    if (!actName) {
      // Can't identify the Act — pass through unchanged
      results.push(issue);
      continue;
    }

    try {
      const { sectionText, retrievedAt } = await fetchStatutoryText(actName, sectionNum);

      // Bracket-prefixed text means "not found" or "act not in our list" — still include it
      const truncated = sectionText.length > 600
        ? sectionText.slice(0, 600) + '…'
        : sectionText;

      results.push({
        ...issue,
        legislationNote: `Statutory text as at ${retrievedAt} (legislation.govt.nz): ${truncated}`,
      });
    } catch (err) {
      console.warn(`[legislationVerifier] Could not fetch ${actName} s${sectionNum}:`, err.message);
      results.push(issue);
    }
  }

  return results;
}
