import { homedir } from "node:os";
import { join } from "node:path";

export function gvLoopHome(): string {
  return process.env.GV_LOOP_HOME ?? join(homedir(), ".gv-loops");
}

export function loopsDir(home = gvLoopHome()): string {
  return join(home, "loops");
}

export function loopDir(id: string, home = gvLoopHome()): string {
  return join(loopsDir(home), id);
}

export function loopSpecPath(id: string, home = gvLoopHome()): string {
  return join(loopDir(id, home), "loop.json");
}

export function promptPath(id: string, home = gvLoopHome()): string {
  return join(loopDir(id, home), "prompt.md");
}

export function statePath(id: string, home = gvLoopHome()): string {
  return join(loopDir(id, home), "state.md");
}

export function runsDir(id: string, home = gvLoopHome()): string {
  return join(loopDir(id, home), "runs");
}

export function launchdDir(id: string, home = gvLoopHome()): string {
  return join(loopDir(id, home), "launchd");
}
