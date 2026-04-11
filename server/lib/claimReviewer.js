import Anthropic from '@anthropic-ai/sdk';
import { fetchStatutoryText } from './legislation.js';

function getClient() {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('CLAUDE_API_KEY (or ANTHROPIC_API_KEY) is not set');
  return new Anthropic({ apiKey });
}

const SYSTEM = `You are a senior NZ Police detective reviewing training podcast material for legislative accuracy.

You will be given a claim from a podcast transcript and the actual statutory text from legislation.govt.nz (current in-force version). Compare them carefully and assign a category.

Categories:
- ACCURATE — correctly and sufficiently describes the law for a training context
- INACCURATE — factually wrong; contradicts what the statute actually says
- OVERSIMPLIFIED — not wrong, but removes a legally important distinction a detective needs to know
- MISSING CAVEAT — correct as far as it goes, but omits a significant exception, qualifier, or precondition
- WRONG SECTION — legal position is correct, but the section or Act cited is wrong
- OUTDATED LAW — reflects an older version; the Act has since been amended
- GOOD EXPLANATION — explains a complex legal concept unusually clearly and accurately
- AMBIGUOUS — wording could reasonably be understood two ways (one accurate, one not)

Apply the standard of a senior detective: would a detective acting on this explanation get the law right in the field?

Return ONLY valid JSON. No markdown, no explanation, no preamble.`;

const SCHEMA = `Return this exact JSON schema:
{
  "category": "ACCURATE",
  "finding": "Explanation of why this category was assigned, quoting the statutory text where relevant.",
  "correctStatement": "What should have been said, in plain language. Omit (set to null) for ACCURATE and GOOD EXPLANATION."
}`;

/**
 * Review a single claim against the legislation.
 * claim: { timestamp, quote, actsReferenced, sectionsReferenced }
 * Returns: { ...claim, category, finding, correctStatement, statutoryText, actPath, retrievedAt }
 */
export async function reviewClaim(claim) {
  const client = getClient();
  const actName = claim.actsReferenced?.[0] || 'unknown Act';
  const sectionNumber = claim.sectionsReferenced?.[0] || null;

  // Fetch statutory text
  let statutory;
  try {
    statutory = await fetchStatutoryText(actName, sectionNumber);
  } catch (err) {
    statutory = {
      actPath: actName,
      sectionText: `[Could not fetch legislation: ${err.message}]`,
      retrievedAt: new Date().toISOString().split('T')[0],
    };
  }

  const userMessage = `${SCHEMA}

---
PODCAST CLAIM:
Timestamp: ${claim.timestamp}
Quote: "${claim.quote}"
Acts referenced: ${claim.actsReferenced?.join(', ') || 'none specified'}
Sections referenced: ${claim.sectionsReferenced?.join(', ') || 'none specified'}

---
STATUTORY TEXT (legislation.govt.nz, current in-force):
Act path: ${statutory.actPath}
Retrieved: ${statutory.retrievedAt}

${statutory.sectionText}`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = msg.content?.find(b => b.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text content');
  const raw = textBlock.text.trim();
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let review;
  try {
    review = JSON.parse(json);
  } catch {
    review = {
      category: 'AMBIGUOUS',
      finding: `Could not parse review response: ${raw.slice(0, 200)}`,
      correctStatement: null,
    };
  }

  return {
    ...claim,
    ...review,
    statutoryText: statutory.sectionText,
    actPath: statutory.actPath,
    retrievedAt: statutory.retrievedAt,
  };
}
