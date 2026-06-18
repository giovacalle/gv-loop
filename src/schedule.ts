import type { DraftLoop, NotifyMode, SandboxMode, Schedule } from "./types";
import { expandTilde, slugify } from "./util";

export type AddOptions = {
  id?: string;
  title?: string;
  schedule?: string;
  cwd?: string;
  timezone?: string;
  codexHome?: string;
  notify?: NotifyMode;
  sandbox?: SandboxMode;
  yolo?: boolean;
};

export function parseSchedule(input: string): { schedule: Schedule; prompt: string } {
  const trimmed = input.trim();

  const dailyEnglish = /^(?:every\s+day|daily|every\s+morning|every\s+night)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?(?:\s*(am|pm))?[:,]?\s*(.*)$/i;
  const atEnglish = /^(?:at\s+)?(\d{1,2})(?::(\d{2}))?(?:\s*(am|pm))?\s+(?:every\s+day|daily)[:,]?\s*(.*)$/i;

  for (const match of [trimmed.match(dailyEnglish), trimmed.match(atEnglish)]) {
    if (!match) continue;
    let hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    const meridiem = match[3]?.toLowerCase();
    const prompt = (match[4] ?? "").trim();
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    validateTime(hour, minute);
    return { schedule: { kind: "calendar", hour, minute }, prompt: prompt || trimmed };
  }

  throw new Error(
    "Could not find a supported schedule. Try: 'every day at 8 ...', 'daily at 03:00 ...', or pass --schedule."
  );
}

export function parseExplicitSchedule(value: string): Schedule {
  const trimmed = value.trim();
  if (/^\d+\s*(s|sec|second|seconds)$/i.test(trimmed)) {
    return { kind: "interval", seconds: Number(trimmed.match(/^\d+/)?.[0]) };
  }
  const hm = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const hour = Number(hm[1]);
    const minute = Number(hm[2]);
    validateTime(hour, minute);
    return { kind: "calendar", hour, minute };
  }
  const cronParts = trimmed.split(/\s+/);
  if (cronParts.length === 5) {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = cronParts;
    if (isPlainNumber(minute) && isPlainNumber(hour) && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
      const parsedHour = Number(hour);
      const parsedMinute = Number(minute);
      validateTime(parsedHour, parsedMinute);
      return { kind: "calendar", hour: parsedHour, minute: parsedMinute };
    }
    throw new Error("Cron support is limited to daily schedules like '0 8 * * *' in v1.");
  }
  throw new Error("Unsupported --schedule. Use HH:MM, '3600s', or a 5-field cron expression.");
}

export function draftLoopFromInput(input: string, options: AddOptions): DraftLoop {
  const scheduleAndPrompt = options.schedule
    ? { schedule: parseExplicitSchedule(options.schedule), prompt: input.trim() }
    : parseSchedule(input);

  const prompt = scheduleAndPrompt.prompt.trim();
  const title = options.title ?? prompt.split(/\s+/).slice(0, 6).join(" ");
  const id = options.id ?? slugify(title);

  return {
    id,
    title,
    schedule: scheduleAndPrompt.schedule,
    prompt,
    cwd: expandTilde(options.cwd ?? process.cwd()),
    timezone: options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local",
    ...(options.codexHome ? { codexHome: expandTilde(options.codexHome) } : {}),
    ...(options.notify ? { notify: options.notify } : {}),
    ...(options.sandbox ? { sandbox: options.sandbox } : {}),
    ...(options.yolo !== undefined ? { yolo: options.yolo } : {}),
  };
}

export function scheduleToHuman(schedule: Schedule): string {
  if (schedule.kind === "calendar") {
    return `daily at ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
  }
  if (schedule.kind === "interval") {
    return `every ${schedule.seconds}s`;
  }
  return `cron ${schedule.expression}`;
}

function validateTime(hour: number, minute: number): void {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`Invalid hour ${hour}.`);
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error(`Invalid minute ${minute}.`);
  }
}

function isPlainNumber(value: string | undefined): boolean {
  return value !== undefined && /^\d+$/.test(value);
}
