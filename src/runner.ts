import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readLoop, readPrompt } from "./store";
import { runsDir } from "./paths";
import { timestampId } from "./util";
import type { RunMetadata } from "./types";

export async function runLoop(id: string, home?: string): Promise<RunMetadata> {
  const spec = await readLoop(id, home);
  const prompt = await readPrompt(id, home);
  const startedAt = new Date();
  const runDir = join(runsDir(id, home), timestampId(startedAt));
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "prompt.md"), prompt);

  const args = ["exec", "--json", "--ephemeral", "--sandbox", spec.runner.sandbox, prompt.trim()];
  const proc = Bun.spawn(["codex", ...args], {
    cwd: spec.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: runnerEnv(spec.runner.codexHome),
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const final = extractFinalMessage(stdout) ?? fallbackFinal(exitCode, stderr);
  const finishedAt = new Date();
  const tracePath = join(runDir, "trace.jsonl");
  const finalPath = join(runDir, "final.md");
  await writeFile(tracePath, stdout);
  await writeFile(join(runDir, "stdout.log"), stdout);
  await writeFile(join(runDir, "stderr.log"), stderr);
  await writeFile(join(runDir, "exit-code.txt"), `${exitCode}\n`);
  await writeFile(finalPath, final.trim() ? `${final.trim()}\n` : "\n");

  const metadata: RunMetadata = {
    loopId: id,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    cwd: spec.cwd,
    exitCode,
    tracePath,
    finalPath,
  };
  await writeFile(join(runDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  if (exitCode !== 0 && (spec.output.notify === "failures" || spec.output.notify === "always")) {
    await notify(`gv-loop: ${id} failed`, `Exit code ${exitCode}`);
  } else if (exitCode === 0 && spec.output.notify === "always") {
    await notify(`gv-loop: ${id} complete`, final.slice(0, 120));
  }
  return metadata;
}

export function extractFinalMessage(jsonl: string): string | undefined {
  let final: string | undefined;
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as {
        type?: string;
        item?: { type?: string; text?: string };
        text?: string;
      };
      if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
        final = event.item.text;
      } else if (event.type === "agent_message" && event.text) {
        final = event.text;
      }
    } catch {
      // Keep scanning; stdout should be JSONL but we tolerate noisy lines.
    }
  }
  return final;
}

function fallbackFinal(exitCode: number, stderr: string): string {
  if (exitCode === 0) return "Codex completed without a final message.";
  return `Codex failed with exit code ${exitCode}.\n\n${stderr.trim()}`;
}

function runnerEnv(codexHome?: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ["HOME", "PATH", "USER", "SHELL", "TERM", "TMPDIR", "CODEX_HOME", "XDG_CONFIG_HOME"]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  if (codexHome) env.CODEX_HOME = codexHome;
  return env;
}

async function notify(title: string, message: string): Promise<void> {
  if (process.platform !== "darwin") return;
  const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
  const proc = Bun.spawn(["osascript", "-e", script], { stdout: "pipe", stderr: "pipe", env: runnerEnv() });
  await proc.exited;
}
