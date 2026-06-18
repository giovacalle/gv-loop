import { describe, expect, test } from "bun:test";
import { parseSpawnIntent, parseSpawnIntentJson } from "../src/spawn-intents";

describe("spawn intent parsing", () => {
  test("parses a valid JSON spawn intent", () => {
    expect(
      parseSpawnIntentJson(
        JSON.stringify({
          version: 1,
          kind: "spawn",
          prompt: "check the child task",
          cwd: "/tmp/project",
          sandbox: "read-only",
          yolo: false,
        })
      )
    ).toEqual({
      version: 1,
      kind: "spawn",
      prompt: "check the child task",
      cwd: "/tmp/project",
      sandbox: "read-only",
      yolo: false,
    });
  });

  test("defaults sandbox to workspace-write and yolo to false", () => {
    expect(parseSpawnIntent({ kind: "spawn", prompt: "do work", cwd: "/tmp/project" })).toEqual({
      version: 1,
      kind: "spawn",
      prompt: "do work",
      cwd: "/tmp/project",
      sandbox: "workspace-write",
      yolo: false,
    });
  });

  test("rejects invalid intent shape", () => {
    expect(() => parseSpawnIntent({ kind: "spawn", prompt: "", cwd: "/tmp/project" })).toThrow(
      "prompt must be a non-empty string"
    );
    expect(() => parseSpawnIntent({ kind: "spawn", prompt: "do work", cwd: "/tmp/project", yolo: "yes" })).toThrow(
      "yolo must be a boolean"
    );
    expect(() =>
      parseSpawnIntent({ kind: "spawn", prompt: "do work", cwd: "/tmp/project", sandbox: "none" })
    ).toThrow("sandbox is invalid");
  });
});
