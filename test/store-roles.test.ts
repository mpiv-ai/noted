import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openStore } from "../lib/store";

function migrate(db: Database.Database, statements: string[]) { for (const s of statements) db.exec(s); }

describe("store.updateRoles", () => {
  it("updateRoles changes the viewer and recipient of an open session", () => {
    const s = openStore(new Database(":memory:"), migrate);
    const a = s.createSession({ producerThreadId: "thr_p", viewThreadId: "thr_p", replyThreadId: "thr_p", projectId: null, hostId: null, absolutePath: "/w/plan.html", sourceKind: "workspace" });
    s.updateRoles(a.id, { viewThreadId: "thr_v", replyThreadId: "thr_r" });
    const after = s.getSession(a.id)!;
    expect(after.viewThreadId).toBe("thr_v"); expect(after.replyThreadId).toBe("thr_r");
    expect(after.updatedAt).toBeGreaterThanOrEqual(a.updatedAt);
    expect(s.listSessionsForThread("thr_v").map((x) => x.id)).toEqual([a.id]);
    expect(s.findOpenSession("thr_p", "/w/plan.html")?.id).toBe(a.id);
  });
});
