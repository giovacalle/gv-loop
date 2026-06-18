import { readFile } from "node:fs/promises";
import { defaultTaskId, saveTask, taskFromDraft } from "./task-store";
import type { RunSummary } from "./run-summary";
import type { TaskSpec } from "./types";

export type CreateReviewTaskInput = {
  sourceTask: TaskSpec;
  summary: RunSummary;
  finalReport: string;
  home?: string;
};

export async function createReviewTask(input: CreateReviewTaskInput): Promise<TaskSpec> {
  const title = `Review ${input.sourceTask.id}`;
  const task = taskFromDraft({
    id: defaultTaskId(`${title}-${input.summary.run.id}`),
    title,
    prompt: reviewPrompt(input.summary, input.finalReport),
    cwd: input.summary.worktree?.path ?? input.summary.run.cwd,
    sandbox: "read-only",
    yolo: false,
    source: { kind: "external", path: input.summary.run.finalPath },
    parent: {
      taskId: input.sourceTask.id,
      runId: input.summary.run.id,
      depth: (input.sourceTask.parent?.depth ?? 0) + 1,
      reason: "Independent review of completed task result",
    },
  });
  await saveTask(task, input.home);
  return task;
}

export async function readFinalReport(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function reviewPrompt(summary: RunSummary, finalReport: string): string {
  const changedFiles = summary.worktree?.diff?.changedFiles ?? [];
  const spawnAccepted = summary.spawnIntents?.accepted ?? [];
  const spawnRejected = summary.spawnIntents?.rejected ?? [];
  return `Review the completed gv-loop task result independently.

Do not modify files. Do not approve your own changes. Inspect the task output, worktree state, and available evidence, then produce a concise Markdown review.

Required output:
- Verdict: PASS, FAIL, or NEEDS-HUMAN
- Findings ordered by severity
- Missing verification or residual risk
- Concrete next action

Task:
- id: ${summary.task.id}
- title: ${summary.task.title}
- status: ${summary.run.status}
- run: ${summary.run.id}
- cwd: ${summary.run.cwd}
- final report: ${summary.run.finalPath}

Worktree:
- path: ${summary.worktree?.path ?? "none"}
- branch: ${summary.worktree?.branch ?? "none"}
- changed files: ${changedFiles.length ? changedFiles.join(", ") : "none recorded"}

Spawn intents:
- accepted: ${spawnAccepted.map((item) => item.taskId).join(", ") || "none"}
- rejected: ${spawnRejected.map((item) => `${item.file}: ${item.reasons.join("; ")}`).join(" | ") || "none"}

Final report:

${finalReport.trim() || "(empty final report)"}
`;
}
