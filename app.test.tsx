// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

const app = await loadPluginApp(() => import("./app"));
afterEach(cleanup);

const session = { id: "s1", producerThreadId: "t1", viewThreadId: "t1", replyThreadId: "t1", projectId: null, hostId: null, absolutePath: "/repo/plan.html", sourceKind: "workspace", status: "open", endedBy: null, deliveryMode: "default", createdAt: 0, updatedAt: 0 };
const sha = "a".repeat(64);
const revision = { id: "r1", sessionId: "s1", sha256: sha, sizeBytes: 1, recordedAt: 0, trigger: "open" };
const payload = { session, revision, revisionNumber: 1, displayPath: "plan.html", capabilities: { newWindow: true, markdownEditing: true }, markdown: null, document: { srcdoc: "<html><body><p id='a'>Hi</p></body></html>", inlined: [], linked: [], skipped: [] }, queued: [], batches: [], replies: [] };

describe("Noted review tab", () => {
  it("registers the review action and renders a sandboxed iframe from the session document", async () => {
    const action = app.threadPanelActions.find((a) => a.id === "review")!;
    expect(action.layout).toBe("flush");
    const slot = renderSlot(action, { threadId: "t1", params: { sessionId: "s1" } }, { rpc: { getSession: () => payload }, context: { threadId: "t1", projectId: null } });
    const frame = (await slot.findByTitle("Noted: plan.html")) as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-popups");
    expect(frame.getAttribute("srcdoc")).toContain("<p id='a'>Hi</p>");
    expect(slot.getByText("revision 1")).toBeTruthy();
    expect(slot.inspection.rpcCalls[0]).toEqual({ method: "getSession", input: { sessionId: "s1" } });
  });
  it("ignores messages that are not from its iframe or carry the wrong token", async () => {
    const action = app.threadPanelActions.find((a) => a.id === "review")!;
    const slot = renderSlot(action, { threadId: "t1", params: { sessionId: "s1" } }, { rpc: { getSession: () => payload }, context: { threadId: "t1", projectId: null } });
    const frame = (await slot.findByTitle("Noted: plan.html")) as HTMLIFrameElement;
    await act(async () => {});
    act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "lavish:queuePrompt", artifact_load_token: "r1", selector: "#a", tag: "p", text: "Hi" }, source: window })); });
    act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "lavish:queuePrompt", artifact_load_token: "wrong", selector: "#b", tag: "p", text: "Hi" }, source: frame.contentWindow })); });
    await act(async () => {});
    expect(slot.queryByLabelText(/Annotation for/)).toBeNull();
  });
  it("queues an annotation from an iframe message and sends it", async () => {
    const calls: string[] = [];
    const action = app.threadPanelActions.find((a) => a.id === "review")!;
    const rpc = {
      getSession: () => payload,
      queuePrompt: (i: any) => { calls.push("queue:" + i.selector + ":" + i.prompt); return { id: "q1", sessionId: "s1", revisionId: "r1", uid: i.uid, prompt: i.prompt, selector: i.selector, tag: i.tag, text: i.text, target: i.target ?? null, createdAt: 1 }; },
      send: (i: any) => { calls.push("send:" + i.mode + ":" + i.endSession); return { batch: { id: "b1", sessionId: "s1", revisionId: "r1", items: [], messageText: "Noted: feedback on plan.html (revision 1, 1 items)", mode: "queue-if-active", delivery: "sent", error: null, sentAt: 2 } }; },
    };
    const slot = renderSlot(action, { threadId: "t1", params: { sessionId: "s1" } }, { rpc, context: { threadId: "t1", projectId: null } });
    const frame = (await slot.findByTitle("Noted: plan.html")) as HTMLIFrameElement;
    await act(async () => {});
    act(() => { window.dispatchEvent(new MessageEvent("message", { data: { type: "lavish:queuePrompt", artifact_load_token: "r1", prompt: { uid: "u1", prompt: "shorter", selector: "#a", tag: "p", text: "Hi", target: { kind: "table-cell", row: "A" } } }, source: frame.contentWindow })); });
    await slot.findByText("shorter");
    expect(slot.queryByLabelText(/Annotation for/)).toBeNull();
    fireEvent.click(slot.getByRole("button", { name: "Send to agent" }));
    await waitFor(() => expect(calls).toEqual(["queue:#a:shorter", "send:undefined:false"]));
    await slot.findByText(/Noted: feedback on plan.html/);
  });

  it("opens the Markdown source editor, saves its source, then reloads the preview", async () => {
    const markdown = {
      ...payload,
      displayPath: "notes.md",
      markdown: "# First draft",
      document: { ...payload.document, srcdoc: "<h1>First draft</h1>" },
    };
    const refreshed = {
      ...markdown,
      revision: { ...revision, id: "r2", sha256: "b".repeat(64) },
      revisionNumber: 2,
      document: { ...markdown.document, srcdoc: "<h1>Saved draft</h1>" },
    };
    const getSession = vi.fn().mockResolvedValueOnce(markdown).mockResolvedValueOnce(refreshed);
    const action = app.threadPanelActions.find((a) => a.id === "review")!;
    const slot = renderSlot(action, { threadId: "t1", params: { sessionId: "s-save" } }, {
      rpc: { getSession, saveMarkdown: () => ({ sha256: "b".repeat(64) }) },
      context: { threadId: "t1", projectId: null },
    });

    fireEvent.click(await slot.findByRole("button", { name: "Edit Markdown" }));
    const editor = slot.getByLabelText("Markdown source") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "# Saved draft" } });
    fireEvent.click(slot.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(slot.inspection.rpcCalls).toContainEqual({
      method: "saveMarkdown",
      input: { sessionId: "s-save", content: "# Saved draft", expectedSha256: sha },
    }));
    await waitFor(() => expect(slot.getByTitle("Noted: notes.md").getAttribute("srcdoc")).toContain("Saved draft"));
    expect(slot.queryByLabelText("Markdown source")).toBeNull();
  });

  it("keeps a Markdown draft after a failed save", async () => {
    const markdown = { ...payload, displayPath: "notes.md", markdown: "# First draft" };
    const action = app.threadPanelActions.find((a) => a.id === "review")!;
    const slot = renderSlot(action, { threadId: "t1", params: { sessionId: "s1" } }, {
      rpc: { getSession: () => markdown, saveMarkdown: () => Promise.reject(new Error("File changed")) },
      context: { threadId: "t1", projectId: null },
    });

    fireEvent.click(await slot.findByRole("button", { name: "Edit Markdown" }));
    const editor = slot.getByLabelText("Markdown source") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "# Keep this draft" } });
    fireEvent.click(slot.getByRole("button", { name: "Save" }));

    expect(await slot.findByText(/Save failed\. Your draft is preserved/)).toBeTruthy();
    expect((slot.getByLabelText("Markdown source") as HTMLTextAreaElement).value).toBe("# Keep this draft");
  });

  it("focuses an existing review window after the panel remounts", async () => {
    const action = app.threadPanelActions.find((a) => a.id === "review")!;
    const popup = { closed: false, focus: vi.fn() } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(popup);
    const slot = renderSlot(action, { threadId: "t1", params: { sessionId: "s-popup" } }, {
      rpc: { getSession: () => payload }, context: { threadId: "t1", projectId: null },
    });

    const button = await slot.findByRole("button", { name: "New window" });
    fireEvent.click(button);
    slot.lifecycle.unmount();
    const remounted = renderSlot(action, { threadId: "t1", params: { sessionId: "s-popup" } }, {
      rpc: { getSession: () => payload }, context: { threadId: "t1", projectId: null },
    });
    fireEvent.click(await remounted.findByRole("button", { name: "New window" }));

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("/plugins/noted/review/s-popup", "noted-review-s-popup", "popup,width=1200,height=900");
    expect(popup.focus).toHaveBeenCalledTimes(2);
    open.mockRestore();
  });

  it("offers the review-link fallback when a window does not open", async () => {
    const action = app.threadPanelActions.find((a) => a.id === "review")!;
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const slot = renderSlot(action, { threadId: "t1", params: { sessionId: "s-blocked" } }, {
      rpc: { getSession: () => payload }, context: { threadId: "t1", projectId: null },
    });
    fireEvent.click(await slot.findByRole("button", { name: "New window" }));
    const fallback = await slot.findByRole("link", { name: "open this review" });
    expect(fallback.getAttribute("href")).toBe("/plugins/noted/review/s-blocked");
    open.mockRestore();
  });

  it("preserves a draft and disables Save when a newer revision arrives", async () => {
    const markdown = { ...payload, displayPath: "notes.md", markdown: "# First draft" };
    const newer = { ...markdown, revision: { ...revision, id: "r2", sha256: "b".repeat(64) }, revisionNumber: 2 };
    const getSession = vi.fn().mockResolvedValueOnce(markdown).mockResolvedValueOnce(newer);
    const action = app.threadPanelActions.find((a) => a.id === "review")!;
    const slot = renderSlot(action, { threadId: "t1", params: { sessionId: "s-conflict" } }, {
      rpc: { getSession }, context: { threadId: "t1", projectId: null },
    });
    fireEvent.click(await slot.findByRole("button", { name: "Edit Markdown" }));
    fireEvent.change(slot.getByLabelText("Markdown source"), { target: { value: "# Keep this draft" } });
    await slot.behavior.emitRealtime("noted:session-changed", { sessionId: "s-conflict" });

    expect(await slot.findByText(/The file changed while you were editing/)).toBeTruthy();
    expect((slot.getByLabelText("Markdown source") as HTMLTextAreaElement).value).toBe("# Keep this draft");
    expect(slot.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  it("does not let an earlier save clear a newer draft after remount", async () => {
    const markdown = { ...payload, displayPath: "notes.md", markdown: "# First draft" };
    let resolveSave: ((result: { sha256: string }) => void) | undefined;
    const save = new Promise<{ sha256: string }>((resolve) => { resolveSave = resolve; });
    const action = app.threadPanelActions.find((a) => a.id === "review")!;
    const first = renderSlot(action, { threadId: "t1", params: { sessionId: "s-pending" } }, {
      rpc: { getSession: () => markdown, saveMarkdown: () => save }, context: { threadId: "t1", projectId: null },
    });
    fireEvent.click(await first.findByRole("button", { name: "Edit Markdown" }));
    fireEvent.change(first.getByLabelText("Markdown source"), { target: { value: "# Earlier draft" } });
    fireEvent.click(first.getByRole("button", { name: "Save" }));
    first.lifecycle.unmount();

    const remounted = renderSlot(action, { threadId: "t1", params: { sessionId: "s-pending" } }, {
      rpc: { getSession: () => markdown, saveMarkdown: () => save }, context: { threadId: "t1", projectId: null },
    });
    const editor = await remounted.findByLabelText("Markdown source") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "# Newer draft" } });
    await act(async () => { resolveSave?.({ sha256: "b".repeat(64) }); });

    expect((remounted.getByLabelText("Markdown source") as HTMLTextAreaElement).value).toBe("# Newer draft");
    remounted.lifecycle.unmount();
    const restored = renderSlot(action, { threadId: "t1", params: { sessionId: "s-pending" } }, {
      rpc: { getSession: () => markdown, saveMarkdown: () => save }, context: { threadId: "t1", projectId: null },
    });
    expect((await restored.findByLabelText("Markdown source") as HTMLTextAreaElement).value).toBe("# Newer draft");
  });

  it("does not offer source editing for HTML", async () => {
    const action = app.threadPanelActions.find((a) => a.id === "review")!;
    const slot = renderSlot(action, { threadId: "t1", params: { sessionId: "s1" } }, {
      rpc: { getSession: () => payload }, context: { threadId: "t1", projectId: null },
    });
    await slot.findByTitle("Noted: plan.html");
    expect(slot.queryByRole("button", { name: "Edit Markdown" })).toBeNull();
  });
});

