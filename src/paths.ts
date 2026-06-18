import { homedir } from "node:os";
import { join } from "node:path";

export function gvLoopHome(): string {
  return process.env.GV_LOOP_HOME ?? join(homedir(), ".gv-loops");
}

export function loopsDir(home = gvLoopHome()): string {
  return join(home, "loops");
}

export function tasksDir(home = gvLoopHome()): string {
  return join(home, "tasks");
}

export function loopDir(id: string, home = gvLoopHome()): string {
  return join(loopsDir(home), id);
}

export function taskDir(id: string, home = gvLoopHome()): string {
  return join(tasksDir(home), id);
}

export function loopSpecPath(id: string, home = gvLoopHome()): string {
  return join(loopDir(id, home), "loop.json");
}

export function taskSpecPath(id: string, home = gvLoopHome()): string {
  return join(taskDir(id, home), "task.json");
}

export function promptPath(id: string, home = gvLoopHome()): string {
  return join(loopDir(id, home), "prompt.md");
}

export function taskPromptPath(id: string, home = gvLoopHome()): string {
  return join(taskDir(id, home), "prompt.md");
}

export function statePath(id: string, home = gvLoopHome()): string {
  return join(loopDir(id, home), "state.md");
}

export function runsDir(id: string, home = gvLoopHome()): string {
  return join(loopDir(id, home), "runs");
}

export function taskRunsDir(id: string, home = gvLoopHome()): string {
  return join(taskDir(id, home), "runs");
}

export function taskClaimLockPath(id: string, home = gvLoopHome()): string {
  return join(taskDir(id, home), "claim.lock");
}

export function launchdDir(id: string, home = gvLoopHome()): string {
  return join(loopDir(id, home), "launchd");
}
