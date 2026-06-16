import { describe, expect, test } from "bun:test";
import { draftLoopFromInput, parseExplicitSchedule, parseSchedule, scheduleToHuman } from "../src/schedule";

describe("schedule parsing", () => {
  test("extracts daily schedule and preserves the remaining text as prompt", () => {
    const parsed = parseSchedule("every night at 3 check AppX logs");
    expect(parsed.schedule).toEqual({ kind: "calendar", hour: 3, minute: 0 });
    expect(parsed.prompt).toBe("check AppX logs");
  });

  test("extracts English daily schedule with meridiem", () => {
    const parsed = parseSchedule("every day at 8pm check the portfolio repo");
    expect(parsed.schedule).toEqual({ kind: "calendar", hour: 20, minute: 0 });
    expect(parsed.prompt).toBe("check the portfolio repo");
  });

  test("parses explicit HH:MM schedule", () => {
    expect(parseExplicitSchedule("03:15")).toEqual({ kind: "calendar", hour: 3, minute: 15 });
  });

  test("parses explicit interval schedule", () => {
    expect(parseExplicitSchedule("3600s")).toEqual({ kind: "interval", seconds: 3600 });
  });

  test("converts simple daily cron to calendar schedule", () => {
    expect(parseExplicitSchedule("0 8 * * *")).toEqual({ kind: "calendar", hour: 8, minute: 0 });
  });

  test("rejects unsupported cron schedules in v1", () => {
    expect(() => parseExplicitSchedule("*/5 * * * *")).toThrow("Cron support is limited");
  });

  test("draft uses current cwd by default and slugifies id", () => {
    const draft = draftLoopFromInput("every day at 8 check repo and mail", {});
    expect(draft.id).toBe("check-repo-and-mail");
    expect(draft.prompt).toBe("check repo and mail");
    expect(draft.cwd).toBe(process.cwd());
  });

  test("draft expands custom codex home", () => {
    const draft = draftLoopFromInput("every day at 8 check repo", { codexHome: "~/.codex-work" });
    expect(draft.codexHome).toContain(".codex-work");
    expect(draft.codexHome?.startsWith("~")).toBe(false);
  });

  test("human schedule label is stable", () => {
    expect(scheduleToHuman({ kind: "calendar", hour: 3, minute: 5 })).toBe("daily at 03:05");
  });
});
