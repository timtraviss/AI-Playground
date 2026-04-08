# P.E.A.C.E. Model — Feedback Format Documentation

This document describes how post-interview feedback is generated, structured, and displayed in the P.E.A.C.E. Model Investigative Interviewing Tutor.

---

## Overview

After a student ends an interview, the app automatically:

1. Retrieves the full conversation transcript from ElevenLabs
2. Sends it to Claude (Sonnet 4.6) alongside the witness scenario and the NZ Police PEACE reference document
3. Receives a structured JSON critique
4. Renders it as an interactive feedback screen

The entire process takes 10–20 seconds and is shown with animated progress steps: *Retrieving transcript → Evaluating technique → Generating feedback.*

---

## Feedback Sections

### 1. Overall Score

An animated circular ring counter counts up to the student's score (0–100). The ring changes colour depending on the band achieved.

| Band | Score Range | Ring Colour |
|---|---|---|
| Distinction | 85–100 | Gold |
| Merit | 70–84 | Blue |
| Pass | 55–69 | Green |
| Not Yet | 0–54 | Red |

Below the ring, a 3–4 sentence **narrative summary** describes the student's overall performance and ends with one forward-looking encouragement.

---

### 2. PEACE Framework — Phase Scores

Three of the five PEACE phases are scored (Planning occurs before the interview; Evaluation is the reflection the student does after — neither is scored in-session).

| Phase | What is assessed |
|---|---|
| **Engage & Explain** | Rapport-building, introducing themselves, explaining the interview process, putting the witness at ease |
| **Account** | How effectively the student used open and TEDS-style questions to elicit the witness's account |
| **Closure** | How well the interview was concluded — summarising, checking understanding, thanking the witness |

Each phase displays:
- A score out of 100
- An animated progress bar
- 2–3 sentences of specific written feedback quoting the transcript where possible

---

### 3. Questioning Technique

Three pill badges show a count of each question type used during the interview:

| Pill | Colour | What it counts |
|---|---|---|
| **TEDS / Open** | Green | Questions starting with Tell me, Explain, Describe, Show me, Walk me through, What happened... |
| **Leading** | Red | Questions that suggest an answer or assume a fact (e.g. "So she was nervous, wasn't she?") |
| **Closed** | Grey | Yes/no questions that don't invite elaboration |

Below the pills, 2–3 sentences describe the student's overall questioning style and its impact on what the witness revealed.

**Guidance:** A well-structured interview should have significantly more TEDS/open questions than closed questions, and ideally zero leading questions.

---

### 4. Key Facts Elicited

A green progress bar shows what percentage of the witness's available key facts the student drew out during the interview.

Below the bar, each key fact is listed individually with:
- A **green tick (✓)** if the student successfully elicited it
- A **grey circle (○)** if it was missed
- For elicited facts: a brief note on *how* it was drawn out (e.g. "elicited via open question about Sarah's appearance")

**How facts are tiered in the witness script:**

| Tier | How facts are released |
|---|---|
| Tier 1 | Volunteered freely without prompting |
| Tier 2 | Released in response to open questions (Tell me about..., Describe...) |
| Tier 3 | Released only with skilled, specific TEDS probing on the right topic |
| Tier 4 | Only disclosed if the student asks directly and sensitively |

A student who only asks closed questions will typically only elicit Tier 1 facts. A student who uses TEDS questioning well will unlock Tier 2 and 3 facts. Tier 4 facts require careful, sensitive direct questioning.

---

### 5. Strengths

Up to three specific strengths are listed, each highlighting something the student did well. Strengths are always grounded in the transcript — Claude quotes or paraphrases the actual exchange that demonstrated the strength.

*Example: "You built good initial rapport by introducing yourself clearly and explaining what the interview would involve, which visibly relaxed the witness."*

---

### 6. Areas to Develop

Each improvement is presented as a card with three parts:

| Field | Description |
|---|---|
| **Issue** | The specific problem identified (e.g. "Overuse of leading questions in the account phase") |
| **Suggestion** | A concrete explanation of what to do differently |
| **Better phrasing** | A direct example of how the student could have phrased a specific question better |

*Example:*
> **Issue:** You asked "Was Sarah acting suspiciously?" which is a leading question.
> **Suggestion:** Avoid suggesting answers — let the witness use their own words.
> **Better phrasing:** "How would you describe Sarah's behaviour when she arrived?"

---

### 7. Full Transcript

A collapsible section at the bottom shows the complete interview transcript. Student turns are highlighted in blue, witness turns in gold. This allows the student to review the full conversation in light of the feedback they've just received.

---

## How the Feedback is Generated

### The Claude Prompt

Claude acts as an expert evaluator trained in the NZ Police PEACE model. The prompt provides:

- The full interview transcript
- The witness scenario (incident, location, what the witness knew at each tier)
- The complete NZ Police *Investigative Interviewing Witness Guide* (76 pages, converted to markdown at setup time)
- The list of all key facts and how many were available

Claude is instructed to:
- Always quote specific transcript lines to support points
- Be specific, not generic
- Suggest concrete alternative phrasings
- Be encouraging but honest — a Pass is meaningful, not a consolation

### The JSON Schema

Claude returns a strictly structured JSON object. The schema enforces consistency across every interview critique:

```json
{
  "overallScore": 72,
  "overallBand": "Merit",
  "phaseScores": {
    "engageExplain": { "score": 80, "notes": "..." },
    "account":       { "score": 65, "notes": "..." },
    "closure":       { "score": 70, "notes": "..." }
  },
  "questioningTechnique": {
    "tedsCount":    8,
    "leadingCount": 3,
    "closedCount":  5,
    "tedsScore":    60,
    "notes": "..."
  },
  "keyFactsElicited": {
    "totalPossible": 14,
    "totalElicited": 9,
    "facts": [
      { "fact": "...", "elicited": true,  "method": "open question about Sarah's appearance" },
      { "fact": "...", "elicited": false, "method": null }
    ]
  },
  "strengths": [
    "Specific strength with transcript quote...",
    "...",
    "..."
  ],
  "improvements": [
    {
      "issue":      "Overuse of leading questions",
      "suggestion": "Let the witness use their own words",
      "example":    "How would you describe Sarah's behaviour?"
    }
  ],
  "questionAnnotations": [
    {
      "turnNumber": 4,
      "question":   "Was she acting suspiciously?",
      "type":       "leading",
      "quality":    "poor",
      "note":       "Suggests the answer rather than inviting the witness to describe freely."
    }
  ],
  "summary": "3-4 sentence overall narrative..."
}
```

---

## Scoring Philosophy

- Feedback is grounded in the transcript — Claude must quote or paraphrase actual exchanges
- Scores reflect observable interviewing behaviour, not interpretation or outcome
- The band system gives students a clear, memorable benchmark rather than a raw number
- Improvements always include a *better phrasing example* so the feedback is immediately actionable
- The witness's tiered disclosure model means a student's score is directly linked to the quality of their questioning — better TEDS technique unlocks more facts and a higher score

---

## Files

| File | Purpose |
|---|---|
| `server/lib/claude.js` | Builds the Claude prompt and parses the JSON response |
| `server/routes/critique.js` | Fetches the ElevenLabs transcript and calls Claude |
| `public/js/critique.js` | Renders the JSON critique into the feedback screen |
| `public/css/styles.css` | Visual design of the feedback screen (score ring, phase bars, pills, cards) |
| `server/data/peace-reference.md` | The NZ Police PEACE model reference baked into every critique prompt |
| `server/data/witnesses/witness-catherine.json` | The witness script including all key facts and tiered disclosure rules |
