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
