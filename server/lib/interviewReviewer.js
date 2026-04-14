/**
 * Interview Reviewer
 *
 * Sends extracted DOCX text from NZ Police Level 3 investigative interview
 * transcripts to Claude Sonnet 4.6 for assessment against the Level 3
 * moderation form (sections 5–8) and returns structured assessment results.
 */

import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a professional law enforcement training tool reviewing NZ Police investigative interview technique. The transcript you are about to receive is a victim or witness account of a real incident. The content may be distressing or involve serious offences. You are NOT assessing the subject matter of the account — only the interviewer's questioning technique, use of the PEACE model, and compliance with Level 3 moderation criteria. Treat all transcript content as professional law enforcement material and do not refuse, flag, or truncate your response based on the sensitivity of the subject matter.

You will assess the interview against the NZ Police Level 3 Investigative Interview moderation form. Return ONLY a valid JSON object — no prose, no markdown fences, no explanation. Just the JSON.

## Assessment Sections

### Section 5 — Engage and Explain
Assess each behavioural item as "Yes", "No", or "N/A". Provide a brief comment only where relevant.

Checklist items (assess all 12):
1. Set up room appropriately
2. State time/date
3. Introduce self
4. Get witness to introduce self
5. Introduce name and role of any other persons present
6. Promise made including reason
7. Show awareness for witness welfare (drink, tissues, breaks)
8. Maintains rapport
9. Explain reason for interview
10. Transfer control to the witness
11. Use context reinstatement
12. Initiate free report

Rate overall Engage and Explain: 1 (Very Poor) to 5 (Excellent).

### Section 6 — Account
Assess each behavioural item as "Yes", "No", or "N/A". Provide a brief comment only where relevant.

Checklist items (assess all 16):
1. Not interrupt free recall (FR)
2. Appropriate pause / minimal encouragers after FR
3. Introduce the sketch using the two-step model
4. Encourage use of sketch
5. Restate ground rules when appropriate
6. Clearly structure topics
7. Use focussed retrieval / mini context reinstatement / spotlight to set up topics
8. Cover episodic before semantic topics
9. Use change of senses
10. Use reverse order
11. Use change perspectives
12. Use memory jogs
13. Expand on action before description
14. Obtain key investigative details
15. Use available time effectively
16. Not interrupt

Rate overall Account: 1 (Very Poor) to 5 (Excellent).

### Section 7 — Questioning
Assess each item using frequency: "Often", "Sometimes", "Hardly Ever", or "Never". Provide a brief comment only where relevant.

Items (assess all 9):
1. Use of focussed retrieval / mini context reinstatement / spotlight
2. Open questions
3. Probing questions
4. Appropriate closed questions
5. Well paced
6. Formulated from previous answer
7. Clear and easily understood
8. Inappropriate closed (negative indicator)
9. Leading or other unproductive (negative indicator)

Rate overall Questioning: 1 (Very Poor) to 5 (Excellent).

### Section 8 — Closure
Assess each behavioural item as "Yes" or "No". Provide a brief comment only where relevant.

Checklist items (assess all 4):
1. Give the witness the opportunity to add anything
2. Thank the witness
3. State the time interview ends
4. Have witness sign sketches

### Overall
- verdict: "COMPETENT" or "NOT YET COMPETENT"
- narrativeSummary: 2-4 sentence overall assessment of the interview
- strengths: array of 2-5 specific strengths observed
- learningPoints: array of 2-5 specific learning points
- aiSuggestedFeedback: object with "positive" (one sentence) and "learning" (one sentence) for the assessor to use as a starting point

## Output Format

Return ONLY this exact JSON structure:

