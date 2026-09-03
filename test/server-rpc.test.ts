import { describe, expect, it } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";
import { host } from "./helpers";

describe("noted rpc", () => {
  it("opens a session for the caller with default roles and returns a transformed document", async () => {
    const { bb, harness } = host(); await plugin(bb);
    const r: any = await harness.behavior.callRpc("openSession", { threadId: "thr_a", path: "plan.html" });
    expect(r.session).toMatchObject({ producerThreadId: "thr_a", viewThreadId: "thr_a", replyThreadId: "thr_a", absolutePath: "/repo/plan.html", sourceKind: "workspace", status: "open" });
    expect(r.displayPath).toBe("plan.html"); expect(r.revisionNumber).toBe(1);
    expect(r.document.srcdoc).toContain('<p id="a">Hi</p>'); expect(r.document.srcdoc).toContain("<script>");
    expect(r.revision.trigger).toBe("open");
    expect(harness.inspection.sdk.callsTo("threads.open")).toHaveLength(1);
  });
  it("renders Markdown before injecting the annotation SDK", async () => {
    const h = host();
    h.setContent("# Review notes\n\n- Keep this\n- Change that\n\n[Guide](docs/guide.md)");
    await plugin(h.bb);

    const result: any = await h.harness.behavior.callRpc("openSession", {
      threadId: "thr_a",
      path: "notes.md",
    });

    expect(result.displayPath).toBe("notes.md");
    expect(result.document.srcdoc).toContain("<h1>Review notes</h1>");
    expect(result.document.srcdoc).toContain("<li>Keep this</li>");
    expect(result.document.srcdoc).toContain('<base href="/api/v1/file-previews/x/">');
    expect(result.document.srcdoc).toContain('<a href="docs/guide.md">Guide</a>');
    expect(result.document.srcdoc).toContain('data-noted-source="markdown"');
    expect(result.document.srcdoc).toContain("<script>");
  });
  it("resolves view=parent and reopens the same open session", async () => {
    const { bb, harness } = host(); await plugin(bb);
    const a: any = await harness.behavior.callRpc("openSession", { threadId: "thr_loops", path: "packet.html", view: "parent" });
    expect(a.session.viewThreadId).toBe("thr_michael"); expect(a.session.replyThreadId).toBe("thr_loops");
    const b: any = await harness.behavior.callRpc("openSession", { threadId: "thr_loops", path: "packet.html", view: "parent" });
    expect(b.session.id).toBe(a.session.id);
    expect(harness.realtimeSignals.some((s) => s.channel === "noted:session-changed")).toBe(true);
    expect(harness.inspection.sdk.callsTo("threads.open")).toHaveLength(0);
  });
  it("send delivers to the reply thread with the chosen mode, records the batch, clears the queue", async () => {
    const sent: any[] = [];
    const { bb, harness } = host(async (args) => { sent.push(args); return { ok: true, delivery: "queued" }; }); await plugin(bb);
    const o: any = await harness.behavior.callRpc("openSession", { threadId: "thr_loops", path: "packet.html", view: "parent" });
    await harness.behavior.callRpc("queuePrompt", { sessionId: o.session.id, uid: "u1", prompt: "shorter", selector: "#a", tag: "p", text: "Hi" });
    const s: any = await harness.behavior.callRpc("send", { sessionId: o.session.id, mode: "queue-if-active", endSession: false });
    expect(sent[0].threadId).toBe("thr_loops"); expect(sent[0].mode).toBe("queue-if-active");
    expect(sent[0].input[0]).toMatchObject({ type: "text", mentions: [] });
    expect(sent[0].input[0].text.startsWith("Noted: feedback on packet.html (revision 1, 1 items)")).toBe(true);
    expect(sent[0].input[0].text).toContain("Reviewed in thread thr_michael by Michael.");
    expect(s.batch.delivery).toBe("queued");
    const g: any = await harness.behavior.callRpc("getSession", { sessionId: o.session.id }); expect(g.queued).toEqual([]);
  });
  it("keeps the queue and records a failed batch when send throws", async () => {
    const { bb, harness } = host(async () => { throw new Error("thread archived"); }); await plugin(bb);
    const o: any = await harness.behavior.callRpc("openSession", { threadId: "thr_a", path: "plan.html" });
    await harness.behavior.callRpc("queuePrompt", { sessionId: o.session.id, uid: "u1", prompt: "x", selector: "#a", tag: "p", text: "Hi" });
    const s: any = await harness.behavior.callRpc("send", { sessionId: o.session.id, endSession: false });
    expect(s.batch.delivery).toBe("failed"); expect(s.batch.error).toMatch(/archived/);
    const g: any = await harness.behavior.callRpc("getSession", { sessionId: o.session.id }); expect(g.queued).toHaveLength(1);
  });
  it("records a revision on thread.idle of the producer when the file changed", async () => {
    const h = host(); const { bb, harness } = h; await plugin(bb);
    const o: any = await harness.behavior.callRpc("openSession", { threadId: "thr_a", path: "plan.html" });
    h.setContent(`<html><body><p id="a">Hi again</p></body></html>`);
    await harness.behavior.emitThreadEvent("thread.idle", { thread: makeThreadResponse({ id: "thr_a" }), lastAssistantText: "done" });
    const g: any = await harness.behavior.callRpc("getSession", { sessionId: o.session.id });
    expect(g.revision.trigger).toBe("idle"); expect(g.revisionNumber).toBe(2);
    expect(harness.realtimeSignals.filter((s) => (s.payload as any)?.reason === "revision")).toHaveLength(1);
  });
  it("ends sessions when the reply thread is deleted", async () => {
    const { bb, harness } = host(); await plugin(bb);
    await harness.behavior.callRpc("openSession", { threadId: "thr_a", path: "plan.html" });
    await harness.behavior.emitThreadEvent("thread.deleted", { thread: makeThreadResponse({ id: "thr_a" }) });
    const l: any = await harness.behavior.callRpc("listSessions", { threadId: "thr_a" });
    expect(l.sessions[0].status).toBe("ended"); expect(l.sessions[0].endedBy).toBe("agent");
  });
});
