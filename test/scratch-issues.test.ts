import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listReadyScratchIssues,
  markScratchIssueClaimed,
  markScratchIssueCompleted,
  parseScratchIssue,
} from "../examples/adapters/scratch-issues";

let tempWorkspace: string | undefined;

afterEach(async () => {
  if (tempWorkspace) await rm(tempWorkspace, { recursive: true, force: true });
  tempWorkspace = undefined;
});

describe("scratch issue queue adapter", () => {
  test("lists ready issue markdown files from .scratch issue directories", async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), "gv-loop-scratch-test-"));
    await writeIssue(
      "feature-a/issues/02-ready.md",
      `# Ready issue

Status: ready-for-agent
Category: enhancement
Type: AFK

## What to build

Do the thing.
`,
    );
    await writeIssue(
      "feature-a/issues/01-done.md",
      `# Done issue

Status: completed
Category: enhancement
Type: AFK
`,
    );
    await writeIssue(
      "feature-a/PRD.md",
      `# Feature PRD

Status: ready-for-agent
Category: enhancement
`,
    );

    const issues = await listReadyScratchIssues(tempWorkspace);

    expect(issues).toEqual([
      {
        path: join(tempWorkspace, ".scratch", "feature-a/issues/02-ready.md"),
        relativePath: ".scratch/feature-a/issues/02-ready.md",
        title: "Ready issue",
        status: "ready-for-agent",
        category: "enhancement",
        type: "AFK",
      },
    ]);
  });

  test("parses title and metadata from issue markdown", () => {
    const issue = parseScratchIssue(
      `# Build queue adapter

Status: ready-for-agent
Category: enhancement
Type: HITL-light
`,
      "/workspace/.scratch/feature/issues/01.md",
      ".scratch/feature/issues/01.md",
    );

    expect(issue).toMatchObject({
      title: "Build queue adapter",
      status: "ready-for-agent",
      category: "enhancement",
      type: "HITL-light",
    });
  });

  test("marks a ready issue as claimed and appends a comment", async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), "gv-loop-scratch-test-"));
    const issuePath = await writeIssue(
      "feature-a/issues/01-ready.md",
      `# Ready issue

Status: ready-for-agent
Category: enhancement
Type: AFK
`,
    );

    const issue = await markScratchIssueClaimed(issuePath, {
      workerId: "worker-1",
      claimedAt: new Date("2026-06-18T10:00:00.000Z"),
      comment: "Imported as task task-1.",
    });

    const text = await readFile(issuePath, "utf8");
    expect(issue.status).toBe("claimed");
    expect(text).toContain("Status: claimed");
    expect(text).toContain("## Comments");
    expect(text).toContain("### Claimed - 2026-06-18T10:00:00.000Z");
    expect(text).toContain("Worker: worker-1");
    expect(text).toContain("Imported as task task-1.");
  });

  test("rejects duplicate claims once an issue is no longer ready", async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), "gv-loop-scratch-test-"));
    const issuePath = await writeIssue(
      "feature-a/issues/01-ready.md",
      `# Ready issue

Status: claimed
Category: enhancement
Type: AFK
`,
    );

    await expect(markScratchIssueClaimed(issuePath, { workerId: "worker-2" })).rejects.toThrow(
      "current status is claimed",
    );
  });

  test("marks an issue as completed and appends completion details below existing comments", async () => {
    tempWorkspace = await mkdtemp(join(tmpdir(), "gv-loop-scratch-test-"));
    const issuePath = await writeIssue(
      "feature-a/issues/01-ready.md",
      `# Ready issue

Status: claimed
Category: enhancement
Type: AFK

## Comments

### Claimed - 2026-06-18T10:00:00.000Z

Worker: worker-1
`,
    );

    const issue = await markScratchIssueCompleted(issuePath, {
      completedAt: new Date("2026-06-18T11:00:00.000Z"),
      comment: "Changed files: examples/adapters/scratch-issues.ts, test/scratch-issues.test.ts.",
    });

    const text = await readFile(issuePath, "utf8");
    expect(issue.status).toBe("completed");
    expect(text).toContain("Status: completed");
    expect(text).toContain("### Claimed - 2026-06-18T10:00:00.000Z");
    expect(text).toContain("### Completed - 2026-06-18T11:00:00.000Z");
    expect(text).toContain("Changed files: examples/adapters/scratch-issues.ts, test/scratch-issues.test.ts.");
  });
});

async function writeIssue(relativePath: string, text: string): Promise<string> {
  if (!tempWorkspace) throw new Error("tempWorkspace must be set before writing issues.");
  const path = join(tempWorkspace, ".scratch", relativePath);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
  return path;
}