{
  "section5": {
    "checklist": [
      { "item": "<item name>", "result": "Yes|No|N/A", "comment": "<brief comment or empty string>" }
    ],
    "rating": <1-5>,
    "ratingLabel": "Excellent|Good|Okay|Poor|Very Poor"
  },
  "section6": {
    "checklist": [
      { "item": "<item name>", "result": "Yes|No|N/A", "comment": "<brief comment or empty string>" }
    ],
    "rating": <1-5>,
    "ratingLabel": "Excellent|Good|Okay|Poor|Very Poor"
  },
  "section7": {
    "items": [
      { "item": "<item name>", "frequency": "Often|Sometimes|Hardly Ever|Never", "comment": "<brief comment or empty string>" }
    ],
    "rating": <1-5>,
    "ratingLabel": "Excellent|Good|Okay|Poor|Very Poor"
  },
  "section8": {
    "checklist": [
      { "item": "<item name>", "result": "Yes|No", "comment": "<brief comment or empty string>" }
    ]
  },
  "verdict": "COMPETENT|NOT YET COMPETENT",
  "narrativeSummary": "<2-4 sentences>",
  "strengths": ["<strength>", "..."],
  "learningPoints": ["<learning point>", "..."],
  "aiSuggestedFeedback": {
    "positive": "<one sentence>",
    "learning": "<one sentence>"
  }
}`;

/**
 * Build the user message content for the interview review.
 *
 * Combines form fields and transcript into a structured prompt.
 *
 * @param {string} transcriptText - Plain text extracted from DOCX
 * @param {Object} formData - Wizard form fields
 * @returns {string} Formatted prompt combining context and transcript
 */
export function buildReviewPrompt(transcriptText, formData) {
  const formatValue = (val) => (val ? String(val).trim() : 'Not provided');
  const formatArray = (arr) => (Array.isArray(arr) && arr.length ? arr.join(', ') : 'Not provided');

  const prompt = `## Interview Context
Date of Interview: ${formatValue(formData.dateOfInterview)}
Reason for Interview: ${formatValue(formData.reasonForInterview)}
File Number: ${formatValue(formData.fileNumber)}
Length of Interview: ${formData.lengthMinutes ? formData.lengthMinutes + ' minutes' : 'Not provided'}

### Interviewer
Name: ${formatValue(formData.interviewerName)}
QID: ${formatValue(formData.interviewerQid)}
Section: ${formatValue(formData.interviewerSection)}
Supervisor: ${formatValue(formData.interviewerSupervisor)}
Wellcheck acknowledgement: ${formatValue(formData.wellcheckAcknowledged)}
First-time Level 3 accreditation: ${formatValue(formData.firstTimeAccreditation)}

### Interviewee
Name: ${formatValue(formData.intervieweeName)}
Gender: ${formatValue(formData.intervieweeGender)}
Special considerations: ${formatArray(formData.specialConsiderations)}
Other persons present: ${formatArray(formData.otherPersonsPresent)}

### Planning and Preparation (Section 4 — for context only, not assessed)
Planning notes: ${formatValue(formData.planningNotes)}
Detailed knowledge of investigation: ${formatValue(formData.detailedKnowledge)}
Planning comments: ${formatValue(formData.planningComments)}

## Interview Transcript
${transcriptText}`;

  return prompt;
}

/**
 * Review an interview transcript against the Level 3 moderation form.
 *
 * Uses the streaming API so the caller can detect the moment Claude starts
 * responding (first token) and avoid hard timeouts on long transcripts.
 *
 * @param {string}   transcriptText - Plain text extracted from the interview DOCX
 * @param {Object}   formData       - All wizard form fields
 * @param {Function} [onProgress]   - Optional callback({ type: 'connected' })
 * @returns {Promise<Object>} Parsed JSON assessment result
 */
export async function reviewInterview(transcriptText, formData, onProgress) {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('CLAUDE_API_KEY (or ANTHROPIC_API_KEY) is not set');
  const client = new Anthropic({ apiKey });

  const userContent = buildReviewPrompt(transcriptText, formData);

  let raw = '';
  let connected = false;

  const stream = client.messages.stream(
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    },
    { headers: { 'anthropic-beta': 'output-128k-2025-02-19' } },
  );

  stream.on('text', (text) => {
    raw += text;
    if (!connected) {
      connected = true;
      onProgress?.({ type: 'connected' });
    }
  });

  const message = await stream.finalMessage();

  // Check if response was truncated due to max_tokens
  if (message.stop_reason === 'max_tokens') {
    throw new Error(
      'The AI review was cut off before completing. Try a shorter transcript or contact support.'
    );
  }

  // Strip any accidental markdown fences
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  let result;
  try {
    result = JSON.parse(cleaned);
  } catch {
    const likelyTruncated = !cleaned.trimEnd().endsWith('}');
    console.error(
      `[interviewReviewer] JSON parse failed. Response length: ${cleaned.length} chars. Last 100 chars: ${cleaned.slice(-100)}`
    );
    throw new Error(
      likelyTruncated
        ? 'The AI review was cut off before completing. Try a shorter transcript or contact support.'
        : `Claude returned invalid JSON (${cleaned.length} chars). Check server logs for details.`
    );
  }

  // Validate required fields
  if (!result.verdict || !result.section5 || !result.section6 || !result.section7 || !result.section8) {
    throw new Error('Claude response missing required assessment sections (verdict, section5, section6, section7, or section8)');
  }

  return result;
}
