import { describe, expect, test } from "bun:test";
import { extractFinalMessage } from "../src/runner";

describe("runner JSONL parsing", () => {
  test("extracts last completed agent message", () => {
    const jsonl = [
      JSON.stringify({ type: "thread.started", thread_id: "t1" }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "first" } }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "final answer" } }),
    ].join("\n");

    expect(extractFinalMessage(jsonl)).toBe("final answer");
  });

  test("tolerates noisy non-json lines", () => {
    const jsonl = `noise\n${JSON.stringify({ type: "agent_message", text: "ok" })}\n`;
    expect(extractFinalMessage(jsonl)).toBe("ok");
  });
});
