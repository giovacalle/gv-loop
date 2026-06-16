import { describe, expect, test } from "bun:test";
import { renderLaunchdPlist } from "../src/launchd";
import type { LoopSpec } from "../src/types";

const baseSpec: LoopSpec = {
  id: "appx-check",
  version: 1,
  title: "AppX check",
  createdAt: "2026-06-16T00:00:00.000Z",
  cwd: "/Users/me/project",
  timezone: "Europe/Rome",
  schedule: { kind: "calendar", hour: 3, minute: 0 },
  prompt: "check AppX",
  runner: { kind: "codex-exec", json: true, ephemeral: true, sandbox: "read-only" },
  output: { reportFormat: "markdown", trace: true, notify: "failures" },
  status: { enabled: true },
};

describe("launchd plist rendering", () => {
  test("calls gv-loop run id instead of embedding prompt or shell", () => {
    const plist = renderLaunchdPlist(baseSpec, "/usr/local/bin/gv-loop");
    expect(plist).toContain("<string>/usr/local/bin/gv-loop</string>");
    expect(plist).toContain("<string>run</string>");
    expect(plist).toContain("<string>appx-check</string>");
    expect(plist).toContain("<string>--scheduled</string>");
    expect(plist).not.toContain("check AppX");
    expect(plist).not.toContain("/bin/zsh");
  });

  test("renders daily calendar schedule", () => {
    const plist = renderLaunchdPlist(baseSpec, "/usr/local/bin/gv-loop");
    expect(plist).toContain("<key>StartCalendarInterval</key>");
    expect(plist).toContain("<key>Hour</key>");
    expect(plist).toContain("<integer>3</integer>");
  });

  test("escapes XML-sensitive cwd", () => {
    const plist = renderLaunchdPlist({ ...baseSpec, cwd: "/tmp/a&b" }, "/tmp/gv-loop");
    expect(plist).toContain("/tmp/a&amp;b");
  });
});
