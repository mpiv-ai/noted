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
  it("a dismissed banner stays dismissed until the agent opens the review again", async () => {
    const { bb, harness } = host(); await plugin(bb);
    await harness.behavior.runCli(["open", "packet.html", "--view", "parent"], { threadId: "thr_loops", cwd: "/repo" });
    const [opened]: any[] = ((await harness.behavior.callRpc("listSessions", { threadId: "thr_michael" })) as any).sessions;
    expect(opened.bannerDismissedAt).toBeNull();

    await harness.behavior.callRpc("dismissBanner", { sessionId: opened.id });
    const [dismissed]: any[] = ((await harness.behavior.callRpc("listSessions", { threadId: "thr_michael" })) as any).sessions;
    expect(dismissed.bannerDismissedAt).toEqual(expect.any(Number));
    expect(harness.realtimeSignals.some((s) => (s.payload as any)?.reason === "banner")).toBe(true);

    await harness.behavior.callRpc("openSession", { threadId: "thr_loops", path: "packet.html", reopen: true });
    const [userOpened]: any[] = ((await harness.behavior.callRpc("listSessions", { threadId: "thr_michael" })) as any).sessions;
    expect(userOpened.bannerDismissedAt).toEqual(expect.any(Number));

    await harness.behavior.runCli(["open", "packet.html"], { threadId: "thr_loops", cwd: "/repo" });
    const [resurfaced]: any[] = ((await harness.behavior.callRpc("listSessions", { threadId: "thr_michael" })) as any).sessions;
    expect(resurfaced.id).toBe(opened.id);
    expect(resurfaced.bannerDismissedAt).toBeNull();
  });
});
