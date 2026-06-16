import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { LoopSpec, Schedule } from "./types";
import { launchdDir } from "./paths";
import { escapeXml } from "./util";

export function launchdLabel(id: string): string {
  return `com.gv.loop.${id}`;
}

export function userLaunchAgentsDir(): string {
  return join(process.env.HOME ?? "", "Library", "LaunchAgents");
}

export function renderLaunchdPlist(spec: LoopSpec, cliPath: string): string {
  const schedule = renderSchedule(spec.schedule);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(launchdLabel(spec.id))}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(cliPath)}</string>
    <string>run</string>
    <string>${escapeXml(spec.id)}</string>
    <string>--scheduled</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(spec.cwd)}</string>
${schedule}
  <key>StandardOutPath</key>
  <string>${escapeXml(join(launchdDir(spec.id), "launchd.out.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(launchdDir(spec.id), "launchd.err.log"))}</string>
</dict>
</plist>
`;
}

export async function writeLaunchdPlist(spec: LoopSpec, cliPath: string, home?: string): Promise<string> {
  const dir = launchdDir(spec.id, home);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${launchdLabel(spec.id)}.plist`);
  await writeFile(path, renderLaunchdPlist(spec, cliPath));
  return path;
}

export async function installLaunchdPlist(spec: LoopSpec, plistPath: string): Promise<string> {
  const dest = join(userLaunchAgentsDir(), basename(plistPath));
  await mkdir(userLaunchAgentsDir(), { recursive: true });
  await writeFile(dest, await Bun.file(plistPath).text());
  const proc = Bun.spawn(["launchctl", "bootstrap", `gui/${process.getuid?.() ?? ""}`, dest], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`launchctl bootstrap failed for ${spec.id}: ${err.trim()}`);
  }
  return dest;
}

export async function pauseLaunchd(id: string): Promise<void> {
  const proc = Bun.spawn(["launchctl", "bootout", `gui/${process.getuid?.() ?? ""}/${launchdLabel(id)}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
}

export async function resumeLaunchd(spec: LoopSpec, cliPath: string, home?: string): Promise<void> {
  await pauseLaunchd(spec.id);
  const plist = await writeLaunchdPlist(spec, cliPath, home);
  await installLaunchdPlist(spec, plist);
}

export async function removeLaunchd(id: string): Promise<void> {
  await pauseLaunchd(id);
  await rm(join(userLaunchAgentsDir(), `${launchdLabel(id)}.plist`), { force: true });
}

function renderSchedule(schedule: Schedule): string {
  if (schedule.kind === "calendar") {
    return `  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${schedule.hour}</integer>
    <key>Minute</key>
    <integer>${schedule.minute}</integer>
  </dict>`;
  }
  if (schedule.kind === "interval") {
    return `  <key>StartInterval</key>
  <integer>${schedule.seconds}</integer>`;
  }
  throw new Error("launchd v1 does not install cron expressions directly; use HH:MM or interval.");
}
