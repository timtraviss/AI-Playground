import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const peaceReferencePath = resolve(__dirname, '../data/peace-reference.md');

let peaceReference = null;
function getPeaceReference() {
  if (!peaceReference) {
    try {
      peaceReference = readFileSync(peaceReferencePath, 'utf8');
    } catch {
      peaceReference = 'PEACE model reference document not available.';
    }
  }
  return peaceReference;
}

/**
 * Generate a structured PEACE model critique of a completed interview.
 *
 * @param {string} formattedTranscript - Output of formatTranscriptForCritique()
 * @param {Object} witness - Full witness JSON object
 * @returns {Promise<Object>} Structured critique object
 */
export async function generateCritique(formattedTranscript, witness) {
  const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

  const peaceRef = getPeaceReference();

  // Summarise what the witness knew at each tier for the prompt
  const tierSummary = `
TIER 1 (freely shared):
${witness.knowledgeLevels.freely_shares.map(f => `- ${f}`).join('\n')}

TIER 2 (required open questions):
${witness.knowledgeLevels.shares_with_open_questions.map(f => `- ${f}`).join('\n')}

TIER 3 (required skilled TEDS probing):
${witness.knowledgeLevels.shares_only_under_good_teds_questioning.map(f => `- ${f}`).join('\n')}

TIER 4 (required careful direct questioning):
${witness.knowledgeLevels.never_shares_unprompted.map(f => `- ${f}`).join('\n')}

ALL KEY FACTS (${witness.keyFacts.totalKeyFacts} total):
${witness.keyFacts.factList.map((f, i) => `${i + 1}. ${f}`).join('\n')}
`.trim();

  const systemMessage = `You are an expert evaluator of investigative interviewing technique, trained in the New Zealand Police PEACE model and cognitive interview research. You assess student practice interviews and provide structured, specific, and encouraging critique.

Your evaluation is grounded in the following reference document:

---
${peaceRef}
---

When evaluating, always:
- Quote specific lines from the transcript to support your points
- Be specific about what was good and what could be improved
- Suggest concrete alternative phrasings for improvements
- Be encouraging but honest — a "Pass" is meaningful, not a consolation
- Only score the phases that actually occurred in the interview (Planning happens before the interview, so don't score it)

Respond ONLY with valid JSON. No preamble, no explanation outside the JSON.`;

  const userMessage = `Below is a complete transcript of a practice investigative interview conducted by a student. The student played the role of an interviewer; the witness was ${witness.persona.name} (${witness.persona.role}, ${witness.persona.organization}).

## Witness Scenario
Incident: ${witness.scenario.incident}
Location: ${witness.scenario.location}
Discovered: ${witness.scenario.discoveredAt}

## What the Witness Knew (Tiered Disclosure)
${tierSummary}

## Interview Transcript
${formattedTranscript}

## Your Task
Evaluate this interview and return a JSON object with EXACTLY this structure (fill in all fields):

{
  "overallScore": <integer 0-100>,
  "overallBand": <"Distinction" (85+) | "Merit" (70-84) | "Pass" (55-69) | "Not Yet" (<55)>,
  "phaseScores": {
    "engageExplain": {
      "score": <integer 0-100>,
      "notes": "<2-3 sentences about rapport-building, explaining the process, and putting the witness at ease>"
    },
    "account": {
      "score": <integer 0-100>,
      "notes": "<2-3 sentences about how well the student elicited the account using open/TEDS questions>"
    },
    "closure": {
      "score": <integer 0-100>,
      "notes": "<1-2 sentences about how the interview was concluded>"
    }
  },
  "questioningTechnique": {
    "tedsCount": <integer — number of open/TEDS questions (Tell, Explain, Describe, Show, Walk me through, What happened...)>,
    "leadingCount": <integer — number of leading questions that suggested an answer>,
    "closedCount": <integer — number of closed yes/no questions>,
    "tedsScore": <integer 0-100 — overall quality of questioning technique>,
    "notes": "<2-3 sentences about the student's overall questioning style and its impact on the witness>"
  },
  "keyFactsElicited": {
    "totalPossible": ${witness.keyFacts.totalKeyFacts},
    "totalElicited": <integer — how many of the ${witness.keyFacts.totalKeyFacts} key facts did the student draw out?>,
    "facts": [
${witness.keyFacts.factList.map(f => `      { "fact": "${f.replace(/"/g, '\\"')}", "elicited": <true|false>, "method": "<how it was elicited, or null if not>" }`).join(',\n')}
    ]
  },
  "strengths": [
    "<specific strength with transcript quote>",
    "<specific strength with transcript quote>",
    "<specific strength with transcript quote>"
  ],
  "improvements": [
    {
      "issue": "<specific problem>",
      "suggestion": "<concrete fix>",
      "example": "<example of better phrasing the student could have used>"
    }
  ],
  "questionAnnotations": [
    {
      "turnNumber": <turn number from transcript>,
      "question": "<the student's question or statement>",
      "type": "<TEDS | leading | closed | rapport | procedural | other>",
      "quality": "<excellent | good | fair | poor>",
      "note": "<1 sentence evaluation>"
    }
  ],
  "summary": "<3-4 sentence narrative summary of the student's overall performance, ending with one forward-looking encouragement>"
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      { role: 'user', content: userMessage }
    ],
    system: systemMessage,
  });

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Claude response was truncated — increase max_tokens');
  }
  const textBlock = response.content?.find(b => b.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text content');
  const content = textBlock.text.trim();

  // Strip markdown code fences if Claude wrapped the JSON
  const jsonStr = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Claude returned invalid JSON: ${err.message}\n\nRaw response:\n${content.substring(0, 500)}`);
  }
}
