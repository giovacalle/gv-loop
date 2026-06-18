#!/usr/bin/env bun
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { draftLoopFromInput, scheduleToHuman, type AddOptions } from "./schedule";
import { gvLoopHome, launchdDir, loopDir } from "./paths";
import { ensureHome, latestRunDir, listLoops, loopFromDraft, readLoop, saveLoop, writeLoop } from "./store";
import { installLaunchdPlist, pauseLaunchd, removeLaunchd, resumeLaunchd, writeLaunchdPlist } from "./launchd";
import { runLoop } from "./runner";
import { runTask } from "./task-runner";
import { claimNextTask, claimTask, defaultTaskId, listTasks, readTask, saveTask, taskFromDraft } from "./task-store";
import type { SpawnPolicy } from "./policy";
import type { DraftTask, SandboxMode } from "./types";
import { expandTilde, isTruthyAnswer, slugify } from "./util";

type Parsed = {
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
};

async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  switch (parsed.command) {
    case "add":
      await add(parsed);
      break;
    case "run":
      await run(parsed);
      break;
    case "task":
    case "tasks":
      await task(parsed);
      break;
    case "list":
      await list();
      break;
    case "show":
    case "report":
      await show(parsed);
      break;
    case "logs":
      await logs(parsed);
      break;
    case "pause":
      await pause(parsed);
      break;
    case "resume":
      await resume(parsed);
      break;
    case "remove":
    case "rm":
      await remove(parsed);
      break;
    case "doctor":
      await doctor();
      break;
    case "help":
    case "":
      printHelp();
      break;
    default:
      throw new Error(`Unknown command "${parsed.command}". Run gv-loop help.`);
  }
}

async function add(parsed: Parsed): Promise<void> {
  await ensureHome();
  const prompt = await resolvePrompt(parsed);
  if (!prompt) {
    throw new Error(
      "Missing prompt. Example: gv-loop add \"every day at 3 check the logs\" or gv-loop add --schedule 03:00 --prompt-file prompt.md"
    );
  }
  const options: AddOptions = {};
  setIfPresent(options, "id", stringFlag(parsed, "id"));
  setIfPresent(options, "title", stringFlag(parsed, "title"));
  setIfPresent(options, "schedule", stringFlag(parsed, "schedule"));
  setIfPresent(options, "cwd", stringFlag(parsed, "cwd"));
  setIfPresent(options, "timezone", stringFlag(parsed, "timezone"));
  setIfPresent(options, "codexHome", stringFlag(parsed, "codex-home"));
  setIfPresent(options, "notify", notifyFlag(parsed));
  setIfPresent(options, "sandbox", sandboxFlag(parsed));
  setIfPresent(options, "yolo", yoloFlag(parsed));
  const draft = draftLoopFromInput(prompt, options);
  const spec = loopFromDraft(draft);

  console.log(`Loop: ${spec.id}`);
  console.log(`Schedule: ${scheduleToHuman(spec.schedule)} (${spec.timezone})`);
  console.log(`Prompt: ${spec.prompt}`);
  console.log(`Working directory: ${spec.cwd}`);
  if (spec.runner.codexHome) console.log(`Codex home: ${spec.runner.codexHome}`);
  console.log(`Runner: ${runnerLabel(spec.runner.yolo, spec.runner.sandbox)}`);
  console.log(`Notify: ${spec.output.notify}`);
  console.log(`Store: ${loopDir(spec.id)}`);

  if (!parsed.flags.yes) {
    const answer = await promptLine("Install this loop? [y/N] ");
    if (!isTruthyAnswer(answer)) {
      console.log("Aborted.");
      return;
    }
  }

  await saveLoop(spec);
  const cliPath = await resolveCliPath();
  const plistPath = await writeLaunchdPlist(spec, cliPath);
  if (!parsed.flags["no-install"]) {
    await installLaunchdPlist(spec, plistPath);
    console.log(`Installed launchd job from ${plistPath}`);
  } else {
    console.log(`Wrote launchd plist to ${plistPath}`);
  }
  console.log(`Saved loop at ${loopDir(spec.id)}`);
}

async function run(parsed: Parsed): Promise<void> {
  const id = requireId(parsed);
  const metadata = await runLoop(id);
  console.log(`Run complete: ${metadata.finalPath}`);
  if (metadata.exitCode !== 0) {
    process.exitCode = metadata.exitCode;
  }
}

