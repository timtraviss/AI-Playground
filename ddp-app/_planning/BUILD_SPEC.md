# DDP Question Builder & Marker — Build Spec

This is the source of truth for the build. When working with Claude Code, point it at this file first.

## What this app is

A local-only web app for the NZ Police Detective Development Programme (DDP) that does two things:

1. **Generate assessment questions** based on a chosen section of NZ legislation. Four question types: Short Answer (SA, 4 marks), Criminal Liability (CL, 10 marks), Multi-Choice (MC, 1 mark), Practical (PR, 10 marks). Output downloadable as `.md`, `.txt`, or as Totara-compatible Moodle XML.
2. **Mark trainee answers** uploaded as `.txt` files against the official DDP marking matrices. Single-answer mode and bulk-folder mode. Two confirmation modes: `auto` (saved as final) and `draft` (held in a review queue until the trainer confirms).

User: just me, runs locally, no auth.

## Stack

- **Frontend:** Next.js 15 (App Router) + TypeScript, Tailwind, shadcn/ui
- **Backend:** Next.js API routes (Node runtime)
- **Database:** Prisma + SQLite (`./prisma/dev.db`)
- **LLM:** `@anthropic-ai/sdk`, model `claude-opus-4-7`
- **Legislation source:** legislation.govt.nz API (XML), with the project PDF as a fallback
- **Validation:** Zod for all LLM JSON outputs

Standalone project — its own `package.json` and `node_modules`, not a workspace member of the parent "AI Playground" folder.

## Important environment notes

The project lives inside Dropbox. Add to `.gitignore` and create a `.dropboxignore` containing:

```
node_modules
.next
*.db-journal
```

Use Finder → right-click `node_modules` → Make Online-Only after first install, or set Selective Sync to exclude.

## Project structure

```
ddp-app/
├── _planning/                    # this folder (planning docs, prompts, matrices)
│   ├── BUILD_SPEC.md             # this file
│   ├── prompts/                  # ready-to-paste prompt builders
│   ├── lib/                      # ready-to-paste matrices and schemas
│   └── reference/                # source XML examples and DDP guide excerpts
├── prisma/
│   └── schema.prisma
├── scripts/
│   └── sync-legislation.ts       # one-off Crimes Act ingest
├── src/
│   ├── app/
│   │   ├── page.tsx              # dashboard
│   │   ├── generate/page.tsx     # Part A
│   │   ├── mark/page.tsx         # Part B (single)
│   │   ├── mark/bulk/page.tsx    # Part B (folder)
│   │   ├── library/page.tsx      # saved questions
│   │   └── api/
│   │       ├── sections/route.ts
│   │       ├── generate/route.ts
│   │       ├── mark/route.ts
│   │       ├── mark-bulk/route.ts
│   │       ├── questions/route.ts
│   │       └── export/route.ts
│   ├── lib/
│   │   ├── db.ts
│   │   ├── anthropic.ts
│   │   ├── prompts/
│   │   │   ├── generate-sa.ts
│   │   │   ├── generate-cl.ts
│   │   │   ├── generate-mc.ts
│   │   │   ├── generate-practical.ts
│   │   │   ├── mark-sa.ts
│   │   │   └── mark-cl.ts
│   │   ├── matrices.ts
│   │   ├── schemas.ts            # Zod schemas
│   │   ├── xml-export.ts         # Totara XML
│   │   └── text-export.ts        # .md and .txt
│   └── components/
│       ├── SectionPicker.tsx
│       ├── QuestionEditor.tsx
│       ├── MarkingSheet.tsx
│       └── ui/                   # shadcn
├── data/
│   └── crimes-act-fallback.pdf   # PDF fallback only
├── .env.local                    # ANTHROPIC_API_KEY, LEGISLATION_API_KEY, DATABASE_URL
├── .dropboxignore
└── package.json
```

## Database schema

Multi-Act capable from day one so you can add other legislation later.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

model Act {
  id           Int      @id @default(autoincrement())
  shortTitle   String   // "Crimes Act 1961"
  workId       String   // legislation.govt.nz work ID
  versionId    String
  versionDate  DateTime
  sections     Section[]
  syncedAt     DateTime @default(now())
}

model Section {
  id           Int      @id @default(autoincrement())
  actId        Int
  act          Act      @relation(fields: [actId], references: [id])
  number       String
  heading      String
  partHeading  String?
  fullText     String
  rawXml       String
  questions    Question[]
  @@index([actId, number])
}

model Question {
  id            Int      @id @default(autoincrement())
  sectionId     Int
  section       Section  @relation(fields: [sectionId], references: [id])
  type          String   // "SA" | "CL" | "MC" | "PR"
  name          String
  questionText  String   // HTML for SA/CL/PR; JSON string for MC
  defaultGrade  Float
  focusNote     String?
  createdAt     DateTime @default(now())
  markingRuns   MarkingRun[]
}

