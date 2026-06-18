import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loopFromDraft, readLoop, readPrompt, saveLoop } from "../src/store";
import { loopDir, loopSpecPath, promptPath, statePath } from "../src/paths";

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
  tempHome = undefined;
});

describe("loop store", () => {
  test("saves loop spec, prompt, state, and launchd directory", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-test-"));
    const spec = loopFromDraft({
      id: "nightly-check",
      title: "Nightly check",
      cwd: "/tmp",
      timezone: "Europe/Rome",
      prompt: "check things",
      schedule: { kind: "calendar", hour: 3, minute: 0 },
    });

    await saveLoop(spec, tempHome);

    expect(await Bun.file(loopSpecPath("nightly-check", tempHome)).exists()).toBe(true);
    expect(await Bun.file(promptPath("nightly-check", tempHome)).exists()).toBe(true);
    expect(await Bun.file(statePath("nightly-check", tempHome)).exists()).toBe(true);
    expect(await readLoop("nightly-check", tempHome)).toMatchObject({ id: "nightly-check", cwd: "/tmp" });
    expect((await readPrompt("nightly-check", tempHome)).trim()).toBe("check things");
    expect(loopDir("nightly-check", tempHome)).toContain("nightly-check");
  });

  test("persists custom codex home on runner spec", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-test-"));
    const spec = loopFromDraft({
      id: "custom-codex",
      title: "Custom Codex",
      cwd: "/tmp",
      timezone: "Europe/Rome",
      prompt: "check things",
      schedule: { kind: "calendar", hour: 3, minute: 0 },
      codexHome: "/tmp/codex-home",
    });

    await saveLoop(spec, tempHome);

    expect((await readLoop("custom-codex", tempHome)).runner.codexHome).toBe("/tmp/codex-home");
  });

  test("defaults to yolo runner mode", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-test-"));
    const spec = loopFromDraft({
      id: "yolo-loop",
      title: "Yolo Loop",
      cwd: "/tmp",
      timezone: "Europe/Rome",
      prompt: "change things",
      schedule: { kind: "calendar", hour: 3, minute: 0 },
    });

    await saveLoop(spec, tempHome);

    expect((await readLoop("yolo-loop", tempHome)).runner).toMatchObject({
      sandbox: "danger-full-access",
      yolo: true,
    });
  });

  test("persists safe sandbox override", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-test-"));
    const spec = loopFromDraft({
      id: "safe-loop",
      title: "Safe Loop",
      cwd: "/tmp",
      timezone: "Europe/Rome",
      prompt: "inspect things",
      schedule: { kind: "calendar", hour: 3, minute: 0 },
      sandbox: "read-only",
      yolo: false,
    });

    await saveLoop(spec, tempHome);

    expect((await readLoop("safe-loop", tempHome)).runner).toMatchObject({
      sandbox: "read-only",
      yolo: false,
    });
  });

  test("persists notify mode", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-test-"));
    const spec = loopFromDraft({
      id: "notify-loop",
      title: "Notify Loop",
      cwd: "/tmp",
      timezone: "Europe/Rome",
      prompt: "check things",
      schedule: { kind: "calendar", hour: 3, minute: 0 },
      notify: "always",
    });

    await saveLoop(spec, tempHome);

    expect((await readLoop("notify-loop", tempHome)).output.notify).toBe("always");
  });
});