describe("Noted banner and opener", () => {
  it("keeps the standalone review route unavailable when new windows are disabled", async () => {
    const panel = app.navPanels.find((item) => item.id === "review-window")!;
    const slot = renderSlot(panel, { subPath: "s1" }, {
      rpc: { getSession: () => ({ ...payload, capabilities: { newWindow: false, markdownEditing: true } }) },
    });
    expect(await slot.findByText(/Opening reviews in a new window is disabled/)).toBeTruthy();
  });

  it("shows the review banner in the viewer thread and opens the tab", async () => {
    const banner = app.composerCustomizations.flatMap((c) => c.banners ?? []).find((b) => b.id === "review-requested")!;
    const slot = renderSlot(banner, {}, { rpc: { listSessions: () => ({ sessions: [{ ...session, producerThreadId: "thr_loops", viewThreadId: "t1" }] }) }, composer: { scope: { kind: "thread", threadId: "t1" } } });
    await slot.findByText(/Review requested: plan.html from thr_loops/);
    fireEvent.click(slot.getByRole("button", { name: "Open" }));
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "openThreadPanel", options: expect.objectContaining({ actionId: "review", params: { sessionId: "s1" } }) });
  });
  it("file opener shows bb's preview with a Review with Noted button", async () => {
    const opener = app.fileOpeners.find((o) => o.id === "html")!;
    expect([...opener.extensions]).toEqual(["html", "htm", "md", "markdown"]);
    const Original = () => <div>original preview</div>;
    const slot = renderSlot(opener, { path: "plan.html", source: { kind: "workspace", threadId: "t1", environmentId: "e1", projectId: "p1" }, Original }, { rpc: { listSessions: () => ({ sessions: [] }), openSession: () => payload }, context: { threadId: "t1", projectId: "p1" } });
    await slot.findByText("original preview");
    fireEvent.click(slot.getByRole("button", { name: "Review with Noted" }));
    await waitFor(() => expect(slot.inspection.rpcCalls.some((c) => c.method === "openSession")).toBe(true));
    expect(slot.inspection.rpcCalls.find((c) => c.method === "openSession")?.input).toMatchObject({ reopen: true });
    await waitFor(() => expect(slot.inspection.navigateCalls).toContainEqual({ method: "openThreadPanel", options: expect.objectContaining({ actionId: "review", params: { sessionId: "s1" } }) }));
  });
  it("offers Noted for Markdown without an agent-created session", async () => {
    const opener = app.fileOpeners.find((o) => o.id === "html")!;
    const Original = () => <div>rendered markdown preview</div>;
    const markdownPayload = {
      ...payload,
      session: { ...session, absolutePath: "/repo/notes.md" },
      displayPath: "notes.md",
    };
    const slot = renderSlot(opener, { path: "notes.md", source: { kind: "workspace", threadId: "t1", environmentId: "e1", projectId: "p1" }, Original }, { rpc: { listSessions: () => ({ sessions: [] }), openSession: () => markdownPayload }, context: { threadId: "t1", projectId: "p1" } });

    const preview = await slot.findByText("rendered markdown preview");
    expect(preview.parentElement?.classList.contains("overflow-y-auto")).toBe(true);
    fireEvent.click(slot.getByRole("button", { name: "Review with Noted" }));

    await waitFor(() => expect(slot.inspection.rpcCalls.find((call) => call.method === "openSession")?.input).toMatchObject({ path: "notes.md", reopen: true }));
    expect(slot.inspection.navigateCalls).toContainEqual({ method: "openThreadPanel", options: expect.objectContaining({ actionId: "review", params: { sessionId: "s1" } }) });
  });
  it("file opener is enabled for a thread-storage file and reuses its open session", async () => {
    const opener = app.fileOpeners.find((o) => o.id === "html")!;
    const Original = () => <div>original preview</div>;
    const open = { ...session, id: "s9", absolutePath: "/home/m/.bb/thread-storage/t1/noted-smoke/plan.html", sourceKind: "thread-storage" };
    const slot = renderSlot(opener, { path: "noted-smoke/plan.html", source: { kind: "thread-storage", threadId: "t1", environmentId: null, projectId: "p1" }, Original }, { rpc: { listSessions: () => ({ sessions: [open] }), openSession: () => payload }, context: { threadId: "t1", projectId: "p1" } });
    await slot.findByText("original preview");
    const button = slot.getByRole("button", { name: "Review with Noted" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(slot.inspection.navigateCalls).toContainEqual({ method: "openThreadPanel", options: expect.objectContaining({ actionId: "review", params: { sessionId: "s9" } }) }));
    expect(slot.inspection.rpcCalls.some((c) => c.method === "openSession")).toBe(false);
  });
  it("renders the review in the file tab when the host declines a second panel", async () => {
    const opener = app.fileOpeners.find((o) => o.id === "html")!;
    const Original = () => <div>original preview</div>;
    const slot = renderSlot(
      opener,
      {
        path: "plan.html",
        source: {
          kind: "workspace",
          threadId: "t1",
          environmentId: "e1",
          projectId: "p1",
        },
        Original,
      },
      {
        rpc: {
          listSessions: () => ({ sessions: [] }),
          openSession: () => payload,
          getSession: () => payload,
        },
        context: { threadId: "t1", projectId: "p1" },
        openThreadPanel: () => false,
      },
    );

    fireEvent.click(slot.getByRole("button", { name: "Review with Noted" }));

    expect(await slot.findByTitle("Noted: plan.html")).toBeTruthy();
    expect(slot.queryByText("original preview")).toBeNull();
    expect(slot.getByRole("button", { name: "Back to preview" })).toBeTruthy();
  });
  it("shows a useful error when the file opener cannot create a session", async () => {
    const opener = app.fileOpeners.find((o) => o.id === "html")!;
    const Original = () => <div>original preview</div>;
    const slot = renderSlot(
      opener,
      {
        path: "plan.html",
        source: {
          kind: "workspace",
          threadId: "t1",
          environmentId: "e1",
          projectId: "p1",
        },
        Original,
      },
      {
        rpc: {
          listSessions: () => Promise.reject(new Error("service unavailable")),
        },
        context: { threadId: "t1", projectId: "p1" },
      },
    );

    fireEvent.click(slot.getByRole("button", { name: "Review with Noted" }));

    expect((await slot.findByRole("alert")).textContent).toContain("service unavailable");
    expect(slot.getByText("original preview")).toBeTruthy();
  });
});
