import { describe, expect, it } from "vitest";
import plugin from "../server";
import { host } from "./helpers";

describe("openSession role updates", () => {
  it("reopening with a different view moves the viewer without ending the session", async () => {
    const { bb, harness } = host(); await plugin(bb);
    const a: any = await harness.behavior.callRpc("openSession", { threadId: "thr_loops", path: "packet.html" });
    expect(a.session.viewThreadId).toBe("thr_loops");
    const b: any = await harness.behavior.callRpc("openSession", { threadId: "thr_loops", path: "packet.html", view: "parent" });
    expect(b.session.id).toBe(a.session.id);
    expect(b.session.viewThreadId).toBe("thr_michael");
    expect(b.session.replyThreadId).toBe("thr_loops");
    expect(b.session.status).toBe("open");
    expect(harness.realtimeSignals.some((s) => (s.payload as any)?.reason === "roles" && (s.payload as any)?.sessionId === a.session.id)).toBe(true);
    const l: any = await harness.behavior.callRpc("listSessions", { threadId: "thr_michael" });
    expect(l.sessions.map((x: any) => x.id)).toEqual([a.session.id]);
  });
  it("reopening without view or replyTo leaves the roles untouched", async () => {
    const { bb, harness } = host(); await plugin(bb);
    const a: any = await harness.behavior.callRpc("openSession", { threadId: "thr_loops", path: "packet.html", view: "parent" });
    const before = harness.realtimeSignals.length;
    const b: any = await harness.behavior.callRpc("openSession", { threadId: "thr_loops", path: "packet.html" });
    expect(b.session.id).toBe(a.session.id);
    expect(b.session.viewThreadId).toBe("thr_michael");
    expect(harness.realtimeSignals.slice(before).some((s) => (s.payload as any)?.reason === "roles")).toBe(false);
  });
});
