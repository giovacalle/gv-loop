import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { checkSpawnPolicy, type SpawnPolicy } from "./policy";
import { parseSpawnIntentJson, type SpawnIntent } from "./spawn-intents";
import { defaultTaskId, saveTask, taskFromDraft } from "./task-store";
import type { TaskSpec } from "./types";

export type SpawnProcessingInput = {
  parentTask: TaskSpec;
  runId: string;
  intentsDir: string;
  policy: SpawnPolicy;
  home?: string;
};

export type SpawnIntentResult =
  | {
      status: "accepted";
      file: string;
      taskId: string;
      intent: SpawnIntent;
    }
  | {
      status: "rejected";
      file: string;
      reasons: string[];
      intent?: SpawnIntent;
    };

export type SpawnProcessingResult = {
  accepted: SpawnIntentResult[];
  rejected: SpawnIntentResult[];
};

export async function processSpawnIntents(input: SpawnProcessingInput): Promise<SpawnProcessingResult> {
  await mkdir(input.intentsDir, { recursive: true });
  const files = (await readdir(input.intentsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "result.json")
    .map((entry) => join(input.intentsDir, entry.name))
    .sort();

  const accepted: SpawnIntentResult[] = [];
  const rejected: SpawnIntentResult[] = [];
  let childrenSpawnedThisRun = 0;

  for (const file of files) {
    let intent: SpawnIntent;
    try {
      intent = parseSpawnIntentJson(await readFile(file, "utf8"));
    } catch (error) {
      rejected.push({
        status: "rejected",
        file,
        reasons: [error instanceof Error ? error.message : String(error)],
      });
      continue;
    }

    const decision = checkSpawnPolicy(intent, input.policy, {
      parentDepth: input.parentTask.parent?.depth ?? 0,
      childrenSpawnedThisRun,
    });
    if (!decision.allowed) {
      rejected.push({ status: "rejected", file, reasons: decision.reasons, intent });
      continue;
    }

    const title = intent.title ?? intent.prompt.split(/\s+/).slice(0, 6).join(" ");
    const child = taskFromDraft({
      id: defaultTaskId(`${title}-${basename(file, ".json")}`),
      title,
      prompt: intent.prompt,
      cwd: intent.cwd,
      sandbox: intent.sandbox,
      yolo: intent.yolo,
      source: { kind: "spawn-intent", path: file },
      parent: {
        taskId: input.parentTask.id,
        runId: input.runId,
        depth: (input.parentTask.parent?.depth ?? 0) + 1,
        ...(intent.reason ? { reason: intent.reason } : {}),
      },
    });
    await saveTask(child, input.home);
    accepted.push({ status: "accepted", file, taskId: child.id, intent });
    childrenSpawnedThisRun++;
  }

  const result = { accepted, rejected };
  await writeFile(join(input.intentsDir, "result.json"), `${JSON.stringify(toSerializableResult(result), null, 2)}\n`);
  return result;
}

function toSerializableResult(result: SpawnProcessingResult) {
  return {
    accepted: result.accepted.map((item) => ({
      status: item.status,
      file: basename(item.file),
      ...(item.status === "accepted" ? { taskId: item.taskId, intent: item.intent } : {}),
    })),
    rejected: result.rejected.map((item) => ({
      status: item.status,
      file: basename(item.file),
      reasons: item.status === "rejected" ? item.reasons : [],
      ...(item.status === "rejected" && item.intent ? { intent: item.intent } : {}),
    })),
  };
}
