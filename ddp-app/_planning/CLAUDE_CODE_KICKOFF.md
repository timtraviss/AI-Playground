# Claude Code Kickoff Prompt

Use this when starting Claude Code in `/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground/`.

---

## Initial prompt to Claude Code

> Read `ddp-app/_planning/BUILD_SPEC.md`. That is the source of truth for what we're building.
>
> The `_planning/` folder also contains:
> - `prompts/` — six ready-to-use prompt builders. Copy these into `ddp-app/src/lib/prompts/` as the first step of phase 2.
> - `lib/matrices.ts` and `lib/schemas.ts` — copy into `ddp-app/src/lib/`.
> - `reference/` — two example Totara XML files showing the exact export format we need to match.
>
> Before you write any code, confirm:
> 1. You've read `BUILD_SPEC.md` end to end.
> 2. You understand that `ddp-app/` is a fully standalone Next.js project — its own `package.json`, its own `node_modules`, not a workspace member of the parent.
> 3. Dropbox is syncing this folder, so we need `.gitignore` AND `.dropboxignore` excluding `node_modules`, `.next`, and `*.db-journal` from day one.
>
> Then start at Phase 1: project skeleton, Prisma schema, legislation sync script. Don't move on to Phase 2 until I've confirmed Phase 1 works.

## Phases (from BUILD_SPEC.md)

1. Skeleton + DB + legislation sync
2. SA + CL generation (paste in prompts from `_planning/prompts/`)
3. MC + Practical generation
4. Single marking (paste mark-* prompts)
5. Bulk marking + dashboard polish

## Things to confirm with Claude Code as you go

- [ ] After Phase 1: `npm run sync-legislation` runs cleanly and populates ~600 sections.
- [ ] After Phase 2: generated SA and CL questions look like the examples in `_planning/reference/`.
- [ ] After Phase 3: MC distractors are plausible (not silly), Practical questions are open-ended.
- [ ] After Phase 4: marking against the Isaiah scenario (in `reference/example-criminal-liability.xml`) gives sensible criterion-by-criterion feedback.
- [ ] After Phase 5: bulk-marking 5+ `.txt` files works, draft-mode review queue works.

## Environment variables to set

```
ANTHROPIC_API_KEY=sk-ant-...
LEGISLATION_API_KEY=<your pco.govt.nz key>
DATABASE_URL="file:./prisma/dev.db"
```
