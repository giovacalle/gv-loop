# gv-loop

Lightweight local scheduler for Codex CLI prompts.

`gv-loop` is intentionally small: it stores a prompt, schedules it with macOS `launchd`, runs it with `codex exec --json --sandbox read-only`, and keeps a local trace plus final report.

```bash
gv-loop add "every night at 3 check AppX logs and tell me if anything looks wrong"
gv-loop list
gv-loop run appx-nightly-check
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
gv-loop add --id work-profile --schedule 08:00 --codex-home ~/.codex-work "check the work repo"
gv-loop add --id done-ping --schedule 09:00 --notify always "write a tiny status report"
gv-loop run portfolio-todos
gv-loop list
gv-loop show portfolio-todos
gv-loop logs portfolio-todos
gv-loop pause portfolio-todos
gv-loop resume portfolio-todos
gv-loop remove portfolio-todos
```

## Safety

v1 does not generate shell commands. It only schedules the saved prompt and runs Codex in the configured working directory. Generated `launchd` jobs call `gv-loop run <id> --scheduled`; they do not embed complex shell.

Do not put secrets in prompts. `trace.jsonl` may contain command output, model messages, and tool-call metadata, so keep `~/.gv-loops` private.

Use `--codex-home <path>` when a loop should run with a specific Codex config/auth directory. The path is saved in `loop.json` and passed as `CODEX_HOME` to scheduled runs.

Use `--notify never|failures|always` to control macOS notifications. The default is `failures`; `always` gives you a simple done notification after successful runs.
