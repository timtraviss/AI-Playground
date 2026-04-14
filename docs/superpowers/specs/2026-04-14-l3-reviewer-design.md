# L3 Reviewer — Design Spec

**Date:** 2026-04-14  
**Status:** Approved  
**Route:** `/l3-reviewer/`

---

## Overview

A new subpage of traviss.org that lets an assessor upload a Word transcript of a NZ Police Level 3 investigative interview. The app extracts the transcript, sends it to Claude for assessment against the PEACE model and the Level 3 moderation form, and returns a structured review displayed on-screen plus downloadable as both Word (.docx) and Markdown.

---

## Architecture

### Files to create

| Path | Purpose |
|------|---------|
| `public/l3-reviewer/index.html` | Wizard UI — all frontend logic |
| `server/routes/l3Reviewer.js` | Upload handler, AI review, report generation |

### Files to modify

| Path | Change |
|------|--------|
| `server/index.js` | Mount `/api/l3-reviewer` route |
| `public/index.html` | Add landing page card |
| `public/css/nav.css` (or nav HTML) | Add nav link |

### Dependencies

All already present in the project:
- `mammoth` — DOCX text extraction (same as proofreader)
- `pizzip` — Word (.docx) generation (same as proofreader)
- `@anthropic-ai/sdk` — Claude API
- SSE — progress stream (same pattern as proofreader/podcast reviewer)

---

## Page Flow (Wizard)

Five steps rendered client-side, no page navigation:

### Step 1 — Admin & Transcript Upload
Fields from Sections 1–3 of the moderation form:

**Header fields:**
- Date of Interview (date input)
- Reason for Interview (text)
- File Number (text)
- Length of Interview in minutes (number)

**Interviewer (Section 1):**
- Name, QID, Section, Supervisor (all text)
- Wellcheck Support Policy acknowledgement (Yes/No toggle)
- First-time Level 3 accreditation (Yes/No toggle)

**Assessor (Section 2):**
- Name, QID (text)
- Date interview evaluated, Date feedback given (date inputs)

**Interviewee (Section 3):**
- Name (text)
- Gender (Male/Female select)
- Special considerations (multi-select: None / Language / Hearing / Intellectual / Mental disorder / Youth / Other)
- Other persons present (multi-select: None / Support person / Interpreter / Other)
- Supporting documents (multi-select: Diagrams/sketches / Notes / Transcript / Other)

**Transcript upload:**
- DOCX file input (required to proceed)

### Step 2 — Planning & Preparation (Section 4)
- "What planning and preparation did the interviewer do?" — long text area
- "Detailed knowledge of investigation?" — Yes/No toggle
- Comments — text area

