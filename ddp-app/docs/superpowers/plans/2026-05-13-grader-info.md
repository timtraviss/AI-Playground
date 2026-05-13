# Grader Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `graderInfo` field to SA and CL questions that stores a Claude-generated model answer, populates `<graderinfo>` in Totara XML exports, and can be bulk-generated for existing questions with human review via the edit panel.

**Architecture:** Seven sequential tasks: schema → prompt builder → generate API → PATCH update → export → LibraryClient view/edit → LibraryClient bulk generate. Each task is independently committable. The generate endpoint calls Claude, saves to DB, and returns the result — no streaming needed. The bulk UI fires requests sequentially with a progress counter, updating local state as each resolves.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma + PostgreSQL, `@anthropic-ai/sdk` (`claude-opus-4-7`), Zod, Tailwind

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add `graderInfo String?` to Question model |
| `src/lib/prompts/generate-grader-info.ts` | Create | Prompt builders for SA and CL grader info |
| `tests/generate-grader-info.test.ts` | Create | Unit tests for prompt builder |
| `src/app/api/questions/[id]/generate-grader-info/route.ts` | Create | POST endpoint: generate + save grader info |
| `src/app/api/questions/[id]/route.ts` | Modify | Add `graderInfo` to PatchSchema |
| `src/lib/export.ts` | Modify | Add `graderInfo` to ExportQuestion, populate `<graderinfo>` in XML |
| `src/app/library/page.tsx` | Modify | Add `graderInfo` to Prisma select |
| `src/components/LibraryClient.tsx` | Modify | View/edit panel + bulk generate UI |

---

### Task 1: DB schema — add graderInfo field

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the field to the Question model**

  Open `prisma/schema.prisma`. The current Question model ends at line 53. Add `graderInfo String?` after `focusNote`:

  ```prisma
  model Question {
    id           Int          @id @default(autoincrement())
    sectionId    Int?
    section      Section?     @relation(fields: [sectionId], references: [id])
    type         String
    code         String?
    tags         String       @default("[]")
    name         String
    questionText String
    defaultGrade Float
    focusNote    String?
    graderInfo   String?
    createdAt    DateTime     @default(now())
    markingRuns  MarkingRun[]

    @@schema("ddp")
  }
  ```