async function task(parsed: Parsed): Promise<void> {
  const [subcommand = "list", ...rest] = parsed.args;
  const subParsed = { ...parsed, command: `task ${subcommand}`, args: rest };
  switch (subcommand) {
    case "add":
      await taskAdd(subParsed);
      break;
    case "list":
    case "ls":
      await taskList();
      break;
    case "show":
      await taskShow(subParsed);
      break;
    case "claim":
      await taskClaim(subParsed);
      break;
    case "work":
      await taskWork(subParsed);
      break;
    default:
      throw new Error(`Unknown task command "${subcommand}". Run gv-loop help.`);
  }
}

async function taskAdd(parsed: Parsed): Promise<void> {
  const prompt = await resolvePrompt(parsed);
  if (!prompt) {
    throw new Error("Missing task prompt. Example: gv-loop task add --prompt-file issue.md");
  }
  const title = stringFlag(parsed, "title") ?? prompt.split(/\s+/).slice(0, 6).join(" ");
  const id = stringFlag(parsed, "id") ?? defaultTaskId(slugify(title));
  const draft: DraftTask = {
    id,
    title,
    prompt,
    cwd: expandTilde(stringFlag(parsed, "cwd") ?? process.cwd()),
  };
  const codexHome = stringFlag(parsed, "codex-home");
  const sandbox = sandboxFlag(parsed);
  const yolo = yoloFlag(parsed);
  if (codexHome) draft.codexHome = expandTilde(codexHome);
  if (sandbox) draft.sandbox = sandbox;
  if (yolo !== undefined) draft.yolo = yolo;
  if (parsed.flags.worktree) {
    draft.worktree = { enabled: true };
    const branch = stringFlag(parsed, "worktree-branch");
    const baseBranch = stringFlag(parsed, "worktree-base");
    if (branch) draft.worktree.branch = branch;
    if (baseBranch) draft.worktree.baseBranch = baseBranch;
  }
  const spec = taskFromDraft(draft);
  await saveTask(spec);
  console.log(`Task: ${spec.id}`);
  console.log(`Status: ${spec.status.state}`);
  console.log(`Prompt: ${spec.prompt}`);
  console.log(`Working directory: ${spec.cwd}`);
  if (spec.worktree?.enabled) console.log("Worktree: enabled");
  console.log(`Runner: ${runnerLabel(spec.runner.yolo, spec.runner.sandbox)}`);
}

async function taskList(): Promise<void> {
  const tasks = await listTasks();
  if (tasks.length === 0) {
    console.log(`No tasks in ${gvLoopHome()}`);
    return;
  }
  for (const task of tasks) {
    const claim = task.status.claim ? ` ${task.status.claim.workerId}` : "";
    console.log(`${task.status.state.padEnd(8)} ${task.id.padEnd(32)} ${task.title}${claim}`);
  }
}

async function taskShow(parsed: Parsed): Promise<void> {
  const id = requireId(parsed);
  console.log(JSON.stringify(await readTask(id), null, 2));
}

async function taskClaim(parsed: Parsed): Promise<void> {
  const workerId = stringFlag(parsed, "worker-id") ?? `worker-${process.pid}`;
  const id = parsed.args[0];
  const task = id ? await claimTask(id, workerId) : await claimNextTask(workerId);
  if (!task) {
    console.log("No ready task claimed.");
    return;
  }
  console.log(`Claimed: ${task.id}`);
}

async function taskWork(parsed: Parsed): Promise<void> {
  const workerId = stringFlag(parsed, "worker-id") ?? `worker-${process.pid}`;
  const id = parsed.args[0];
  const task = id ? await claimOrUseTask(id, workerId) : await claimNextTask(workerId);
  if (!task) {
    console.log("No ready tasks.");
    return;
  }
  const spawnPolicy = await resolveSpawnPolicy(parsed);
  const metadata = await runTask(task.id, undefined, spawnPolicy ? { spawnPolicy } : undefined);
  console.log(`Task complete: ${metadata.finalPath}`);
  if (metadata.exitCode !== 0) {
    process.exitCode = metadata.exitCode;
  }
}