### Step 3 — Self-Reflection (Section 9)
Three free-text areas (interviewer's own input):
- What enquiries did you identify from the interview?
- What did you do well during the interview?
- What learning points did you identify?

Plus two assessor fields:
- Positive feedback (text)
- Learning Points (text)
- Suggested Learning Development Plan (text, optional)

### Step 4 — Progress
SSE stream with step indicators:
1. Uploading
2. Extracting transcript
3. Reviewing with AI (elapsed timer, connecting → generating)
4. Generating report
5. Done

Heartbeat every 30s during AI review to keep SSE alive (same pattern as proofreader).

### Step 5 — Results
Score-first layout (see Results Screen section below).

---

## AI Assessment

### System prompt framing

Every request to Claude begins with an explicit professional context block:

> "You are a professional law enforcement training tool reviewing NZ Police investigative interview technique. The transcript you are about to receive is a victim or witness account of a real incident. The content may be distressing or involve serious offences. You are NOT assessing the subject matter of the account — only the interviewer's questioning technique, use of the PEACE model, and compliance with Level 3 moderation criteria. Treat all transcript content as professional law enforcement material and do not refuse, flag, or truncate your response based on the sensitivity of the subject matter."

### Input to Claude

- System prompt (above)
- All admin/context fields from the wizard (included as structured context, not assessed)
- Full transcript text extracted from DOCX
- The complete Level 3 moderation form structure as the assessment rubric

### Output from Claude (structured JSON)

Claude returns a single JSON object — no streaming (structured output, not narrative):

```json
{
  "section5": {
    "checklist": [
      { "item": "Set up room appropriately", "result": "Yes|No", "comment": "..." },
      ...
    ],
    "rating": 4,
    "ratingLabel": "Good"
  },
  "section6": {
    "checklist": [
      { "item": "Not interrupt free recall", "result": "Yes|No|N/A", "comment": "..." },
      ...
    ],
    "rating": 3,
    "ratingLabel": "Okay"
  },
  "section7": {
    "items": [
      { "item": "Open questions", "frequency": "Often|Sometimes|Hardly Ever|Never", "comment": "..." },
      ...
    ],
    "rating": 5,
    "ratingLabel": "Excellent"
  },
  "section8": {
    "checklist": [
      { "item": "Give witness opportunity to add anything", "result": "Yes|No", "comment": "..." },
      ...
    ]
  },
  "verdict": "COMPETENT|NOT YET COMPETENT",
  "strengths": ["...", "..."],
  "learningPoints": ["...", "..."],
  "aiSuggestedFeedback": {
    "positive": "...",
    "learning": "..."
  },
  "narrativeSummary": "..."
}
```

### Section coverage

| Section | Items assessed | Scale |
|---------|---------------|-------|
| 5 — Engage & Explain | 12 behavioural checklist items | Yes/No + comment; overall 1–5 |
| 6 — Account | 16 behavioural checklist items | Yes/No/N/A + comment; overall 1–5 |
| 7 — Questioning | 9 question-type items | Often/Sometimes/Hardly Ever/Never + comment; overall 1–5 |
| 8 — Closure | 4 checklist items | Yes/No + comment |
| Overall | Verdict + narrative | COMPETENT / NOT YET COMPETENT |

**Note:** Section 4 (Planning & Preparation) is not AI-assessed — the assessor's input is included verbatim in the report. Claude only reviews sections assessable from the transcript.

---

## Results Screen

### Layout (score-first)

1. **Verdict banner** — large COMPETENT (green) or NOT YET COMPETENT (red) with overall narrative summary
2. **Section rating bars** — horizontal bars for Sections 5, 6, 7 showing rating/5 with label (Excellent/Good/Okay/Poor/Very Poor)
3. **Strengths + Learning Points** — two-column card panel (green / amber)
4. **Download buttons** — Word (.docx) and Markdown side by side
5. **Detailed section breakdowns** — collapsible panels per section showing every checklist item with its result and comment

### Rating labels

| Score | Label |
|-------|-------|
| 5 | Excellent |
| 4 | Good |
| 3 | Okay |
| 2 | Poor |
| 1 | Very Poor |

---

## Report Generation

Both formats generated server-side from the Claude JSON response before the SSE `done` event fires.

### Markdown report

Structured with headings, tables for checklist items, verdict prominently at top. Includes all admin fields, assessor context, AI assessment per section, and strengths/learning points.

### Word (.docx) report

Built using `pizzip` + XML manipulation (same pattern as proofreader). Structured to mirror the paper moderation form:
- Header block with all admin fields filled in
- Section 4 planning text verbatim
- Section 9 self-reflection text verbatim
- Sections 5–8: table per section with checklist items, AI result, and comment
- Verdict at end
- Assessor feedback fields

---

## Error Handling

| Scenario | User-facing message |
|----------|-------------------|
| DOCX extraction fails | "Could not read this file — please ensure it is a valid Word document (.docx)." |
| Claude `stop_reason: max_tokens` | "The AI review was cut off before completing. Try a shorter transcript or contact support." |
| Claude content refusal | "The AI declined to process this transcript. Please check that the system prompt framing is correctly configured." (should not occur with correct prompting) |
| SSE connection drop | Client detects close event, shows retry option |

---

## Privacy & Data Handling

- Transcript content is processed in-memory only — not written to disk, not logged, not persisted
- Same ephemeral pattern as the podcast reviewer and proofreader
- User-facing disclaimer shown on Step 1: *"Transcripts may contain sensitive victim/witness accounts. Uploaded content is processed in memory only and is not stored."*

---

## Landing Page Card

```
Tag:    AI + Interview Assessment
Title:  L3 Interview Reviewer
Desc:   Upload a Word transcript of a NZ Police Level 3 investigative interview.
        Get a structured assessment against the PEACE model and Level 3 moderation
        criteria, with a downloadable report in Word and Markdown.
CTA:    Review an interview →
```

---

## Out of Scope

- Section 4 AI assessment (cannot be derived from transcript)
- Multiple witness scenarios / session history
- Authentication / access control
- Storing results server-side