model MarkingRun {
  id              Int      @id @default(autoincrement())
  questionId      Int
  question        Question @relation(fields: [questionId], references: [id])
  answerText      String
  fileName        String?
  totalMark       Float
  overallBand     String
  overallFeedback String
  mode            String   // "auto" | "draft"
  status          String   // "pending_review" | "confirmed"
  createdAt       DateTime @default(now())
  criteria        CriterionResult[]
}

model CriterionResult {
  id              Int     @id @default(autoincrement())
  markingRunId    Int
  markingRun      MarkingRun @relation(fields: [markingRunId], references: [id], onDelete: Cascade)
  name            String
  marksAvailable  Float
  marksAwarded    Float
  band            String
  descriptor      String
  evidence        String
  suggestion      String
}
```

## Legislation sync

The legislation.govt.nz API is metadata-only. Fetch the actual content as XML directly:

`https://legislation.govt.nz/act/public/1961/43/latest/whole.xml`

`scripts/sync-legislation.ts`:

1. Fetch whole.xml for each Act in a config list (start with Crimes Act 1961).
2. Parse with `fast-xml-parser`. Each `<section>` element has `number`, `heading`, and nested `<subsection>`/`<para>` content.
3. Walk the tree. For each section: extract plain text (concatenate all leaf text nodes), capture the parent Part heading, store the raw `<section>...</section>` XML.
4. Upsert into `Section`, keyed by `(actId, number)`.

Idempotent — re-running replaces. ~600 sections, completes in seconds.

PDF fallback: if the API request fails (no key, network down), fall back to parsing `data/crimes-act-fallback.pdf` with `pdf-parse`, splitting on `^\d+[A-Z]?\s+` section headings. Lower fidelity but functional.

## API routes

```
GET  /api/sections?q=<search>           → list/search sections (across all Acts)
POST /api/generate                       → { sectionId, type, focusNote? } → draft Question (not saved)
POST /api/questions                      → save edited question to library
GET  /api/questions?type=&sectionId=     → list saved questions
PATCH /api/questions/[id]                → update saved question
DELETE /api/questions/[id]               → delete
POST /api/mark                           → { questionId, answerText, mode } → MarkingRun
POST /api/mark-bulk                      → multipart, multiple .txt files → array of MarkingRuns
PATCH /api/mark-runs/[id]                → confirm a draft run
GET  /api/export?ids=&format=xml|md|txt  → file download
```

## UI screens

**Dashboard (`/`).** Cards for the four main actions. Below: a "Pending review" section listing draft markings awaiting confirmation.

**Generate (`/generate`).** SectionPicker (combobox, searches by Act + number + heading) → type toggle (SA/CL/MC/PR) → focus note textarea → Generate button → streams into QuestionEditor → Save / Regenerate / Download .md / Download .txt / Export XML.

**Mark single (`/mark`).** Pick saved question OR paste question text → drop `.txt` OR paste answer → mode toggle (auto/draft) → Mark button → MarkingSheet renders.

**Mark bulk (`/mark/bulk`).** Pick question → multi-select `.txt` files → mode toggle → progress bar → results table (filename, total mark, band, link to full sheet) → CSV export.

**Library (`/library`).** Filterable list of saved questions. Edit, delete, multi-select for batch export.

**MarkingSheet component.** Total + band heading. One row per criterion: marks awarded/available, band, verbatim descriptor, evidence (italicised quote), suggestion. Overall feedback paragraph. Confirm button when status=`pending_review`.

## Question naming

Generator returns a default name suggestion. User can edit before saving.

## Section text length

Inject section text in full. Opus 4.7 handles 200K context; the longest single section (s2 Interpretation) is ~6K tokens. Don't truncate.

## Export formats

**Totara XML.** Match the structure of the example files in `_planning/reference/`. Top: `<question type="category">` (path configurable per export). Then per question:
- SA/CL/PR: `<question type="essay">` with `<defaultgrade>`, `<responseformat>editor</responseformat>`, `<responsefieldlines>` (15 for SA, 40 for CL/PR), text wrapped in `<![CDATA[...]]>`.
- MC: `<question type="multichoice">` with `<answer>` blocks.

**Markdown.** Per question:

```
## [Name]
**Section:** s[number] — [heading]
**Type:** [Short Answer / Criminal Liability / Multi-choice / Practical]
**Marks:** [n]

[questionText, HTML stripped]

---
```

**Plain text.** Same content, no markdown syntax.

## Build order

1. Skeleton + DB + legislation sync. Next.js scaffold, Prisma schema, sync script runs, `/api/sections` works, simple list page proves data is loaded.
2. SA + CL generation. Prompts, `/generate` page, save to library, downloads.
3. MC + Practical generation.
4. Single marking. Both modes. MarkingSheet rendering.
5. Bulk marking + dashboard polish (pending review queue, CSV export).

## Key environment variables

```
ANTHROPIC_API_KEY=sk-ant-...
LEGISLATION_API_KEY=<your pco.govt.nz key>
DATABASE_URL="file:./prisma/dev.db"
```
