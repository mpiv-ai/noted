import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import type { z } from "zod";

import { useArtifactBridge } from "../../hooks/useArtifactBridge";
import type { rpcContract } from "../../lib/rpc";

import { ArtifactFrame } from "./ArtifactFrame";

type SessionPayload = z.infer<typeof rpcContract.getSession.output>;

type ReviewState =
  | { status: "loading" }
  | { status: "loaded"; payload: SessionPayload }
  | { status: "error"; message: string };

function getSessionId(params: PluginThreadPanelProps["params"]): string | null {
  if (
    typeof params === "object" &&
    params !== null &&
    "sessionId" in params &&
    typeof params.sessionId === "string"
  ) {
    return params.sessionId;
  }

  return null;
}

export default function ReviewTab({ params }: PluginThreadPanelProps) {
  const sessionId = getSessionId(params);
  const rpc = useRpc<typeof rpcContract>();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [state, setState] = useState<ReviewState>({ status: "loading" });

  const loadSession = useCallback(() => {
    if (sessionId === null) {
      return;
    }

    setState({ status: "loading" });
    void rpc.call("getSession", { sessionId }).then(
      (payload) => setState({ status: "loaded", payload }),
      (error: unknown) =>
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
    );
  }, [rpc, sessionId]);

  useEffect(loadSession, [loadSession]);

  useRealtime("noted:session-changed", (payload) => {
    if (
      typeof payload === "object" &&
      payload !== null &&
      "sessionId" in payload &&
      payload.sessionId === sessionId
    ) {
      loadSession();
    }
  });

  const loadedPayload = state.status === "loaded" ? state.payload : null;
  const bridge = useArtifactBridge(frameRef, loadedPayload?.revision.id ?? null);

  if (sessionId === null) {
    return <div role="alert">Noted: this tab needs a sessionId.</div>;
  }

  if (state.status === "error") {
    return <div role="alert">{state.message}</div>;
  }

  if (loadedPayload === null) {
    return <div>Loading Noted review…</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b p-2 text-xs">
        <span>{loadedPayload.displayPath}</span>
        <span>revision {loadedPayload.revisionNumber}</span>
      </div>
      <ArtifactFrame
        frameRef={frameRef}
        srcdoc={loadedPayload.document.srcdoc}
        title={`Noted: ${loadedPayload.displayPath}`}
      />
      <ul
        data-testid="noted-events"
        className="max-h-40 overflow-auto border-t p-2 font-mono text-[11px]"
      >
        {bridge.events.map((event) => (
          <li key={event.at} data-type={event.data.type}>
            {JSON.stringify(event.data)}
          </li>
        ))}
      </ul>
    </div>
  );
}
