import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openStore } from "../lib/store";

function migrate(db: Database.Database, statements: string[]) { for (const s of statements) db.exec(s); }
const fresh = () => openStore(new Database(":memory:"), migrate);
const sessionInput = { producerThreadId: "thr_p", viewThreadId: "thr_v", replyThreadId: "thr_p", projectId: "proj_1", hostId: null, absolutePath: "/w/plan.html", sourceKind: "workspace" as const };

describe("store", () => {
  it("creates one open session per producer+path and finds it", () => {
    const s = fresh();
    const a = s.createSession(sessionInput);
    expect(s.findOpenSession("thr_p", "/w/plan.html")?.id).toBe(a.id);
    expect(() => s.createSession(sessionInput)).toThrow(/already open/);
    s.endSession(a.id, "user");
    expect(s.findOpenSession("thr_p", "/w/plan.html")).toBeNull();
    expect(s.getSession(a.id)?.endedBy).toBe("user");
  });
  it("lists sessions for any thread role", () => {
    const s = fresh(); const a = s.createSession(sessionInput);
    expect(s.listSessionsForThread("thr_v").map((x) => x.id)).toEqual([a.id]);
    expect(s.listSessionsForThread("thr_p").map((x) => x.id)).toEqual([a.id]);
    expect(s.listSessionsForThread("thr_none")).toEqual([]);
  });
  it("records revisions and returns the latest", () => {
    const s = fresh(); const a = s.createSession(sessionInput);
    s.addRevision(a.id, "aaa", 10, "open"); const r2 = s.addRevision(a.id, "bbb", 12, "idle");
    expect(s.latestRevision(a.id)?.id).toBe(r2.id);
    expect(s.listRevisions(a.id)).toHaveLength(2);
  });
  it("queues, updates, removes, and clears prompts", () => {
    const s = fresh(); const a = s.createSession(sessionInput); const r = s.addRevision(a.id, "aaa", 1, "open");
    const q = s.queuePrompt({ sessionId: a.id, revisionId: r.id, uid: "u1", prompt: "shorter", selector: "#p", tag: "p", text: "Hello", target: null });
    s.updatePrompt(q.id, "much shorter");
    expect(s.listQueued(a.id)[0]?.prompt).toBe("much shorter");
    s.queuePrompt({ sessionId: a.id, revisionId: r.id, uid: "u2", prompt: "x", selector: "#q", tag: "td", text: "1", target: { row: "A", column: "Cost" } });
    s.removePrompt(q.id);
    expect(s.listQueued(a.id).map((p) => p.uid)).toEqual(["u2"]);
    expect(s.listQueued(a.id)[0]?.target).toEqual({ row: "A", column: "Cost" });
    s.clearQueue(a.id); expect(s.listQueued(a.id)).toEqual([]);
  });
  it("records batches with delivery and replies in order", () => {
    const s = fresh(); const a = s.createSession(sessionInput); const r = s.addRevision(a.id, "aaa", 1, "open");
    const b = s.recordBatch({ sessionId: a.id, revisionId: r.id, items: [], messageText: "Noted: …", mode: "steer-if-active", delivery: "sent", error: null });
    expect(s.listBatches(a.id)[0]?.id).toBe(b.id);
    s.addReply(a.id, "on it"); s.addReply(a.id, "done");
    expect(s.listReplies(a.id).map((x) => x.text)).toEqual(["on it", "done"]);
  });
});
