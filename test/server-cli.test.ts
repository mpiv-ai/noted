import { describe, expect, it } from "vitest";
import plugin from "../server";
import { host } from "./helpers";

describe("bb noted cli", () => {
  it("open creates the session for the calling thread and prints next_step", async () => {
    const { bb, harness } = host(); await plugin(bb);
    const r = await harness.behavior.runCli(["open", "plan.html", "--view", "parent", "--json"], { threadId: "thr_loops", cwd: "/repo" });
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(r.stdout ?? "");
    expect(out.view_thread).toBe("thr_michael"); expect(out.reply_thread).toBe("thr_loops"); expect(out.path).toBe("plan.html"); expect(out.revision).toBe(1);
    expect(out.next_step).toMatch(/end your turn/i);
  });
  it("opens an absolute thread-storage path on the thread's storage host", async () => {
    const { bb, harness } = host(); await plugin(bb);
    const path = "/thread-storage/thr_a/noted-live-test/index.html";

    const result = await harness.behavior.runCli(["open", path, "--json"], { threadId: "thr_a" });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout ?? "").path).toBe("noted-live-test/index.html");
    expect(harness.inspection.sdk.callsTo("files.read")[0]?.[0]).toMatchObject({
      hostId: "thread_storage_host",
      path,
    });
  });
  it("reply appends to the caller's open session and status lists it", async () => {
    const { bb, harness } = host(); await plugin(bb);
    await harness.behavior.runCli(["open", "plan.html"], { threadId: "thr_a" });
    expect((await harness.behavior.runCli(["reply", "on", "it"], { threadId: "thr_a" })).exitCode).toBe(0);
    const s = await harness.behavior.runCli(["status", "--json"], { threadId: "thr_a" });
    expect(s.exitCode).toBe(0);
    expect(JSON.parse(s.stdout ?? "")[0]).toMatchObject({ path: "plan.html", queued: 0, replies: 1, revision: 1, last_batch: null });
  });
  it("refuses open without a thread context", async () => {
    const { bb, harness } = host(); await plugin(bb);
    const r = await harness.behavior.runCli(["open", "plan.html"]);
    expect(r.exitCode).toBe(1); expect(r.stderr).toMatch(/inside a bb thread/);
  });
  it("file writes the export and the companion note into the vault folder", async () => {
    const writes: any[] = [];
    const h = host(); await plugin(h.bb);
    h.harness.inspection.sdk.stub("files.write", async (a: any) => { writes.push(a); return { outcome: "written", sha256: "x", sizeBytes: 1 }; });
    await h.harness.behavior.runCli(["open", "plan.html"], { threadId: "thr_a" });
    const r = await h.harness.behavior.runCli(["file", "plan.html", "--to", "/vault/Projects/Active/MPIV", "--title", "Plan A", "--summary", "Why A.", "--json"], { threadId: "thr_a" });
    expect(r.exitCode).toBe(0);
    expect(writes.map((w) => w.path)).toEqual([expect.stringMatching(/\/vault\/Projects\/Active\/MPIV\/\d{14}_Plan_A\.html$/), expect.stringMatching(/\/vault\/Projects\/Active\/MPIV\/\d{14}_Plan_A\.md$/)]);
    expect(writes[0].expectedSha256).toBeNull(); expect(writes[0].rootPath).toBe("/vault/Projects/Active/MPIV");
    expect(writes[0].content).not.toContain("<script>");
    expect(writes[1].content).toContain('title: "Plan A"'); expect(writes[1].content).toContain("bb thread: thr_a");
    const out = JSON.parse(r.stdout ?? ""); expect(out.html).toMatch(/_Plan_A\.html$/); expect(out.note).toMatch(/_Plan_A\.md$/);
  });
});
