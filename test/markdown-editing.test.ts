import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");

async function editor(enabled: boolean | undefined = true, path = "plan.md", base64 = false) {
  let content = "# Original\n";
  let previewFails = false;
  const writes: unknown[] = [];
  const { bb, harness } = createFakePluginHost({
    pluginId: "noted",
    settings: enabled === undefined ? {} : { markdownEditing: enabled, newWindow: enabled },
    sdk: {
      threads: {
        open: async () => ({ delivered: 1 }),
        get: async () => ({ id: "thr_a", parentThreadId: null, environmentId: "env_a", projectId: "proj_a" }),
      },
      environments: { get: async () => ({ id: "env_a", hostId: "host_a", path: "/repo" }) },
      files: {
        read: async () => ({ content: base64 ? Buffer.from(content).toString("base64") : content, contentEncoding: base64 ? "base64" : "utf8", sha256: digest(content), sizeBytes: Buffer.byteLength(content) }),
        write: async (args: { content: string; expectedSha256?: string | null }) => {
          if (args.expectedSha256 !== digest(content)) return { outcome: "conflict", currentSha256: digest(content) };
          writes.push(args);
          content = args.content;
          return { outcome: "written", sha256: digest(content), sizeBytes: Buffer.byteLength(content) };
        },
        createPreview: async () => {
          if (previewFails) throw new Error("Preview unavailable");
          return { baseUrl: "/api/v1/file-previews/a", expiresAtMs: 0 };
        },
      },
    },
  });
  await plugin(bb);
  const session: any = await harness.behavior.callRpc("openSession", { threadId: "thr_a", path });
  const save = (text: string, sha = session.revision.sha256) => harness.behavior.callRpc("saveMarkdown", { sessionId: session.session.id, content: text, expectedSha256: sha });
  return { bb, harness, session, save, writes, content: () => content, change: (text: string) => { content = text; }, failPreview: () => { previewFails = true; } };
}

describe("Markdown editing", () => {
  it("saves exact UTF-8 to the original host and path and refreshes revisions", async () => {
    const e = await editor();
    const content = "# Revised\n\nCafé ☕\n";
    expect(e.session.markdown).toBe("# Original\n");
    expect(e.session.capabilities).toEqual({ newWindow: true, markdownEditing: true });
    await expect(e.save(content)).resolves.toEqual({ sha256: digest(content) });
    expect(e.writes).toEqual([{ hostId: "host_a", path: "/repo/plan.md", content, contentEncoding: "utf8", expectedSha256: digest("# Original\n") }]);
    const next: any = await e.harness.behavior.callRpc("getSession", { sessionId: e.session.session.id });
    expect(next.markdown).toBe(content);
    expect(next.revisionNumber).toBe(2);
    expect(e.harness.realtimeSignals.some((signal) => signal.channel === "noted:session-changed" && (signal.payload as any).reason === "revision")).toBe(true);
    expect(JSON.stringify(e.harness.logEntries)).toContain('noted.markdown.save');
    expect(JSON.stringify(e.harness.logEntries)).not.toContain("Café");
  });

  it("edits uppercase Markdown extensions read from base64 without changing source format", async () => {
    const e = await editor(true, "plan.MARKDOWN", true);
    expect(e.session.markdown).toBe("# Original\n");
    await e.save("# Updated\n");
    expect(e.content()).toBe("# Updated\n");
  });

  it("rejects stale saves without overwriting a concurrent update", async () => {
    const e = await editor();
    e.change("# Agent edit\n");
    await expect(e.save("# User edit\n")).rejects.toThrow(/changed/);
    expect(e.content()).toBe("# Agent edit\n");
    expect(e.writes).toEqual([]);
    const next: any = await e.harness.behavior.callRpc("getSession", { sessionId: e.session.session.id });
    expect(next.revisionNumber).toBe(2);
    expect(next.revision.sha256).toBe(digest("# Agent edit\n"));
  });

  it("accepts only one of two writers using the same revision", async () => {
    const e = await editor();
    const results = await Promise.allSettled([e.save("# One\n"), e.save("# Two\n")]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(e.writes).toHaveLength(1);
  });

  it("rejects HTML, ended sessions, and disabled editing", async () => {
    const html = await editor(true, "plan.html");
    expect(html.session.markdown).toBeNull();
    await expect(html.save("changed")).rejects.toThrow(/Only Markdown/);
    expect(html.writes).toEqual([]);
    const ended = await editor();
    await ended.harness.behavior.callRpc("endSession", { sessionId: ended.session.session.id, by: "user" });
    await expect(ended.save("changed")).rejects.toThrow(/ended/);
    expect(ended.writes).toEqual([]);
    const disabled = await editor(false);
    await expect(disabled.save("changed")).rejects.toThrow(/disabled/);
    expect(disabled.writes).toEqual([]);
  });

  it("disables subsequent saves without reloading the plugin", async () => {
    const e = await editor();
    await e.harness.behavior.setSettings({ markdownEditing: false, newWindow: false });
    await expect(e.save("changed")).rejects.toThrow(/disabled/);
    const next: any = await e.harness.behavior.callRpc("getSession", { sessionId: e.session.session.id });
    expect(next.capabilities).toEqual({ markdownEditing: false, newWindow: false });
    expect(e.harness.realtimeSignals.some((s) => s.channel === "noted:capabilities-changed")).toBe(true);
  });

  it("reports a committed save if realtime publication fails", async () => {
    const e = await editor();
    e.bb.realtime.publish = () => { throw new Error("Plugin disposed"); };
    await expect(e.save("# Saved\n")).resolves.toEqual({ sha256: digest("# Saved\n") });
    expect(e.content()).toBe("# Saved\n");
  });

  it("reports a successful save even when preview generation is unavailable", async () => {
    const e = await editor();
    e.failPreview();
    await expect(e.save("# Saved\n")).resolves.toEqual({ sha256: digest("# Saved\n") });
    expect(e.content()).toBe("# Saved\n");
  });
});
