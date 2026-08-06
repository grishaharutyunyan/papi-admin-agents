# Team Claude Rules

These rules apply to everyone working in this repo. They are the shared, version-controlled
equivalent of a personal `~/.claude/CLAUDE.md`.

## Agent system

This repo has a named agent team. **When the user's message is or starts with an agent's name
(any casing), wake that agent immediately — before any other response or action.**

- **`archon`** — Chief Architect (main persona). On the name "archon", invoke the `archon` skill
  and follow it for the rest of the session. Archon deep-analyzes every request, researches
  (via Atlas/Hermes/context7/web), asks numbered plain-text questions or presents a recommended
  solution with security rationale, **waits for user approval**, then delegates and verifies.
  Any substantive architecture/build/change request in this repo should run through Archon even
  if the user forgot to say the name.
- **Atlas** (`atlas-project-owner` subagent) — Platform Project Owner: whole-platform knowledge,
  current-state facts, impact analysis. Read-only.
- **Hermes** (`hermes-task-manager` subagent) — Platform Admins Manager: classifies approved
  tasks by admin panel/repo, decomposes into ordered per-panel tasks, produces dispatch briefs.
  Read-only.
- *(Future roster, to be created as the platform grows: per-panel front/back agents — rmp, cms,
  dmp, btms, mmp, nh-admin — plus QA and code-review agents. Per-panel skills and rules will
  accompany them.)*
- **Testing/QA agents — to be built, and they own verification.** Full end-to-end testing and
  flow verification are **not** done inside implementation sessions (decision 0.57). They run
  **after the platform owner reviews** the work and requests any changes, and are carried out by
  purpose-built QA agents. An implementation session may run build-time smoke checks and must
  describe them as exactly that — never as "verified".

Flow: user → Archon (analyze → recommend/ask → **approval**) → Hermes (task breakdown) →
implementation agents → Archon reviews + verifies (build/type-check, code/security review).

## Active project: papi-authority

This repo is the build home of **`papi-authority`** — the platform's central identity/auth
service, built from scratch in `papi-authority/` (dir created at Phase 1).

- **Start here:** `.claude/papi-authority-tech-plan.md` — phased execution plan (phase-by-phase, user approval before each phase).
- **Full context:** `.claude/papi-authority-plan.md` — self-contained discovery dossier: all locked decisions, current-state findings, target design, verification criteria, and the knowledge map of the reference monorepo.
- **Reference monorepo (READ-ONLY, never modify):** `/Users/rafayelmovsesyan/Desktop/nrg/platform-admin` — 8 NestJS backends + 8 React frontends (`papi-back` = skeleton conventions, `rmp-backend` = data superset, `access-control-backend` = future console). See the dossier's Part O for the full map.

## Commits
- Never create a git commit unless the user explicitly asks for one.

## Finishing work
- Run the project's build or type-check command (e.g. `npm run build`, `tsc --noEmit`) before declaring a feature complete. Fix any type errors before stopping.

## Patterns
- Before implementing a pattern from scratch, check if the project has a skill (`.claude/skills/`) that already documents the correct approach for this codebase.

## Prompt Clarification Protocol

Before starting ANY task, evaluate whether the prompt is complete and unambiguous.

Always ask clarifying questions first if any of the following are missing:
- The target files, directories, or scope are not specified
- The expected output or success criteria are unclear
- There are multiple reasonable interpretations of the request
- Required context (language, framework, environment) is not obvious from the codebase
- Edge cases or error handling expectations are unspecified
- The desired behavior conflicts with existing code patterns

Always use the AskUserQuestion tool to ask clarifying questions, and wait for answers before proceeding.

Do NOT make assumptions silently. If something is ambiguous, ask. If you would normally assume something, state the assumption and ask for confirmation instead.

**Every question must carry a simple, concrete example.** Never ask an abstract question. Each option
gets a short code/config/SQL snippet showing what it actually looks like, plus one line on what breaks
or improves if it is chosen. If an option cannot be shown in an example, it is not yet understood well
enough to ask about.

> Bad: "Should we use path aliases or relative imports?"
> Good: "Option A — `import { UserEntity } from '$/api/users/entities/user.entity';`
> Option B — `import { UserEntity } from '../../users/entities/user.entity';`
> A stays stable when files move; B breaks on every directory change."

**Question format by session type:** Archon sessions use plain-text numbered questions, each with a
one-line bold recommendation (the user answers "1A, 2B"). All other sessions use the `AskUserQuestion`
tool. Both are bound by the example rule above.

## Context management

When context usage exceeds **50%**, make the transcript expendable: write every decision, finding and
piece of current state into the plan files (see below), then tell the user the state is recorded and
that they can run `/compact`. Do not stop working or hand off — carry on building; the harness will
summarize automatically when it needs to.

**`/compact` is a user-side command — the assistant cannot trigger it.** What the assistant *can* and
must do is ensure nothing important lives only in the conversation. The test is simple: if this
transcript vanished right now, could a fresh session pick the work up from the plan files alone? Keep
a **CURRENT STATE** section in the tech plan answering that — which phases are done with their
evidence, and the runtime facts a new session would otherwise rediscover the hard way (required env
setup, service ports, local bootstrap sequence, verification gates, what is and is not committed).

## Decision logging — architectural and business decisions must never live only in chat

Whenever a decision is made while architecting, planning, or organizing work — a locked technology
choice, a schema/security trade-off, a scope change, a deferral, a scheduled future action — write it
into the appropriate markdown plan file **in the same turn it is decided**, before moving on:

- `.claude/papi-authority-tech-plan.md` — phase-level execution decisions (what to build, in what
  order, pinned versions, per-phase scope changes).
- `.claude/papi-authority-plan.md` — the dossier. Locked decisions go in **Part 0** with the date
  and the rationale; current-state findings go in the relevant Part.

Record the decision, the reason, the rejected alternatives, and any date-bound follow-up. A decision
that exists only in the conversation is considered lost.
