import { describe, expect, it } from "vitest";
import plugin from "../server";
import { host } from "./helpers";

describe("openSession source", () => {
  it("openSession resolves a thread-storage relative path when source is given", async () => {
    const { bb, harness } = host(); await plugin(bb);
    const r: any = await harness.behavior.callRpc("openSession", { threadId: "thr_a", path: "noted-smoke/plan.html", source: "thread-storage" });
    expect(r.session.sourceKind).toBe("thread-storage");
    expect(r.session.hostId).toBe("thread_storage_host");
    expect(r.session.absolutePath).toBe("/thread-storage/thr_a/noted-smoke/plan.html");
    expect(r.displayPath).toBe("noted-smoke/plan.html");
    const w: any = await harness.behavior.callRpc("openSession", { threadId: "thr_b", path: "plan.html", source: "workspace" });
    expect(w.session.sourceKind).toBe("workspace"); expect(w.session.absolutePath).toBe("/repo/plan.html");
  });
});
