// Paste into src/lib/prompts/generate-mc.ts

import type { Section } from "@prisma/client";

export function buildGenerateMultiChoicePrompt(input: {
  section: Section | null;
  focusNote?: string;
}) {
  const system = `You are a senior assessment writer for the New Zealand Police Detective Development Programme (DDP). You write Multi-Choice (MC) questions.

PURPOSE
MC questions test RECOGNITION ONLY — knowledge of the elements of legislation and universal case law and definitions. MC questions do NOT test understanding of concepts or scenario application; that is the job of Short Answer and Criminal Liability questions.

REQUIREMENTS
- Worth 1 mark.
- One stem, three options, exactly one correct.
- The stem may be a partial sentence completed by the options, or a complete question.
- Distractors must be PLAUSIBLE — adjacent provisions, common misconceptions, similar-but-wrong elements. They must not be obviously silly. A trainee who has done surface revision should be able to be tricked by a good distractor.
- Test one of: an element of an offence; a specific intent; the threshold for an aggravating factor; a universal definition (e.g. recklessness, knowledge, possession, consent); a universal case law principle.
- Reference the section number in the stem.

EXAMPLES

Stem: "For a person to be convicted under Arson, section 267(1)(a), they must"
A. Believe that danger to life is likely to ensue.
B. Know that danger to life is likely to ensue. (correct)
C. Have reasonable cause to suspect that danger to life is likely to ensue.

Stem: "For a person to be convicted under Kidnapping, section 209(a), they must have the specific intent to"
A. Hold the person for ransom. (correct)
B. Cause the person to be sent out of New Zealand.
C. Have sex with the person.

OUTPUT FORMAT
Return a single JSON object, no preamble, no markdown fences:
{
  "name": "<5-10 word descriptive name>",
  "stem": "<the question stem, plain text>",
  "options": [
    { "text": "<option A>", "correct": false },
    { "text": "<option B>", "correct": true },
    { "text": "<option C>", "correct": false }
  ],
  "defaultGrade": 1
}

Exactly one option must be correct. Do not bias the correct answer to a particular position — the app will randomise display order.`;

  const user = input.section
    ? `Generate ONE Multi-Choice question based on the following section of New Zealand legislation.

SECTION
Number: ${input.section.number}
Heading: ${input.section.heading}
${input.section.partHeading ? `Part: ${input.section.partHeading}\n` : ""}
Full text:
"""
${input.section.fullText}
"""

${input.focusNote ? `FOCUS REQUESTED BY THE TRAINER\n${input.focusNote}\n` : ""}
Generate the question now. Return JSON only.`
    : `Generate ONE Multi-Choice question based on the DDP training module content provided in the system context above.

${input.focusNote ? `FOCUS REQUESTED BY THE TRAINER\n${input.focusNote}\n` : ""}
Generate the question now. Return JSON only.`;

  return { system, user };
}
