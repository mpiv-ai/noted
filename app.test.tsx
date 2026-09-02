// @vitest-environment jsdom
import { cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

const app = await loadPluginApp(() => import("./app"));
afterEach(cleanup);

const session = { id: "s1", producerThreadId: "t1", viewThreadId: "t1", replyThreadId: "t1", projectId: null, hostId: null, absolutePath: "/repo/plan.html", sourceKind: "workspace", status: "open", endedBy: null, deliveryMode: "default", createdAt: 0, updatedAt: 0 };
const revision = { id: "r1", sessionId: "s1", sha256: "a", sizeBytes: 1, recordedAt: 0, trigger: "open" };
const payload = { session, revision, revisionNumber: 1, displayPath: "plan.html", document: { srcdoc: "<html><body><p id='a'>Hi</p></body></html>", inlined: [], linked: [], skipped: [] }, queued: [], batches: [], replies: [] };

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
    await slot.findByTitle("Noted: plan.html");
    window.dispatchEvent(new MessageEvent("message", { data: { type: "lavish:queuePrompt", artifact_load_token: "r1", selector: "#a", tag: "p", text: "Hi" }, source: window }));
    window.dispatchEvent(new MessageEvent("message", { data: { type: "lavish:queuePrompt", artifact_load_token: "wrong", selector: "#b", tag: "p", text: "Hi" }, source: (slot.getByTitle("Noted: plan.html") as HTMLIFrameElement).contentWindow }));
    await waitFor(() => expect(slot.getByTestId("noted-events").children).toHaveLength(0));
  });
});
