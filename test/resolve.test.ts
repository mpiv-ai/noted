import { describe, expect, it } from "vitest";
import { relativePathWithinRoot, resolveArtifact, resolveRole } from "../lib/resolve";

const sdk = () => ({
  threads: {
    get: async ({ threadId }: { threadId: string }) => ({ id: threadId, parentThreadId: threadId === "thr_child" ? "thr_parent" : null, environmentId: "env_1" }),
    storageLocation: async ({ threadId }: { threadId: string }) => ({ hostId: "storage_host", storageRootPath: `/storage/${threadId}` }),
  },
  environments: { get: async () => ({ id: "env_1", hostId: "host_1", path: "/home/m/repo" }) },
});

describe("resolveRole", () => {
  it("defaults to self, resolves parent, accepts an explicit id", async () => {
    const s = sdk();
    expect(await resolveRole(s, "thr_child", undefined)).toBe("thr_child");
    expect(await resolveRole(s, "thr_child", "self")).toBe("thr_child");
    expect(await resolveRole(s, "thr_child", "parent")).toBe("thr_parent");
    expect(await resolveRole(s, "thr_child", "thr_other")).toBe("thr_other");
    await expect(resolveRole(s, "thr_parent", "parent")).rejects.toThrow(/has no parent/);
  });
});

describe("resolveArtifact", () => {
  it("derives only paths confined to their storage root", () => {
    expect(relativePathWithinRoot("/storage/thr", "/storage/thr/reports/review.html")).toBe("reports/review.html");
    expect(() => relativePathWithinRoot("/storage/thr", "/storage/other/review.html"))
      .toThrow(/outside thread storage/);
  });
  it("joins a relative file with the environment path", async () => {
    const r = await resolveArtifact(sdk(), "thr_child", "plans/plan.html", undefined, "/home/m/.bb");
    expect(r).toEqual({ hostId: "host_1", absolutePath: "/home/m/repo/plans/plan.html", sourceKind: "workspace", displayPath: "plans/plan.html" });
  });
  it("classifies thread storage and host paths", async () => {
    const ts = await resolveArtifact(sdk(), "thr_child", "/home/m/.bb/thread-storage/thr_child/board.html", undefined, "/home/m/.bb");
    expect(ts.sourceKind).toBe("thread-storage"); expect(ts.displayPath).toBe("board.html"); expect(ts.hostId).toBeUndefined();
    const h = await resolveArtifact(sdk(), "thr_child", "/tmp/x.html", undefined, "/home/m/.bb");
    expect(h.sourceKind).toBe("host"); expect(h.displayPath).toBe("/tmp/x.html"); expect(h.hostId).toBe("host_1");
    await expect(resolveArtifact({ ...sdk(), environments: { get: async () => ({ id: "env_1", hostId: "host_1", path: null }) } }, "thr_child", "rel.html", undefined, "/home/m/.bb")).rejects.toThrow(/without a workspace or cwd/);
  });
  it("uses the thread's storage host and confines relative paths to its root", async () => {
    const artifact = await resolveArtifact(sdk(), "thr_child", "reports/review.html", undefined, "/home/m/.bb", "thread-storage");
    expect(artifact).toEqual({
      hostId: "storage_host",
      absolutePath: "/storage/thr_child/reports/review.html",
      sourceKind: "thread-storage",
      displayPath: "reports/review.html",
    });
    await expect(resolveArtifact(sdk(), "thr_child", "../escape.html", undefined, "/home/m/.bb", "thread-storage"))
      .rejects.toThrow(/outside thread storage/);
  });
});
