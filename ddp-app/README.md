# DDP Question Builder & Marker

A local web app for the NZ Police Detective Development Programme (DDP). Generates assessment questions from NZ legislation and marks trainee answers against DDP marking matrices.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL
- Anthropic SDK (`claude-opus-4-7`)
- Zod validation

## Quick Start

```bash
cp .env.local.example .env.local  # add ANTHROPIC_API_KEY, LEGISLATION_API_KEY, DATABASE_URL
npm install
npm run db:deploy && npm run db:generate
npm run sync-legislation
npm run dev
```

## Features

- **Generate** — SA (4m), CL (10m), MC (1m), Practical (10m) questions from any Crimes Act section
- **Mark** — single and bulk marking with auto/draft confirmation modes
- **Library** — filterable question library with export to Markdown, plain text, or Totara XML
- **Topics** — questions grouped by module with auto-generated codes

## Roadmap

### Core build (phases 1–5)
- [x] Project skeleton, Prisma schema, legislation sync
- [x] SA + CL question generation
- [x] MC + Practical question generation
- [x] Single marking (auto + draft modes)
- [x] Bulk marking + dashboard (pending review queue)

### Library enhancements
- [x] Topic/module picker with auto question codes
- [x] Bulk topic assignment
- [x] XML import (essay + multichoice)
- [x] Multi-tag support — `exam`, `practice`, `DDP`, `DMP` with multi-select toggle pills
- [x] Grader info — Claude-generated model answers for SA/CL questions; bulk generate, editable in panel, exported to `<graderinfo>` in Totara XML and included in `.md` exports
- [x] Practice code suffix — questions tagged `practice` get a `P` suffix on their code (e.g. `SOSA001P`); exam and practice maintain separate counters

### Potential upgrades
- [ ] **Migrate to Supabase** — Supabase is PostgreSQL with a much better dashboard (table editor, SQL editor, logs) and a generous free tier vs Heroku's ~$5/mo. Migration = export data from Heroku Postgres, import into Supabase, update `DATABASE_URL`. Prisma works with Supabase out of the box.
