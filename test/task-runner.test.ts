import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { claimTask, listTasks, readTask, saveTask, taskFromDraft } from "../src/task-store";
import { runTask } from "../src/task-runner";

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
  tempHome = undefined;
});

describe("task runner", () => {
  test("runs a claimed task through an injected executor", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-task-runner-test-"));
    await saveTask(
      taskFromDraft({
        id: "run-me",
        title: "Run me",
        prompt: "Do useful work.",
        cwd: "/tmp/project",
      }),
      tempHome
    );
    await claimTask("run-me", "worker-a", tempHome);

    const metadata = await runTask("run-me", tempHome, async ({ cwd, prompt, runner }) => {
      expect(cwd).toBe("/tmp/project");
      expect(prompt.trim()).toBe("Do useful work.");
      expect(runner.yolo).toBe(false);
      return {
        stdout: `${JSON.stringify({ type: "agent_message", text: "completed task" })}\n`,
        stderr: "",
        exitCode: 0,
      };
    });

    expect(metadata.exitCode).toBe(0);
    expect(metadata.summaryPath).toBeTruthy();
    expect(await readFile(metadata.finalPath, "utf8")).toBe("completed task\n");
    expect(await readFile(metadata.summaryPath!, "utf8")).toContain('"status": "done"');
    expect((await readTask("run-me", tempHome)).status.state).toBe("done");
  });

  test("marks failed task runs as failed", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-task-runner-test-"));
    await saveTask(taskFromDraft({ id: "fail-me", title: "Fail me", prompt: "fail", cwd: "/tmp/project" }), tempHome);
    await claimTask("fail-me", "worker-a", tempHome);

    const metadata = await runTask("fail-me", tempHome, async () => ({
      stdout: "",
      stderr: "boom",
      exitCode: 2,
    }));

    expect(metadata.exitCode).toBe(2);
    expect(await readFile(metadata.finalPath, "utf8")).toContain("Codex failed with exit code 2");
    expect((await readTask("fail-me", tempHome)).status.state).toBe("failed");
  });

  test("processes spawn intents when a spawn policy is provided", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-task-runner-test-"));
    await saveTask(taskFromDraft({ id: "spawn-parent", title: "Spawn parent", prompt: "parent", cwd: "/tmp/project" }), tempHome);
    await claimTask("spawn-parent", "worker-a", tempHome);

    await runTask("spawn-parent", tempHome, {
      spawnPolicy: {
        maxDepth: 1,
        maxChildrenPerRun: 1,
        allowedCwdRoots: ["/tmp/project"],
        allowedSandboxModes: ["workspace-write"],
      },
      execute: async ({ prompt }) => {
        const intentsDir = prompt.match(/write one JSON file per child task into:\n\n(.+?)\n\nEach file must/s)?.[1];
        expect(intentsDir).toBeTruthy();
        await writeFile(
          join(intentsDir!, "child.json"),
          `${JSON.stringify({
            version: 1,
            kind: "spawn",
            title: "Child from run",
            prompt: "child prompt",
            cwd: "/tmp/project/child",
          })}\n`
        );
        return {
          stdout: `${JSON.stringify({ type: "agent_message", text: "parent done" })}\n`,
          stderr: "",
          exitCode: 0,
        };
      },
    });

    const child = (await listTasks(tempHome)).find((task) => task.id !== "spawn-parent");
    expect(child).toMatchObject({
      title: "Child from run",
      prompt: "child prompt",
      cwd: "/tmp/project/child",
      source: { kind: "spawn-intent" },
      parent: { taskId: "spawn-parent", depth: 1 },
    });
  });

  test("runs worktree-enabled tasks in an isolated worktree cwd", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-task-runner-test-"));
    await saveTask(
      taskFromDraft({
        id: "isolated-task",
        title: "Isolated task",
        prompt: "edit code",
        cwd: "/repo/apps/web",
        worktree: { enabled: true },
      }),
      tempHome
    );
    await claimTask("isolated-task", "worker-a", tempHome);

    const metadata = await runTask("isolated-task", tempHome, {
      git: async (args) => {
        if (args.join(" ") === "rev-parse --show-toplevel") {
          return { stdout: "/repo\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      execute: async ({ cwd, prompt }) => {
        expect(cwd).toBe(join(tempHome!, "worktrees", "isolated-task", "apps/web"));
        expect(prompt).toContain("gv-loop worktree isolation is enabled");
        expect(prompt).toContain("gv-loop/isolated-task");
        return {
          stdout: `${JSON.stringify({ type: "agent_message", text: "done in worktree" })}\n`,
          stderr: "",
          exitCode: 0,
        };
      },
    });

    expect(metadata.cwd).toBe(join(tempHome, "worktrees", "isolated-task", "apps/web"));
    const summary = await readFile(metadata.summaryPath!, "utf8");
    expect(summary).toContain('"branch": "gv-loop/isolated-task"');
    expect(summary).toContain('"changedFiles": []');
    expect((await readTask("isolated-task", tempHome)).worktree).toMatchObject({
      enabled: true,
      branch: "gv-loop/isolated-task",
      path: join(tempHome, "worktrees", "isolated-task"),
      originalCwd: "/repo/apps/web",
    });
  });
});
