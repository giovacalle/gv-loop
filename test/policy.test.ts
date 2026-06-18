import { describe, expect, test } from "bun:test";
import { checkSpawnPolicy, isAllowedCwd, type SpawnPolicy } from "../src/policy";
import type { SpawnIntent } from "../src/spawn-intents";

const intent: SpawnIntent = {
  version: 1,
  kind: "spawn",
  prompt: "do child work",
  cwd: "/workspace/project",
  sandbox: "workspace-write",
  yolo: false,
};

const policy: SpawnPolicy = {
  maxDepth: 2,
  maxChildrenPerRun: 3,
  allowedCwdRoots: ["/workspace"],
  allowedSandboxModes: ["read-only", "workspace-write"],
};

describe("spawn policy", () => {
  test("allows intents within policy limits", () => {
    expect(checkSpawnPolicy(intent, policy, { parentDepth: 1, childrenSpawnedThisRun: 2 })).toEqual({ allowed: true });
  });

  test("rejects intents that exceed depth", () => {
    expect(checkSpawnPolicy(intent, policy, { parentDepth: 2, childrenSpawnedThisRun: 0 })).toEqual({
      allowed: false,
      reasons: ["spawn depth 3 exceeds maxDepth 2"],
    });
  });

  test("rejects intents that exceed children per run", () => {
    expect(checkSpawnPolicy(intent, policy, { parentDepth: 0, childrenSpawnedThisRun: 3 })).toEqual({
      allowed: false,
      reasons: ["children spawned for this run exceeds maxChildrenPerRun 3"],
    });
  });

  test("rejects cwd outside allowed roots without prefix bypass", () => {
    expect(isAllowedCwd("/workspace/project", ["/workspace"])).toBe(true);
    expect(isAllowedCwd("/workspace-other/project", ["/workspace"])).toBe(false);
    expect(checkSpawnPolicy({ ...intent, cwd: "/workspace-other/project" }, policy, { parentDepth: 0, childrenSpawnedThisRun: 0 })).toEqual({
      allowed: false,
      reasons: ["spawn cwd is outside allowedCwdRoots"],
    });
  });

  test("rejects sandbox modes outside the allow-list", () => {
    expect(
      checkSpawnPolicy({ ...intent, sandbox: "danger-full-access" }, policy, {
        parentDepth: 0,
        childrenSpawnedThisRun: 0,
      })
    ).toEqual({
      allowed: false,
      reasons: ["sandbox mode danger-full-access is not allowed"],
    });
  });

  test("rejects yolo unless explicitly allowed", () => {
    expect(checkSpawnPolicy({ ...intent, yolo: true }, policy, { parentDepth: 0, childrenSpawnedThisRun: 0 })).toEqual({
      allowed: false,
      reasons: ["yolo mode is not allowed"],
    });
    expect(
      checkSpawnPolicy({ ...intent, yolo: true }, { ...policy, allowYolo: true }, { parentDepth: 0, childrenSpawnedThisRun: 0 })
    ).toEqual({ allowed: true });
  });
});
