import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { processSpawnIntents } from "../src/spawn-processor";
import { listTasks, saveTask, taskFromDraft } from "../src/task-store";

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
  tempHome = undefined;
});

describe("spawn processor", () => {
  test("creates child tasks for accepted spawn intents and records rejected intents", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-spawn-processor-test-"));
    const parent = taskFromDraft({
      id: "parent-task",
      title: "Parent task",
      prompt: "Parent work",
      cwd: "/tmp/project",
    });
    await saveTask(parent, tempHome);

    const intentsDir = join(tempHome, "intents");
    await mkdir(intentsDir, { recursive: true });
    await writeFile(
      join(intentsDir, "accepted.json"),
      `${JSON.stringify({
        version: 1,
        kind: "spawn",
        title: "Child task",
        prompt: "Do child work",
        cwd: "/tmp/project/packages/a",
        sandbox: "workspace-write",
        yolo: false,
        reason: "Split from parent",
      })}\n`
    );
    await writeFile(
      join(intentsDir, "rejected.json"),
      `${JSON.stringify({
        version: 1,
        kind: "spawn",
        prompt: "Do unsafe work",
        cwd: "/tmp/other",
        sandbox: "danger-full-access",
        yolo: true,
      })}\n`
    );

    const result = await processSpawnIntents({
      parentTask: parent,
      runId: "run-1",
      intentsDir,
      home: tempHome,
      policy: {
        maxDepth: 1,
        maxChildrenPerRun: 1,
        allowedCwdRoots: ["/tmp/project"],
        allowedSandboxModes: ["workspace-write"],
      },
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    const child = (await listTasks(tempHome)).find((task) => task.id !== "parent-task");
    expect(child).toMatchObject({
      title: "Child task",
      prompt: "Do child work",
      cwd: "/tmp/project/packages/a",
      source: { kind: "spawn-intent", path: join(intentsDir, "accepted.json") },
      parent: { taskId: "parent-task", runId: "run-1", depth: 1, reason: "Split from parent" },
      status: { state: "ready" },
    });
    expect(await readFile(join(intentsDir, "result.json"), "utf8")).toContain("rejected");
  });
});
