import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

export type ScratchIssue = {
  path: string;
  relativePath: string;
  title: string;
  status: string;
  category?: string;
  type?: string;
};

export type ScratchIssueClaim = {
  workerId: string;
  claimedAt?: Date;
  comment?: string;
};

export type ScratchIssueCompletion = {
  completedAt?: Date;
  comment: string;
};

export function scratchDir(workspace: string): string {
  return join(workspace, ".scratch");
}

export async function listReadyScratchIssues(workspace: string): Promise<ScratchIssue[]> {
  const dir = scratchDir(workspace);
  const files = await markdownIssueFiles(dir);
  const issues: ScratchIssue[] = [];

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const parsed = parseScratchIssue(text, file, relative(workspace, file));
    if (parsed.status === "ready-for-agent") issues.push(parsed);
  }

  return issues.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function parseScratchIssue(text: string, path: string, relativePath: string): ScratchIssue {
  const status = metadataValue(text, "Status");
  if (!status) throw new Error(`Scratch issue ${relativePath} is missing Status.`);

  const category = metadataValue(text, "Category");
  const type = metadataValue(text, "Type");
  const issue: ScratchIssue = {
    path,
    relativePath,
    title: issueTitle(text, relativePath),
    status,
  };

  if (category) issue.category = category;
  if (type) issue.type = type;
  return issue;
}

export async function markScratchIssueClaimed(path: string, claim: ScratchIssueClaim): Promise<ScratchIssue> {
  const text = await readFile(path, "utf8");
  const currentStatus = metadataValue(text, "Status");
  if (currentStatus !== "ready-for-agent") {
    throw new Error(`Scratch issue is not ready-for-agent; current status is ${currentStatus ?? "missing"}.`);
  }

  const claimedAt = (claim.claimedAt ?? new Date()).toISOString();
  const updated = appendComment(
    updateStatus(text, "claimed"),
    `### Claimed - ${claimedAt}\n\nWorker: ${claim.workerId}${claim.comment ? `\n\n${claim.comment.trim()}` : ""}`
  );
  await writeFile(path, updated);
  return parseScratchIssue(updated, path, path);
}

export async function markScratchIssueCompleted(
  path: string,
  completion: ScratchIssueCompletion
): Promise<ScratchIssue> {
  const text = await readFile(path, "utf8");
  const completedAt = (completion.completedAt ?? new Date()).toISOString();
  const updated = appendComment(updateStatus(text, "completed"), `### Completed - ${completedAt}\n\n${completion.comment.trim()}`);
  await writeFile(path, updated);
  return parseScratchIssue(updated, path, path);
}

function metadataValue(text: string, key: string): string | undefined {
  const pattern = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "im");
  return text.match(pattern)?.[1]?.trim();
}

function issueTitle(text: string, fallback: string): string {
  const heading = text.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim();
  if (heading) return heading;
  const frontmatterTitle = metadataValue(text, "title");
  return frontmatterTitle ?? fallback;
}

function updateStatus(text: string, status: string): string {
  if (!/^Status:\s*.+$/im.test(text)) {
    throw new Error("Scratch issue is missing Status.");
  }
  return text.replace(/^Status:\s*.+$/im, `Status: ${status}`);
}

function appendComment(text: string, comment: string): string {
  const trimmedText = text.trimEnd();
  const trimmedComment = comment.trim();
  if (/^## Comments\s*$/im.test(trimmedText)) {
    return `${trimmedText}\n\n${trimmedComment}\n`;
  }
  return `${trimmedText}\n\n## Comments\n\n${trimmedComment}\n`;
}

async function markdownIssueFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  await collectMarkdownIssueFiles(dir, dir, files);
  return files;
}

async function collectMarkdownIssueFiles(root: string, dir: string, files: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownIssueFiles(root, path, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md") && relative(root, path).split("/").includes("issues")) {
      files.push(path);
    }
  }
}
