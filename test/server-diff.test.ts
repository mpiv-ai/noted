import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import plugin from "../server";
import { host } from "./helpers";

const diff = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "multi-file.diff"), "utf8");

describe("diff review", () => {
  it("opens a diff as an annotatable document, refreshes on change, and sends line-level feedback", async () => {
    const sent: any[] = [];
    const h = host(async (args) => { sent.push(args); return { ok: true, delivery: "sent" }; });
    h.setContent(diff);
    await plugin(h.bb);

    const opened: any = await h.harness.behavior.callRpc("openSession", { threadId: "thr_a", path: "review/change.diff" });
    expect(opened.markdown).toBeNull();
    expect(opened.document.srcdoc).toContain('data-noted-source="diff"');
    expect(opened.document.srcdoc).toContain('id="nd-0-612e747874-R2"');
    expect(opened.document.srcdoc).toContain("<script>");

    h.setContent(diff.replace("+TWO", "+Two"));
    await h.harness.behavior.emitThreadEvent("thread.idle", { thread: makeThreadResponse({ id: "thr_a" }), lastAssistantText: "done" });
    const refreshed: any = await h.harness.behavior.callRpc("getSession", { sessionId: opened.session.id });
    expect(refreshed.revisionNumber).toBe(2);
    expect(refreshed.document.srcdoc).toContain(">Two</td>");

    await h.harness.behavior.callRpc("queuePrompt", {
      sessionId: opened.session.id, uid: "u1", prompt: "Keep this lowercase.",
      selector: "tr#nd-0-612e747874-R2 > td:nth-of-type(3)", tag: "td", text: "Two",
    });
    await h.harness.behavior.callRpc("send", { sessionId: opened.session.id, endSession: false });
    const text: string = sent[0].input[0].text;
    expect(text.split("\n")[0]).toBe("Noted: feedback on review/change.diff (revision 2, 1 items)");
    expect(text).toContain('1. diff `a.txt` line 2, new side (added) — "Two" → Keep this lowercase.');
    expect(text).toContain("regenerate review/change.diff");
  });
});
