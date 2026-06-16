#!/usr/bin/env bun
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { draftLoopFromInput, scheduleToHuman, type AddOptions } from "./schedule";
import { gvLoopHome, launchdDir, loopDir } from "./paths";
import { ensureHome, latestRunDir, listLoops, loopFromDraft, readLoop, saveLoop, writeLoop } from "./store";
import { installLaunchdPlist, pauseLaunchd, removeLaunchd, resumeLaunchd, writeLaunchdPlist } from "./launchd";
import { runLoop } from "./runner";
import { isTruthyAnswer } from "./util";

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
  const prompt = parsed.args.join(" ").trim();
  if (!prompt) throw new Error("Missing prompt. Example: gv-loop add \"every day at 3 check the logs\"");
  const options: AddOptions = {};
  setIfPresent(options, "id", stringFlag(parsed, "id"));
  setIfPresent(options, "title", stringFlag(parsed, "title"));
  setIfPresent(options, "schedule", stringFlag(parsed, "schedule"));
  setIfPresent(options, "cwd", stringFlag(parsed, "cwd"));
  setIfPresent(options, "timezone", stringFlag(parsed, "timezone"));
  setIfPresent(options, "codexHome", stringFlag(parsed, "codex-home"));
  setIfPresent(options, "notify", notifyFlag(parsed));
  const draft = draftLoopFromInput(prompt, options);
  const spec = loopFromDraft(draft);

  console.log(`Loop: ${spec.id}`);
  console.log(`Schedule: ${scheduleToHuman(spec.schedule)} (${spec.timezone})`);
  console.log(`Prompt: ${spec.prompt}`);
  console.log(`Working directory: ${spec.cwd}`);
  if (spec.runner.codexHome) console.log(`Codex home: ${spec.runner.codexHome}`);
  console.log(`Runner: codex exec --json --ephemeral --sandbox ${spec.runner.sandbox}`);
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
  const booleanFlags = new Set(["yes", "no-install", "scheduled"]);
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
  gv-loop add [--id id] [--schedule HH:MM|cron|3600s] [--cwd path] [--codex-home path] [--notify never|failures|always] [--yes] [--no-install] "prompt"
  gv-loop run <id>
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