- [ ] **Step 2: Push schema to the database**

  ```bash
  cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground/ddp-app"
  npx prisma db push --skip-generate
  npx prisma generate
  ```

  Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Verify TypeScript is happy**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add prisma/schema.prisma
  git commit -m "feat: add graderInfo field to Question model"
  ```

---

### Task 2: Prompt builder

**Files:**
- Create: `src/lib/prompts/generate-grader-info.ts`
- Create: `tests/generate-grader-info.test.ts`

- [ ] **Step 1: Write the failing tests**

  Create `tests/generate-grader-info.test.ts`:

  ```typescript
  import { test } from 'node:test'
  import assert from 'node:assert/strict'
  import { buildGenerateGraderInfoPrompt } from '../src/lib/prompts/generate-grader-info.js'

  test('SA system prompt includes all three SA criteria', () => {
    const { system } = buildGenerateGraderInfoPrompt({ type: 'SA', questionText: 'Q' })
    assert.ok(system.includes('Concept'))
    assert.ok(system.includes('Application'))
    assert.ok(system.includes('Evidential Sufficiency'))
  })

  test('CL system prompt includes all five CL criteria', () => {
    const { system } = buildGenerateGraderInfoPrompt({ type: 'CL', questionText: 'Q' })
    assert.ok(system.includes('Legislation'))
    assert.ok(system.includes('Core Concepts'))
    assert.ok(system.includes('Case Law'))
    assert.ok(system.includes('Defences'))
    assert.ok(system.includes('Evidential Sufficiency'))
  })

  test('question text appears in user message', () => {
    const q = 'Explain the elements of robbery under s234'
    const { user } = buildGenerateGraderInfoPrompt({ type: 'SA', questionText: q })
    assert.ok(user.includes(q))
  })

  test('section text included in user message when provided', () => {
    const { user } = buildGenerateGraderInfoPrompt({
      type: 'SA',
      questionText: 'Q',
      sectionText: 'Section 234 text here',
    })
    assert.ok(user.includes('Section 234 text here'))
  })

  test('section block absent when sectionText not provided', () => {
    const { user } = buildGenerateGraderInfoPrompt({ type: 'SA', questionText: 'Q' })
    assert.ok(!user.includes('LEGISLATION SECTION'))
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground/ddp-app"
  npx tsx --test tests/generate-grader-info.test.ts
  ```

  Expected: all 5 tests fail with `Cannot find module`.

- [ ] **Step 3: Implement the prompt builder**

  Create `src/lib/prompts/generate-grader-info.ts`:

  ```typescript
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
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  npx tsx --test tests/generate-grader-info.test.ts
  ```

  Expected: all 5 tests pass.

- [ ] **Step 5: Type-check**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add src/lib/prompts/generate-grader-info.ts tests/generate-grader-info.test.ts
  git commit -m "feat: add generate-grader-info prompt builder"
  ```

---

### Task 3: Generate API endpoint

**Files:**
- Create: `src/app/api/questions/[id]/generate-grader-info/route.ts`

- [ ] **Step 1: Create the route file**

  Create `src/app/api/questions/[id]/generate-grader-info/route.ts`:

  ```typescript
  import { NextRequest, NextResponse } from 'next/server'
  import { prisma } from '@/lib/db'
  import { anthropic } from '@/lib/anthropic'
  import { buildGenerateGraderInfoPrompt } from '@/lib/prompts/generate-grader-info'

  export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const numId = parseInt(id, 10)
    if (isNaN(numId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const question = await prisma.question.findUnique({
      where: { id: numId },
      include: { section: true },
    })
    if (!question) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (question.type !== 'SA' && question.type !== 'CL')
      return NextResponse.json({ error: 'Only SA and CL questions are supported' }, { status: 400 })

    const { system, user } = buildGenerateGraderInfoPrompt({
      type: question.type as 'SA' | 'CL',
      questionText: question.questionText,
      sectionText: question.section?.fullText,
    })

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    })

    const graderInfo =
      message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    await prisma.question.update({
      where: { id: numId },
      data: { graderInfo },
    })

    return NextResponse.json({ graderInfo })
  }
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground/ddp-app"
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Smoke test via curl (optional but recommended)**

  Start the dev server in a separate terminal (`npm run dev`), then:

  ```bash
  # Replace 1 with an actual SA or CL question id from your database
  curl -s -X POST http://localhost:3000/api/questions/1/generate-grader-info | jq .
  ```

  Expected: `{ "graderInfo": "..." }` with a model answer string.

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/api/questions/[id]/generate-grader-info/route.ts
  git commit -m "feat: add generate-grader-info API endpoint"
  ```

---

### Task 4: Add graderInfo to PATCH route

**Files:**
- Modify: `src/app/api/questions/[id]/route.ts:7-14`

- [ ] **Step 1: Add graderInfo to PatchSchema**

  Open `src/app/api/questions/[id]/route.ts`. The current `PatchSchema` is:

  ```typescript
  const PatchSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    type: z.enum(['SA', 'CL', 'MC', 'PR']).optional(),
    tags: z.array(z.enum(VALID_TAGS)).optional(),
    defaultGrade: z.number().positive().optional(),
    questionText: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
  })
  ```

  Replace with:

  ```typescript
  const PatchSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    type: z.enum(['SA', 'CL', 'MC', 'PR']).optional(),
    tags: z.array(z.enum(VALID_TAGS)).optional(),
    defaultGrade: z.number().positive().optional(),
    questionText: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    graderInfo: z.string().optional(),
  })
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground/ddp-app"
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/api/questions/[id]/route.ts
  git commit -m "feat: allow graderInfo in question PATCH"
  ```

---

### Task 5: Export — populate graderinfo in Totara XML

**Files:**
- Modify: `src/lib/export.ts`

- [ ] **Step 1: Add graderInfo to ExportQuestion interface**

  Open `src/lib/export.ts`. The current `ExportQuestion` interface (lines 17–28) is:

  ```typescript
  export interface ExportQuestion {
    id: number
    code: string | null
    tags: string[]
    name: string
    type: string
    questionText: string
    defaultGrade: number
    createdAt: string
    topic: string | null
    section: { number: string; heading: string } | null
  }
  ```

  Replace with:

  ```typescript
  export interface ExportQuestion {
    id: number
    code: string | null
    tags: string[]
    name: string
    type: string
    questionText: string
    defaultGrade: number
    createdAt: string
    topic: string | null
    graderInfo: string | null
    section: { number: string; heading: string } | null
  }
  ```

- [ ] **Step 2: Populate graderinfo in toTotaraXml**

  In `toTotaraXml`, find the essay `return` statement (lines 112–126):

  ```typescript
  return `  <question type="essay">
      <name><text>${fullName}</text></name>
      <questiontext format="html">
        <text><![CDATA[${q.questionText}]]></text>
      </questiontext>
      <defaultgrade>${q.defaultGrade}</defaultgrade>
      <penalty>0</penalty>
      <hidden>0</hidden>
      <responseformat>editor</responseformat>
      <responserequired>1</responserequired>
      <responsefieldlines>15</responsefieldlines>
      <attachments>0</attachments>
      <attachmentsrequired>0</attachmentsrequired>
    </question>`
  ```

  Replace with:

  ```typescript
  const graderInfoBlock = (q.type === 'SA' || q.type === 'CL')
    ? `\n    <graderinfo format="html">\n      <text>${q.graderInfo ? `<![CDATA[${q.graderInfo}]]>` : ''}</text>\n    </graderinfo>`
    : ''

  return `  <question type="essay">
      <name><text>${fullName}</text></name>
      <questiontext format="html">
        <text><![CDATA[${q.questionText}]]></text>
      </questiontext>
      <defaultgrade>${q.defaultGrade}</defaultgrade>
      <penalty>0</penalty>
      <hidden>0</hidden>
      <responseformat>editor</responseformat>
      <responserequired>1</responserequired>
      <responsefieldlines>15</responsefieldlines>
      <attachments>0</attachments>
      <attachmentsrequired>0</attachmentsrequired>${graderInfoBlock}
    </question>`
  ```

- [ ] **Step 3: Type-check**

  ```bash
  cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground/ddp-app"
  npx tsc --noEmit
  ```

  TypeScript will now flag `graderInfo` as missing on every call site that constructs an `ExportQuestion`. The errors point you to the places you need to fix.

  The only server-side call site is `src/app/library/page.tsx` — that's fixed in Task 6. Any TypeScript errors in `LibraryClient.tsx` are expected at this point; they will be resolved in Task 6.

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/export.ts
  git commit -m "feat: populate graderinfo in Totara XML export for SA and CL"
  ```

---

### Task 6: Library page + LibraryClient view and edit panel

**Files:**
- Modify: `src/app/library/page.tsx`
- Modify: `src/components/LibraryClient.tsx`

- [ ] **Step 1: Add graderInfo to Prisma select in library page**

  Open `src/app/library/page.tsx`. Find the `prisma.question.findMany` call. Add `graderInfo: true` to the `select` block:

  ```typescript
  prisma.question.findMany({
    select: {
      id: true,
      code: true,
      tags: true,
      name: true,
      type: true,
      questionText: true,
      defaultGrade: true,
      graderInfo: true,
      createdAt: true,
      section: { select: { number: true, heading: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  ```

  The `questions` mapping below uses a spread (`...q`) so `graderInfo` flows through automatically — no further change needed in `page.tsx`.

- [ ] **Step 2: Add graderInfo to editValues state type in LibraryClient**

  Open `src/components/LibraryClient.tsx`. Find the `editValues` state declaration (around line 75):

  ```typescript
  const [editValues, setEditValues] = useState<{ name: string; type: string; tags: string[]; defaultGrade: number; questionText: string } | null>(null)
  ```

  Replace with:

  ```typescript
  const [editValues, setEditValues] = useState<{ name: string; type: string; tags: string[]; defaultGrade: number; questionText: string; graderInfo: string } | null>(null)
  ```

- [ ] **Step 3: Add graderInfoOpen state for collapsible view panel**

  Below the `editValues` state declaration, add:

  ```typescript
  const [graderInfoOpen, setGraderInfoOpen] = useState(false)
  ```

  Also reset it when `panelId` changes. Find the `useEffect` that resets panel state (around line 131):

  ```typescript
  useEffect(() => {
    setDeleteConfirm(false)
    setEditMode(false)
    setEditValues(null)
    setEditTopicModuleId('')
    setEditNextCode(null)
  }, [panelId])
  ```

  Replace with:

  ```typescript
  useEffect(() => {
    setDeleteConfirm(false)
    setEditMode(false)
    setEditValues(null)
    setEditTopicModuleId('')
    setEditNextCode(null)
    setGraderInfoOpen(false)
  }, [panelId])
  ```

- [ ] **Step 4: Include graderInfo when entering edit mode**

  Find the `startEdit` function (around line 238). The `setEditValues` call sets initial values from `panelQuestion`. Add `graderInfo`:

  ```typescript
  setEditValues({
    name: panelQuestion.name,
    type: panelQuestion.type,
    tags: panelQuestion.tags,
    defaultGrade: panelQuestion.defaultGrade,
    questionText: panelQuestion.questionText,
    graderInfo: panelQuestion.graderInfo ?? '',
  })
  ```

- [ ] **Step 5: Add graderInfo textarea to edit mode form**

  In the edit mode form, find the `questionText` textarea block (around line 731). After its closing `</div>`, add:

  ```tsx
  {(editValues.type === 'SA' || editValues.type === 'CL') && (
    <div>
      <label className="text-xs text-muted uppercase tracking-wide block mb-1">Grader info (model answer)</label>
      <textarea
        value={editValues.graderInfo}
        onChange={(e) => setEditValues((v) => v ? { ...v, graderInfo: e.target.value } : v)}
        rows={10}
        placeholder="Claude-generated model answer for markers. Leave blank to generate later."
        className="w-full bg-surface2 border border-edge rounded-lg px-3 py-2 text-xs text-ink leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent resize-y"
      />
    </div>
  )}
  ```

- [ ] **Step 6: Show graderInfo in view mode**

  In the view mode section of the panel body, after the question text block (around line 778), add:

  ```tsx
  {(panelQuestion.type === 'SA' || panelQuestion.type === 'CL') && panelQuestion.graderInfo && (
    <div className="pt-2 border-t border-edge">
      <button
        onClick={() => setGraderInfoOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-muted uppercase tracking-wide hover:text-ink transition-colors w-full text-left"
      >
        <span>Grader info</span>
        <span className="ml-auto">{graderInfoOpen ? '▲' : '▼'}</span>
      </button>
      {graderInfoOpen && (
        <p className="mt-2 text-sm text-sub whitespace-pre-wrap leading-relaxed">
          {panelQuestion.graderInfo}
        </p>
      )}
    </div>
  )}
  ```

- [ ] **Step 7: Update handleSave to include graderInfo in local state**

  Find the `handleSave` function. Inside the `setQuestions` call, the object spread explicitly maps updated fields. Add `graderInfo`:

  ```typescript
  setQuestions((prev) => prev.map((q) =>
    q.id === panelQuestion.id
      ? {
          ...q,
          name: updated.name,
          type: updated.type,
          tags: editValues?.tags ?? q.tags,
          defaultGrade: updated.defaultGrade,
          questionText: updated.questionText,
          graderInfo: editValues?.graderInfo ?? q.graderInfo,
          code: newCode,
          topic: newTopic,
        }
      : q
  ))
  ```

- [ ] **Step 8: Type-check**

  ```bash
  cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground/ddp-app"
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 9: Commit**

  ```bash
  git add src/app/library/page.tsx src/components/LibraryClient.tsx
  git commit -m "feat: show and edit graderInfo in question panel"
  ```

---

### Task 7: Bulk generate UI

**Files:**
- Modify: `src/components/LibraryClient.tsx`

This task adds the "Generate grader info" button to the bulk selection toolbar. When clicked, it fires `POST /api/questions/[id]/generate-grader-info` for each selected SA/CL question sequentially, shows a progress counter, and updates local state as each resolves.

- [ ] **Step 1: Add bulk generate state variables**

  In LibraryClient, find the bulk topic assign state block (around line 88):

  ```typescript
  // Bulk topic assignment
  const [bulkTopicOpen, setBulkTopicOpen] = useState(false)
  const [bulkTopicModuleId, setBulkTopicModuleId] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [bulkAssignDone, setBulkAssignDone] = useState(0)
  ```

  After it, add:

  ```typescript
  // Bulk grader info generation
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkGenerateDone, setBulkGenerateDone] = useState(0)
  const [bulkGenerateTotal, setBulkGenerateTotal] = useState(0)
  ```

- [ ] **Step 2: Add the doGenerateGraderInfo handler**

  After the `doBulkAssign` function (around line 428), add:

  ```typescript
  async function doGenerateGraderInfo() {
    if (bulkGenerating) return
    const toGenerate = [...selected]
      .map((id) => questions.find((q) => q.id === id))
      .filter((q): q is NonNullable<typeof q> => !!q && (q.type === 'SA' || q.type === 'CL'))

    if (toGenerate.length === 0) return
    setBulkGenerating(true)
    setBulkGenerateDone(0)
    setBulkGenerateTotal(toGenerate.length)

    for (const q of toGenerate) {
      try {
        const res = await fetch(apiUrl(`/api/questions/${q.id}/generate-grader-info`), {
          method: 'POST',
        })
        if (!res.ok) continue
        const { graderInfo } = await res.json()
        setQuestions((prev) =>
          prev.map((pq) => (pq.id === q.id ? { ...pq, graderInfo } : pq))
        )
      } catch {
        // skip failed question, continue
      }
      setBulkGenerateDone((n) => n + 1)
    }

    setBulkGenerating(false)
  }
  ```

- [ ] **Step 3: Add the button to the bulk toolbar**

  Find the bulk toolbar in the render section (around line 484). It currently shows Export .md, Export XML, and Assign topic buttons. After the "Assign topic" button (or its conditional block), add:

  ```tsx
  {(() => {
    const saClCount = [...selected]
      .map((id) => questions.find((q) => q.id === id))
      .filter((q): q is NonNullable<typeof q> => !!q && (q.type === 'SA' || q.type === 'CL'))
      .length
    if (saClCount === 0) return null
    return (
      <button
        onClick={doGenerateGraderInfo}
        disabled={bulkGenerating}
        className="px-3 py-1.5 border border-accent/50 hover:bg-accent/10 disabled:opacity-40 text-sm text-accent rounded-lg font-medium transition-colors"
      >
        {bulkGenerating
          ? `Generating ${bulkGenerateDone}/${bulkGenerateTotal}…`
          : `Generate grader info (${saClCount})`}
      </button>
    )
  })()}
  ```

- [ ] **Step 4: Type-check**

  ```bash
  cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground/ddp-app"
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 5: Manual smoke test**

  - Run `npm run dev`
  - Open the library page
  - Select a few SA or CL questions
  - Confirm "Generate grader info (N)" button appears in the toolbar
  - Click it — progress counter should tick through
  - Open one of the updated questions in the side panel
  - Confirm the "Grader info" section appears in view mode and can be expanded
  - Enter edit mode — confirm the graderInfo textarea is pre-filled and editable
  - Edit the content and save — confirm it persists
  - Export selected questions as XML — confirm `<graderinfo>` is populated in SA/CL questions

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/LibraryClient.tsx
  git commit -m "feat: bulk generate grader info for SA and CL questions"
  ```
