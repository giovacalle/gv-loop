import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { taskPromptPath, taskSpecPath } from "../src/paths";
import { claimNextTask, claimTask, listTasks, readTask, saveTask, taskFromDraft } from "../src/task-store";

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
  tempHome = undefined;
});

describe("task store", () => {
  test("saves a one-shot task with a prompt and ready status", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-task-test-"));
    const task = taskFromDraft({
      id: "issue-one",
      title: "Issue one",
      prompt: "Implement the first issue.",
      cwd: "/tmp/project",
    });

    await saveTask(task, tempHome);

    expect(await Bun.file(taskSpecPath("issue-one", tempHome)).exists()).toBe(true);
    expect(await readFile(taskPromptPath("issue-one", tempHome), "utf8")).toBe("Implement the first issue.\n");
    expect(await readTask("issue-one", tempHome)).toMatchObject({
      id: "issue-one",
      cwd: "/tmp/project",
      status: { state: "ready" },
      runner: { sandbox: "workspace-write", yolo: false },
    });
  });

  test("persists optional worktree settings", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-task-test-"));
    await saveTask(
      taskFromDraft({
        id: "worktree-task",
        title: "Worktree task",
        prompt: "change code",
        cwd: "/tmp/project",
        worktree: { enabled: true, baseBranch: "main", branch: "feature/task" },
      }),
      tempHome
    );

    expect(await readTask("worktree-task", tempHome)).toMatchObject({
      worktree: { enabled: true, baseBranch: "main", branch: "feature/task" },
    });
  });

  test("claims one ready task and prevents duplicate claims", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-task-test-"));
    await saveTask(
      taskFromDraft({
        id: "claimable",
        title: "Claimable",
        prompt: "Do work.",
        cwd: "/tmp/project",
      }),
      tempHome
    );

    const first = await claimTask("claimable", "worker-a", tempHome);
    const second = await claimTask("claimable", "worker-b", tempHome);

    expect(first?.status).toMatchObject({ state: "claimed", claim: { workerId: "worker-a" } });
    expect(second).toBeUndefined();
    expect((await readTask("claimable", tempHome)).status).toMatchObject({
      state: "claimed",
      claim: { workerId: "worker-a" },
    });
  });

  test("claimNextTask skips already claimed tasks", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-task-test-"));
    for (const id of ["first-task", "second-task"]) {
      await saveTask(taskFromDraft({ id, title: id, prompt: id, cwd: "/tmp/project" }), tempHome);
    }

    expect((await claimNextTask("worker-a", tempHome))?.id).toBe("first-task");
    expect((await claimNextTask("worker-b", tempHome))?.id).toBe("second-task");
    expect((await listTasks(tempHome)).map((task) => task.status.state)).toEqual(["claimed", "claimed"]);
  });
});
