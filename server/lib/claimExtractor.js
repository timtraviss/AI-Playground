import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const SYSTEM = `You are a legislative accuracy analyst specialising in NZ Police law.

Read the podcast transcript and extract EVERY passage that makes a claim about NZ law, including:
- References to a specific Act, section, or subsection
- Statements about what the law requires, permits, or prohibits
- Legal elements of an offence or power
- Legal standards or thresholds (e.g. "reasonable grounds to suspect")
- Penalties, consequences, or procedures required by law
- Explanations of legal concepts

Return ONLY valid JSON — an array of claim objects. No markdown, no explanation, no preamble.`;

const SCHEMA = `Return this exact JSON schema:
[
  {
    "timestamp": "00:03:42",
    "quote": "exact words from transcript",
    "actsReferenced": ["Crimes Act 1961"],
    "sectionsReferenced": ["188"]
  }
]

Rules:
- "timestamp" — use the Whisper timestamp nearest the start of the quote. If no timestamps, use "unknown".
- "quote" — copy the relevant sentence(s) verbatim from the transcript.
- "actsReferenced" — list every Act mentioned by name in or near this claim. Use official short titles (e.g. "Crimes Act 1961"). If no Act is named but a legal concept is described, include your best inference in square brackets e.g. ["[Crimes Act 1961 — inferred]"].
- "sectionsReferenced" — list section numbers as strings (e.g. ["188", "189A"]). Empty array if no section number mentioned.
- Include claims about general legal principles even if no section number is given.`;

/**
 * Extract legislative claims from a Whisper transcript.
 * Returns an array of claim objects.
 */
export async function extractClaims(transcript) {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `${SCHEMA}\n\n---\nTRANSCRIPT:\n${transcript}`,
      },
    ],
  });

  const textBlock = msg.content?.find(b => b.type === 'text');
  if (!textBlock) throw new Error('Claude returned no text content');
  const raw = textBlock.text.trim();

  // Strip markdown fences if present
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  try {
    const claims = JSON.parse(json);
    if (!Array.isArray(claims)) throw new Error('Expected array');
    return claims;
  } catch (err) {
    throw new Error(`Claim extraction returned invalid JSON: ${err.message}\n\nRaw: ${raw.slice(0, 500)}`);
  }
}
