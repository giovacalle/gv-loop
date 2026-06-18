# gv-loop

Lightweight local scheduler for Codex CLI prompts.

`gv-loop` is intentionally small: it stores a prompt, schedules it with macOS `launchd`, runs it with `codex exec --json`, and keeps a local trace plus final report.

By default, loops run Codex in yolo mode:

```text
codex exec --json --ephemeral --dangerously-bypass-approvals-and-sandbox
```

Use `--no-yolo --sandbox read-only` or `--sandbox workspace-write` when a loop should be constrained.

```bash
gv-loop add "every night at 3 check AppX logs and tell me if anything looks wrong"
gv-loop list
gv-loop run appx-nightly-check
gv-loop task add --id issue-001 --prompt-file ./prompts/issue-001.md
gv-loop task work
gv-loop show appx-nightly-check
gv-loop logs appx-nightly-check
gv-loop pause appx-nightly-check
gv-loop resume appx-nightly-check
```

## Install For Local Development

```bash
bun install
bun link
gv-loop doctor
```

Or run without linking:

```bash
bun src/cli.ts doctor
```

## Storage

By default, loops live under:

```text
~/.gv-loops/
  loops/<id>/
    loop.json
    prompt.md
    state.md
    runs/<timestamp>/
      prompt.md
      trace.jsonl
      final.md
      stdout.log
      stderr.log
      exit-code.txt
      metadata.json
      summary.json
  tasks/<id>/
    task.json
    prompt.md
    claim.lock/
    runs/<timestamp>/
      prompt.md
      trace.jsonl
      final.md
      stdout.log
      stderr.log
      exit-code.txt
      metadata.json
  worktrees/<id>/
```

Override the store for tests or experiments:

```bash
GV_LOOP_HOME=/tmp/gv-loop gv-loop list
```

## Commands

```bash
gv-loop doctor
gv-loop add "every day at 8 check the portfolio repo and summarize TODOs"
gv-loop add --id portfolio-todos --schedule "0 8 * * *" --cwd ~/Desktop/projects/personal/portfolio "check TODOs and summarize"
gv-loop add --id afk-feature --schedule "3600s" --cwd ~/Desktop/projects/personal/gv-kit --prompt-file ./prompts/afk-feature.md
gv-loop add --id work-profile --schedule 08:00 --codex-home ~/.codex-work "check the work repo"
gv-loop add --id safe-report --schedule 09:00 --no-yolo --sandbox read-only "summarize TODOs without editing files"
gv-loop add --id done-ping --schedule 09:00 --notify always "write a tiny status report"
gv-loop run portfolio-todos
gv-loop task add --id ready-issue --cwd ~/Desktop/projects/personal/gv-loop --prompt-file ./prompts/ready-issue.md
gv-loop task add --id isolated-change --cwd ~/Desktop/projects/personal/gv-loop --worktree --worktree-base main "make the scoped change"
gv-loop task list
gv-loop task claim ready-issue --worker-id local-worker
gv-loop task work ready-issue --worker-id local-worker
gv-loop task work ready-issue --spawn-policy ./spawn-policy.json
gv-loop task result ready-issue
gv-loop task review ready-issue
gv-loop list
gv-loop show portfolio-todos
gv-loop logs portfolio-todos
gv-loop pause portfolio-todos
gv-loop resume portfolio-todos
gv-loop remove portfolio-todos
```

## Agentic Control Plane

The first control-plane primitives are available as file-backed APIs and `task` CLI commands:

- **Task**: one-shot prompt work item. Unlike a loop, it is not installed into `launchd`.
- **Claim**: local lock and status transition that lets one worker own one ready task.
- **Worker**: `gv-loop task work` claims one ready task, runs Codex, writes artifacts, and exits.
- **Worktree isolation**: `gv-loop task add --worktree` runs the task in `~/.gv-loops/worktrees/<id>` on a dedicated branch.
- **Result contract**: every task run writes `summary.json` with task/run metadata, worktree details, diff summary, and spawn intent results.
- **Review task**: `gv-loop task review <id>` creates a read-only child task from the latest `summary.json` and `final.md`.
- **Spawn intent**: structured JSON request for child work. The parser defaults to `sandbox: "workspace-write"` and `yolo: false`.
- **Policy**: validation for spawn depth, children per run, allowed cwd roots, allowed sandbox modes, and yolo permission.

Queue sources are intentionally outside the core. A user can feed tasks from any system by calling `gv-loop task add` from their own prompt, script, or loop. `examples/adapters/` contains optional reference adapters for specific workflow styles.

Spawn intent shape:

```json
{
  "version": 1,
  "kind": "spawn",
  "prompt": "Implement the next narrow slice.",
  "cwd": "/Users/me/project",
  "sandbox": "workspace-write",
  "yolo": false
}
```

Spawn intents are inert unless the worker receives an explicit policy:

```json
{
  "maxDepth": 1,
  "maxChildrenPerRun": 2,
  "allowedCwdRoots": ["/Users/me/project"],
  "allowedSandboxModes": ["read-only", "workspace-write"]
}
```

With `gv-loop task work --spawn-policy ./spawn-policy.json`, the task prompt includes the run's spawn-intent directory. Accepted intents become ready child tasks; rejected intents are recorded with reasons in `spawn-intents/result.json`.

## Safety

v1 does not generate shell commands. It only schedules the saved prompt and runs Codex in the configured working directory. Generated `launchd` jobs call `gv-loop run <id> --scheduled`; they do not embed complex shell.

Do not put secrets in prompts. `trace.jsonl` may contain command output, model messages, and tool-call metadata, so keep `~/.gv-loops` private.

Use `--codex-home <path>` when a loop should run with a specific Codex config/auth directory. The path is saved in `loop.json` and passed as `CODEX_HOME` to scheduled runs.

Use `--prompt-file <path>` for longer prompts. The file contents are copied into the loop's saved `prompt.md` when the loop is created.

Use `--sandbox read-only|workspace-write|danger-full-access` to disable yolo mode and run Codex with that sandbox. Use `--no-yolo` explicitly when you want the default sandbox behavior without relying on `--sandbox`.

Use `--notify never|failures|always` to control macOS notifications. The default is `failures`; `always` gives you a simple done notification after successful runs.
