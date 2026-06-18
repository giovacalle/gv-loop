import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
  tempHome = undefined;
});

describe("CLI add", () => {
  test("creates a loop from --prompt-file", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-cli-test-"));
    const promptFile = join(tempHome, "prompt.md");
    await writeFile(promptFile, "Process exactly one issue.\n");

    const proc = Bun.spawn(
      [
        "bun",
        "src/cli.ts",
        "add",
        "--id",
        "file-prompt",
        "--schedule",
        "3600s",
        "--prompt-file",
        promptFile,
        "--yes",
        "--no-install",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, GV_LOOP_HOME: tempHome },
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("Loop: file-prompt");
    expect(await readFile(join(tempHome, "loops", "file-prompt", "prompt.md"), "utf8")).toBe(
      "Process exactly one issue.\n"
    );
  });
});
