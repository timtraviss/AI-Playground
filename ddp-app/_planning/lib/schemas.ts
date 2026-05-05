// Zod schemas for validating LLM JSON outputs.
// Paste into src/lib/schemas.ts when building.

import { z } from "zod";

// Generation outputs ---------------------------------------------------

export const GeneratedShortAnswerZ = z.object({
  name: z.string().min(3).max(120),
  questionText: z.string().min(20),
  defaultGrade: z.literal(4),
});

export const GeneratedCriminalLiabilityZ = z.object({
  name: z.string().min(2).max(120),
  questionText: z.string().min(200),
  defaultGrade: z.literal(10),
});

export const GeneratedMultiChoiceZ = z.object({
  name: z.string().min(3).max(120),
  stem: z.string().min(10),
  options: z
    .array(
      z.object({
        text: z.string().min(1),
        correct: z.boolean(),
      }),
    )
    .length(3)
    .refine(
      (opts) => opts.filter((o) => o.correct).length === 1,
      { message: "Exactly one option must be correct" },
    ),
  defaultGrade: z.literal(1),
});

export const GeneratedPracticalZ = z.object({
  name: z.string().min(3).max(120),
  questionText: z.string().min(50),
  defaultGrade: z.literal(10),
});

// Marking outputs ------------------------------------------------------

const SaBand = z.enum(["Not Achieved", "Developing", "Achieved", "Excellence"]);
const ClBand = z.enum([
  "Not Achieved",
  "Developing",
  "Achieved",
  "Merit",
  "Excellence",
]);

const CriterionResultZ = z.object({
  name: z.string(),
  marksAvailable: z.number(),
  marksAwarded: z.number().min(0),
  band: z.string(),
  descriptor: z.string(),
  evidence: z.string(),
  suggestion: z.string(),
});

export const ShortAnswerMarkingZ = z.object({
  criteria: z
    .array(
      CriterionResultZ.extend({
        band: SaBand,
        name: z.enum(["Concept", "Application", "Evidential Sufficiency"]),
      }),
    )
    .length(3),
  totalMark: z.number().min(0).max(4),
  overallBand: SaBand,
  overallFeedback: z.string().min(20),
});

export const CriminalLiabilityMarkingZ = z.object({
  criteria: z
    .array(
      CriterionResultZ.extend({
        band: ClBand,
        name: z.enum([
          "Legislation",
          "Core Concepts",
          "Case Law",
          "Defences",
          "Evidential Sufficiency",
        ]),
      }),
    )
    .length(5),
  totalMark: z.number().min(0).max(10),
  overallBand: ClBand,
  overallFeedback: z.string().min(20),
});

// Inferred types -------------------------------------------------------

export type GeneratedShortAnswer = z.infer<typeof GeneratedShortAnswerZ>;
export type GeneratedCriminalLiability = z.infer<typeof GeneratedCriminalLiabilityZ>;
export type GeneratedMultiChoice = z.infer<typeof GeneratedMultiChoiceZ>;
export type GeneratedPractical = z.infer<typeof GeneratedPracticalZ>;
export type ShortAnswerMarking = z.infer<typeof ShortAnswerMarkingZ>;
export type CriminalLiabilityMarking = z.infer<typeof CriminalLiabilityMarkingZ>;
