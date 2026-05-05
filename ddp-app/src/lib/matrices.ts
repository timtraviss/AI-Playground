// Source of truth for the DDP marking matrices.
// Descriptors are taken verbatim from the DDP Assessment Document v13.
// Paste this file into src/lib/matrices.ts when building.

export const SHORT_ANSWER_MATRIX = {
  totalMarks: 4,
  increments: 0.5,
  bands: ["Not Achieved", "Developing", "Achieved", "Excellence"] as const,
  bandToMarkRange: {
    "Not Achieved": [0, 1],
    "Developing": [2, 2],
    "Achieved": [3, 3],
    "Excellence": [4, 4],
  },
  criteria: [
    {
      name: "Concept",
      marksAvailable: 1,
      bands: {
        "Not Achieved": "Incorrect concept chosen or unrecognised.",
        "Developing": "Recognises the correct concept but gives only a minimal explanation.",
        "Achieved": "Correct concept recognised with an adequate explanation.",
        "Excellence": "Thorough and detailed explanation of the concept.",
      },
    },
    {
      name: "Application",
      marksAvailable: 1.5,
      bands: {
        "Not Achieved": "Little to no understanding demonstrated. Responses are basic, rote or lack original wording.",
        "Developing": "Shows limited understanding or application.",
        "Achieved": "Demonstrates reasonable application and understanding.",
        "Excellence": "Excellent application with clear, logical reasoning.",
      },
    },
    {
      name: "Evidential Sufficiency",
      marksAvailable: 1.5,
      bands: {
        "Not Achieved": "No evidence of deeper comprehension.",
        "Developing": "Minimal evidence of deeper comprehension.",
        "Achieved": "Uses original wording, though may miss details or depth.",
        "Excellence": "Incorporates relevant terminology and additional considerations (e.g. case law, defences, evidence). Entirely original wording, showcasing deeper insight.",
      },
    },
  ],
};

export const CRIMINAL_LIABILITY_MATRIX = {
  totalMarks: 10,
  increments: 0.5,
  bands: ["Not Achieved", "Developing", "Achieved", "Merit", "Excellence"] as const,
  bandToMarkRange: {
    "Not Achieved": [0, 3],
    "Developing": [4, 5],
    "Achieved": [6, 6],
    "Merit": [7, 8],
    "Excellence": [8, 10],
  },
  // Cross-criterion topics the marker should look for, taken from the
  // Criminal Liability Assessment Matrix Criteria table.
  topicHints: {
    "Legislation": "Elements; Supplementary Legislation; Search Powers; Evidential",
    "Core Concepts": "Actus Reus; Mens Rea (general and specific); Consent; Dishonesty; Claim of right; Intentional; Knowledge; Possession; Recklessly; Unlawful; Causation; Contemporaneous; Legal Tests",
    "Case Law": "5 C's universal: Collister (intent inferred from circumstances); Cameron (recklessness); Crooks (knowledge); Cox (consent); Cox (possession). Subject-specific: Archer (Arson), Lapier (Robbery), Wellard/Pryce/Mohi (Kidnapping).",
    "Defences": "ID; Formal defences (intoxication, duress, insanity, self-defence); Statutory defences (claim of right, consent).",
    "Evidential Sufficiency": "Investigations to prove elements; evidence to gather; interview questions to ask; alternative charges where relevant.",
  },
  criteria: [
    {
      name: "Legislation",
      marksAvailable: 2,
      bands: {
        "Not Achieved": "Chooses inappropriate offence. Does not provide elements of offence.",
        "Developing": "Chooses an appropriate offence. Provides rote-learned answers, or lists.",
        "Achieved": "Chooses an appropriate offence. Provides adequate explanation of elements and case law.",
        "Merit": "Chooses an appropriate offence with some referencing.",
        "Excellence": "Chooses an appropriate offence with complete referencing.",
      },
    },
    {
      name: "Core Concepts",
      marksAvailable: 2,
      bands: {
        "Not Achieved": "Does not refer to core concepts.",
        "Developing": "Provides incomplete or minimal explanation for elements of offence.",
        "Achieved": "Uses basic core concepts.",
        "Merit": "Identifies core concepts and relates them back to the scenario.",
        "Excellence": "Provides thorough and perceptive explanation of the core concepts.",
      },
    },
    {
      name: "Case Law",
      marksAvailable: 2,
      bands: {
        "Not Achieved": "Does not refer to case law.",
        "Developing": "Uses minimal or limited case law.",
        "Achieved": "Uses basic case law.",
        "Merit": "Provides substantial explanation of the elements and case law.",
        "Excellence": "Provides thorough and perceptive explanation of the elements and case law.",
      },
    },
    {
      name: "Defences",
      marksAvailable: 2,
      bands: {
        "Not Achieved": "No defences.",
        "Developing": "No defences.",
        "Achieved": "Misses obvious corroboration, defences, legal tests etc that may affect criminal liability.",
        "Merit": "Touches on corroboration, defences, legal tests etc that may affect criminal liability.",
        "Excellence": "Details perceptive evidence of corroboration, defences, legal tests etc that may affect criminal liability.",
      },
    },
    {
      name: "Evidential Sufficiency",
      marksAvailable: 2,
      bands: {
        "Not Achieved": "Does not use legal terminology. Provides no or little evidence in relation to the scenario to justify a prosecution for their chosen offence.",
        "Developing": "Rarely provides or provides limited evidence, explanations, and examples in relation to the scenario to justify a prosecution for their chosen offence.",
        "Achieved": "Provides basic evidence, explanations, and examples in relation to the scenario to justify a prosecution for their chosen offence.",
        "Merit": "Uses accurate legal terminology. Provides substantial evidence, explanations, and examples in relation to the scenario to justify a prosecution for their chosen offence.",
        "Excellence": "Uses accurate legal terminology. Provides perceptive and thorough evidence, explanations, and examples in relation to the scenario to justify a prosecution for their chosen offence.",
      },
    },
  ],
};
