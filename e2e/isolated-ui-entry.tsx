import { createRoot } from "react-dom/client";

import ReviewTab from "../components/review/ReviewTab";

const contentType = "application/json";

window.__notedIsolatedRpc = {
  async call(method, input) {
    const response = await fetch("/__noted_rpc", {
      method: "POST",
      headers: { "content-type": contentType },
      body: JSON.stringify({ method, input }),
    });
    const body = await response.json() as { value?: unknown; error?: string };
    if (!response.ok) throw new Error(body.error ?? "Isolated RPC request failed");
    if (method === "saveMarkdown") {
      const broadcast = new BroadcastChannel("noted-isolated-realtime");
      broadcast.postMessage({ channel: "noted:session-changed", payload: { sessionId: input.sessionId } });
      broadcast.close();
    }
    return body.value;
  },
};

function Shell() {
  return (
    <main>
      <header>Isolated Noted UI harness</header>
      <p className="harness-note">Uses the real ReviewTab component with a local persisted-session RPC fixture.</p>
      <ReviewTab threadId="" params={{ sessionId: location.pathname.includes("/html") ? "html-session" : "markdown-session" }} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Shell />);