async function resolveSpawnPolicy(parsed: Parsed): Promise<SpawnPolicy | undefined> {
  const policyFile = stringFlag(parsed, "spawn-policy");
  if (!policyFile) return undefined;
  return JSON.parse(await readFile(expandTilde(policyFile), "utf8")) as SpawnPolicy;
}

async function claimOrUseTask(id: string, workerId: string) {
  const existing = await readTask(id);
  if (existing.status.state === "ready") {
    return claimTask(id, workerId);
  }
  if (existing.status.state === "claimed" && existing.status.claim?.workerId === workerId) {
    return existing;
  }
  throw new Error(`Task ${id} is ${existing.status.state} and cannot be worked by ${workerId}.`);
}

async function list(): Promise<void> {
  const loops = await listLoops();
  if (loops.length === 0) {
    console.log(`No loops in ${gvLoopHome()}`);
    return;
  }
  for (const loop of loops) {
    const latest = await latestRunDir(loop.id);
    console.log(
      `${loop.status.enabled ? "on " : "off"}  ${loop.id.padEnd(24)} ${scheduleToHuman(loop.schedule).padEnd(18)} ${latest ?? "never run"}`
    );
  }
}

async function show(parsed: Parsed): Promise<void> {
  const id = requireId(parsed);
  const latest = await latestRunDir(id);
  if (!latest) {
    console.log(`No runs yet for ${id}.`);
    return;
  }
  console.log(await readFile(join(latest, "final.md"), "utf8"));
}

async function logs(parsed: Parsed): Promise<void> {
  const id = requireId(parsed);
  const latest = await latestRunDir(id);
  if (!latest) {
    console.log(`No runs yet for ${id}.`);
    return;
  }
  console.log(`Run: ${latest}`);
  for (const file of ["metadata.json", "exit-code.txt", "stderr.log"]) {
    console.log(`\n--- ${file} ---`);
    console.log(await readFile(join(latest, file), "utf8"));
  }
}

async function pause(parsed: Parsed): Promise<void> {
  const id = requireId(parsed);
  const spec = await readLoop(id);
  spec.status.enabled = false;
  await writeLoop(spec);
  await pauseLaunchd(id);
  console.log(`Paused ${id}.`);
}

async function resume(parsed: Parsed): Promise<void> {
  const id = requireId(parsed);
  const spec = await readLoop(id);
  spec.status.enabled = true;
  await writeLoop(spec);
  await resumeLaunchd(spec, await resolveCliPath());
  console.log(`Resumed ${id}.`);
}

async function remove(parsed: Parsed): Promise<void> {
  const id = requireId(parsed);
  if (!parsed.flags.yes) {
    const answer = await promptLine(`Remove ${id}? [y/N] `);
    if (!isTruthyAnswer(answer)) {
      console.log("Aborted.");
      return;
    }
  }
  await removeLaunchd(id);
  await rm(loopDir(id), { recursive: true, force: true });
  console.log(`Removed ${id}.`);
}

