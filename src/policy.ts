import { isAbsolute, relative, resolve } from "node:path";
import type { SpawnIntent } from "./spawn-intents";
import type { SandboxMode } from "./types";

export type SpawnPolicy = {
  maxDepth: number;
  maxChildrenPerRun: number;
  allowedCwdRoots: string[];
  allowedSandboxModes: SandboxMode[];
  allowYolo?: boolean;
};

export type SpawnPolicyContext = {
  parentDepth: number;
  childrenSpawnedThisRun: number;
};

export type SpawnPolicyDecision =
  | { allowed: true }
  | { allowed: false; reasons: string[] };

export function checkSpawnPolicy(
  intent: SpawnIntent,
  policy: SpawnPolicy,
  context: SpawnPolicyContext
): SpawnPolicyDecision {
  const reasons: string[] = [];
  const nextDepth = context.parentDepth + 1;

  if (!Number.isInteger(policy.maxDepth) || policy.maxDepth < 0) {
    reasons.push("policy maxDepth must be a non-negative integer");
  } else if (nextDepth > policy.maxDepth) {
    reasons.push(`spawn depth ${nextDepth} exceeds maxDepth ${policy.maxDepth}`);
  }

  if (!Number.isInteger(policy.maxChildrenPerRun) || policy.maxChildrenPerRun < 0) {
    reasons.push("policy maxChildrenPerRun must be a non-negative integer");
  } else if (context.childrenSpawnedThisRun >= policy.maxChildrenPerRun) {
    reasons.push(`children spawned for this run exceeds maxChildrenPerRun ${policy.maxChildrenPerRun}`);
  }

  if (!isAllowedCwd(intent.cwd, policy.allowedCwdRoots)) {
    reasons.push("spawn cwd is outside allowedCwdRoots");
  }

  if (!policy.allowedSandboxModes.includes(intent.sandbox)) {
    reasons.push(`sandbox mode ${intent.sandbox} is not allowed`);
  }

  if (intent.yolo && policy.allowYolo !== true) {
    reasons.push("yolo mode is not allowed");
  }

  return reasons.length ? { allowed: false, reasons } : { allowed: true };
}

export function assertSpawnPolicy(
  intent: SpawnIntent,
  policy: SpawnPolicy,
  context: SpawnPolicyContext
): void {
  const decision = checkSpawnPolicy(intent, policy, context);
  if (!decision.allowed) {
    throw new Error(`Spawn intent rejected: ${decision.reasons.join("; ")}.`);
  }
}

export function isAllowedCwd(cwd: string, allowedRoots: string[]): boolean {
  const resolvedCwd = resolve(cwd);
  return allowedRoots.some((root) => {
    const resolvedRoot = resolve(root);
    const pathFromRoot = relative(resolvedRoot, resolvedCwd);
    return pathFromRoot === "" || (!!pathFromRoot && !pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
  });
}
