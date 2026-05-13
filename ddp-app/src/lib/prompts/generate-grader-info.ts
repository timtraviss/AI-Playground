import { SHORT_ANSWER_MATRIX, CRIMINAL_LIABILITY_MATRIX } from '../matrices'

export function buildGenerateGraderInfoPrompt(input: {
  type: 'SA' | 'CL'
  questionText: string
  sectionText?: string
}): { system: string; user: string } {
  const isSA = input.type === 'SA'
  const matrix = isSA ? SHORT_ANSWER_MATRIX : CRIMINAL_LIABILITY_MATRIX
  const typeName = isSA ? 'Short Answer (4 marks)' : 'Criminal Liability (10 marks)'

  const system = `You are a senior assessor for the New Zealand Police Detective Development Programme (DDP). Your task is to write a model answer for a ${typeName} question that achieves Excellence across all marking criteria.

This model answer is grader guidance — it shows markers what an ideal trainee response looks like. Write in plain text (no markdown, no headings, no bullet points unless they genuinely aid clarity). Be specific, use accurate NZ legal terminology, and demonstrate the depth expected at Excellence level.

THE MARKING MATRIX
${JSON.stringify(matrix, null, 2)}`

  const sectionBlock = input.sectionText
    ? `\nLEGISLATION SECTION\n"""\n${input.sectionText}\n"""\n`
    : ''

  const user = `Write an Excellence-level model answer for the following question.
${sectionBlock}
QUESTION
${input.questionText}

Write the model answer now. Plain text only.`

  return { system, user }
}
