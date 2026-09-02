import { describe, expect, it } from "vitest";
import plugin from "../server";
import { host } from "./helpers";

describe("missing artifact", () => {
  it("getSession ends the session and reports a missing file", async () => {
    const { bb, harness } = host(); await plugin(bb);
    const o: any = await harness.behavior.callRpc("openSession", { threadId: "thr_a", path: "plan.html" });
    harness.inspection.sdk.stub("files.read", async () => { throw new Error("HTTP 404: Path does not exist: /repo/plan.html"); });
    await expect(harness.behavior.callRpc("getSession", { sessionId: o.session.id })).rejects.toThrow(/session ended/);
    const l: any = await harness.behavior.callRpc("listSessions", { threadId: "thr_a" });
    expect(l.sessions[0]).toMatchObject({ id: o.session.id, status: "ended", endedBy: "agent" });
    expect(harness.realtimeSignals.some((s) => (s.payload as any)?.reason === "ended" && (s.payload as any)?.sessionId === o.session.id)).toBe(true);
  });
});
