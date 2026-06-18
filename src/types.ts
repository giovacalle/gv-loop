export type CalendarSchedule = {
  kind: "calendar";
  hour: number;
  minute: number;
};

export type IntervalSchedule = {
  kind: "interval";
  seconds: number;
};

export type CronSchedule = {
  kind: "cron";
  expression: string;
};

export type Schedule = CalendarSchedule | IntervalSchedule | CronSchedule;

export type NotifyMode = "never" | "failures" | "always";
export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export type RunnerSpec = {
  kind: "codex-exec";
  json: true;
  ephemeral: boolean;
  sandbox: SandboxMode;
  yolo: boolean;
  codexHome?: string;
};

export type LoopSpec = {
  id: string;
  version: 1;
  title: string;
  createdAt: string;
  cwd: string;
  timezone: string;
  schedule: Schedule;
  prompt: string;
  runner: RunnerSpec;
  output: {
    reportFormat: "markdown";
    trace: true;
    notify: NotifyMode;
  };
  status: {
    enabled: boolean;
  };
};

export type TaskState = "ready" | "claimed" | "running" | "done" | "failed" | "blocked" | "rejected";

export type TaskClaim = {
  workerId: string;
  claimedAt: string;
  leaseExpiresAt?: string;
};

export type TaskParent = {
  loopId?: string;
  taskId?: string;
  runId?: string;
  depth: number;
  reason?: string;
};

export type TaskSource = {
  kind: "manual" | "spawn-intent" | "external";
  path?: string;
};

export type TaskWorktree = {
  enabled: boolean;
  baseBranch?: string;
  branch?: string;
  path?: string;
  originalCwd?: string;
};

export type TaskSpec = {
  id: string;
  version: 1;
  title: string;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  prompt: string;
  runner: RunnerSpec;
  source: TaskSource;
  parent?: TaskParent;
  worktree?: TaskWorktree;
  status: {
    state: TaskState;
    claim?: TaskClaim;
    lastRunId?: string;
    approved?: boolean;
  };
};

export type RunMetadata = {
  loopId: string;
  startedAt: string;
  finishedAt: string;
  cwd: string;
  exitCode: number;
  tracePath: string;
  finalPath: string;
};

export type DraftLoop = {
  id: string;
  title: string;
  schedule: Schedule;
  prompt: string;
  cwd: string;
  timezone: string;
  codexHome?: string;
  notify?: NotifyMode;
  sandbox?: SandboxMode;
  yolo?: boolean;
};

export type DraftTask = {
  id: string;
  title: string;
  prompt: string;
  cwd: string;
  codexHome?: string;
  sandbox?: SandboxMode;
  yolo?: boolean;
  source?: TaskSource;
  parent?: TaskParent;
  worktree?: TaskWorktree;
};