async function doctor(): Promise<void> {
  await mkdir(gvLoopHome(), { recursive: true });
  const checks: Array<[string, boolean, string]> = [];
  checks.push(["loop home writable", true, gvLoopHome()]);
  checks.push(["platform macOS", process.platform === "darwin", process.platform]);
  checks.push(["launchctl available", await commandExists("launchctl"), "required for scheduling"]);
  checks.push(["codex available", await commandExists("codex"), "required for runs"]);
  checks.push(["bun available", await commandExists("bun"), "required for this CLI"]);
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? "ok " : "err"} ${name}${detail ? ` - ${detail}` : ""}`);
  }
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
}

function parseArgs(argv: string[]): Parsed {
  const [command = "", ...rest] = argv;
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const booleanFlags = new Set(["yes", "no-install", "scheduled", "yolo", "no-yolo", "worktree"]);
  for (let i = 0; i < rest.length; i++) {
    const part = rest[i]!;
    if (!part.startsWith("--")) {
      args.push(part);
      continue;
    }
    const raw = part.slice(2);
    if (raw.includes("=")) {
      const [key, ...value] = raw.split("=");
      flags[key!] = value.join("=");
      continue;
    }
    if (booleanFlags.has(raw)) {
      flags[raw] = true;
      continue;
    }
    const next = rest[i + 1];
    if (next && !next.startsWith("--")) {
      flags[raw] = next;
      i++;
    } else {
      flags[raw] = true;
    }
  }
  return { command, args, flags };
}

function requireId(parsed: Parsed): string {
  const id = parsed.args[0];
  if (!id) throw new Error(`Missing loop id for ${parsed.command}.`);
  return id;
}

function stringFlag(parsed: Parsed, name: string): string | undefined {
  const value = parsed.flags[name];
  return typeof value === "string" ? value : undefined;
}

function notifyFlag(parsed: Parsed): "never" | "failures" | "always" | undefined {
  const value = stringFlag(parsed, "notify");
  if (!value) return undefined;
  if (value === "never" || value === "failures" || value === "always") return value;
  throw new Error("--notify must be one of: never, failures, always.");
}

function sandboxFlag(parsed: Parsed): SandboxMode | undefined {
  const value = stringFlag(parsed, "sandbox");
  if (!value) return undefined;
  if (value === "read-only" || value === "workspace-write" || value === "danger-full-access") return value;
  throw new Error("--sandbox must be one of: read-only, workspace-write, danger-full-access.");
}

function yoloFlag(parsed: Parsed): boolean | undefined {
  if (parsed.flags.yolo && parsed.flags["no-yolo"]) {
    throw new Error("Use only one of --yolo or --no-yolo.");
  }
  if (parsed.flags.yolo && parsed.flags.sandbox) {
    throw new Error("Use either --yolo or --sandbox, not both.");
  }
  if (parsed.flags.yolo) return true;
  if (parsed.flags["no-yolo"]) return false;
  if (parsed.flags.sandbox) return false;
  return undefined;
}

async function resolvePrompt(parsed: Parsed): Promise<string> {
  const inlinePrompt = parsed.args.join(" ").trim();
  const promptFile = stringFlag(parsed, "prompt-file");
  if (!promptFile) return inlinePrompt;
  if (inlinePrompt) {
    throw new Error("Use either an inline prompt or --prompt-file, not both.");
  }
  return (await readFile(expandTilde(promptFile), "utf8")).trim();
}

function runnerLabel(yolo: boolean, sandbox: SandboxMode): string {
  if (yolo) return "codex exec --json --ephemeral --dangerously-bypass-approvals-and-sandbox";
  return `codex exec --json --ephemeral --sandbox ${sandbox}`;
}

function setIfPresent<K extends keyof AddOptions>(options: AddOptions, key: K, value: AddOptions[K] | undefined): void {
  if (value !== undefined) {
    options[key] = value;
  }
}

async function promptLine(label: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive confirmation is unavailable in this environment. Re-run with --yes.");
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(label)).trim();
  } finally {
    rl.close();
  }
}

async function commandExists(command: string): Promise<boolean> {
  const proc = Bun.spawn(["/usr/bin/env", "which", command], { stdout: "pipe", stderr: "pipe" });
  return (await proc.exited) === 0;
}

async function resolveCliPath(): Promise<string> {
  if (process.argv[1]?.startsWith("/")) return process.argv[1];
  const proc = Bun.spawn(["/usr/bin/env", "which", "gv-loop"], { stdout: "pipe", stderr: "pipe" });
  if ((await proc.exited) === 0) {
    return (await new Response(proc.stdout).text()).trim();
  }
  return join(process.cwd(), "src", "cli.ts");
}

function printHelp(): void {
  console.log(`gv-loop

Usage:
  gv-loop add [--id id] [--schedule HH:MM|cron|3600s] [--cwd path] [--prompt-file path] [--codex-home path] [--yolo|--no-yolo] [--sandbox read-only|workspace-write|danger-full-access] [--notify never|failures|always] [--yes] [--no-install] "prompt"
  gv-loop run <id>
  gv-loop task add [--id id] [--cwd path] [--prompt-file path] [--codex-home path] [--worktree] [--worktree-branch branch] [--worktree-base ref] [--yolo|--no-yolo] [--sandbox read-only|workspace-write|danger-full-access] "prompt"
  gv-loop task list
  gv-loop task show <id>
  gv-loop task claim [id] [--worker-id id]
  gv-loop task work [id] [--worker-id id] [--spawn-policy policy.json]
  gv-loop list
  gv-loop show <id>
  gv-loop logs <id>
  gv-loop pause <id>
  gv-loop resume <id>
  gv-loop remove <id>
  gv-loop doctor
`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
