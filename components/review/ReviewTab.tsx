import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import type { z } from "zod";

import { useArtifactBridge } from "../../hooks/useArtifactBridge";
import type { rpcContract } from "../../lib/rpc";

import { ArtifactFrame } from "./ArtifactFrame";
import { Composer } from "./Composer";
import type { DeliveryMode } from "./Composer";
import { Conversation } from "./Conversation";
import { QueueList } from "./QueueList";

type SessionPayload = z.infer<typeof rpcContract.getSession.output>;
type SendInput = z.infer<typeof rpcContract.send.input>;
type ReviewState =
  | { status: "loading" }
  | { status: "loaded"; payload: SessionPayload }
  | { status: "error"; message: string };
type RetryState = { input: SendInput; message: string };

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
  const [queued, setQueued] = useState<SessionPayload["queued"]>([]);
  const [batches, setBatches] = useState<SessionPayload["batches"]>([]);
  const [replies, setReplies] = useState<SessionPayload["replies"]>([]);
  const [freeform, setFreeform] = useState("");
  const [mode, setMode] = useState<DeliveryMode>("default");
  const [sending, setSending] = useState(false);
  const [handled, setHandled] = useState(0);
  const [retry, setRetry] = useState<RetryState | null>(null);

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

  useEffect(() => {
    if (loadedPayload === null) {
      return;
    }

    setQueued(loadedPayload.queued);
    setBatches(loadedPayload.batches);
    setReplies(loadedPayload.replies);
    setMode(loadedPayload.session.deliveryMode);
  }, [loadedPayload]);

  useEffect(() => {
    if (bridge.events.length <= handled || sessionId === null) {
      return;
    }

    const event = bridge.events[handled];
    if (event?.data.type === "lavish:queuePrompt") {
      const { data } = event;
      const item = data.prompt;
      if (
        typeof item === "object" &&
        item !== null &&
        "selector" in item &&
        typeof item.selector === "string" &&
        "tag" in item &&
        typeof item.tag === "string" &&
        "text" in item &&
        typeof item.text === "string" &&
        "prompt" in item &&
        typeof item.prompt === "string"
      ) {
        const uid =
          "uid" in item && item.uid !== null && item.uid !== undefined
            ? String(item.uid)
            : String(Date.now());
        const target = "target" in item ? item.target : undefined;
        void rpc
          .call("queuePrompt", {
            sessionId,
            uid,
            prompt: item.prompt,
            selector: item.selector,
            tag: item.tag,
            text: item.text,
            ...(target !== undefined && target !== null ? { target } : {}),
          })
          .then((prompt) => {
            setQueued((current) => [...current, prompt]);
            bridge.post({ type: "lavish:setAnnotationMode", enabled: true });
          });
      }
    }
    setHandled(bridge.events.length);
  }, [bridge.events, handled]);

  const executeSend = useCallback(
    (input: SendInput) => {
      setSending(true);
      setRetry(null);
      void rpc.call("send", input).then(
        ({ batch }) => {
          setBatches((current) => [...current, batch]);
          if (batch.delivery !== "failed") {
            setQueued([]);
          }
          setFreeform("");
          if (batch.delivery === "failed") {
            setRetry({ input, message: batch.error ?? "Delivery failed." });
          }
          setSending(false);
        },
        (error: unknown) => {
          setRetry({
            input,
            message: error instanceof Error ? error.message : String(error),
          });
          setSending(false);
        },
      );
    },
    [rpc],
  );

  if (sessionId === null) {
    return <div role="alert">Noted: this tab needs a sessionId.</div>;
  }

  if (state.status === "error") {
    return <div role="alert">{state.message}</div>;
  }

  if (loadedPayload === null) {
    return <div>Loading Noted review…</div>;
  }

  const send = (endSession: boolean) => {
    const trimmedFreeform = freeform.trim();
    executeSend({
      sessionId,
      endSession,
      ...(trimmedFreeform ? { freeform: trimmedFreeform } : {}),
      ...(mode === "queue"
        ? { mode: "queue-if-active" as const }
        : mode === "steer"
          ? { mode: "steer-if-active" as const }
          : {}),
    });
  };

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
      <div className="max-h-[45%] space-y-3 overflow-auto border-t p-3">
        <QueueList
          items={queued}
          onUpdate={(id, prompt) => {
            void rpc.call("updatePrompt", { id, prompt }).then(() => {
              setQueued((current) =>
                current.map((item) => (item.id === id ? { ...item, prompt } : item)),
              );
            });
          }}
          onRemove={(id) => {
            void rpc.call("removePrompt", { id }).then(() => {
              setQueued((current) => current.filter((item) => item.id !== id));
            });
          }}
        />
        {retry ? (
          <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <span className="min-w-0 flex-1">{retry.message}</span>
            <button
              type="button"
              disabled={sending}
              onClick={() => executeSend(retry.input)}
              className="rounded-md border px-2 py-1 disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        ) : null}
        <Composer
          freeform={freeform}
          onFreeformChange={setFreeform}
          mode={mode}
          onModeChange={(nextMode) => {
            setMode(nextMode);
            void rpc.call("setDeliveryMode", { sessionId, mode: nextMode }).catch(() => {});
          }}
          canSend={queued.length > 0 || freeform.trim() !== ""}
          sending={sending}
          onSend={() => send(false)}
          onSendAndEnd={() => send(true)}
        />
        <Conversation batches={batches} replies={replies} />
      </div>
    </div>
  );
}
