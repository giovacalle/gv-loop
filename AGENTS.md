# gv-loop Agent Instructions

`gv-loop` is a small local scheduler for Codex CLI prompts.

## Scope

- Keep v1 local, macOS-first, and Bun/TypeScript-based.
- Do not add cloud, database, Telegram, PR, or remote sandbox assumptions.
- Do not generate shell commands from user prompts in v1.
- Scheduled jobs should call `gv-loop run <id> --scheduled`, not embed complex shell in launchd plists.
- Preserve traceability: every run should keep `trace.jsonl`, `final.md`, stderr/stdout logs, exit code, and metadata.

## Commands

- Install dependencies: `bun install`
- Run tests: `bun test`
- Typecheck: `bun run typecheck`
- Full check: `bun run check`

## Safety

- Do not create a remote origin or push unless the operator explicitly approves.
- Keep generated run outputs local and out of Git.
- Avoid broad environment propagation into scheduled Codex runs.
