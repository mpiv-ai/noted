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
type MarkdownDraft = { content: string; sha256: string };

// A panel can remount as the user moves through BB. Drafts are keyed by their
// review session so they cannot be saved into another file.
const draftsBySession = new Map<string, MarkdownDraft>();
const windowsBySession = new Map<string, Window>();

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

export default function ReviewTab({
  threadId,
  params,
  standalone = false,
}: PluginThreadPanelProps & { standalone?: boolean }) {
  const sessionId = getSessionId(params);
  if (sessionId === null) {
    return <div role="alert">Noted: this tab needs a sessionId.</div>;
  }
  return <ReviewTabForSession key={sessionId} threadId={threadId} params={params} standalone={standalone} />;
}

function ReviewTabForSession({
  params,
  standalone = false,
}: PluginThreadPanelProps & { standalone?: boolean }) {
  const sessionId = getSessionId(params);
  const rpc = useRpc<typeof rpcContract>();
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const loadVersion = useRef(0);
  const [state, setState] = useState<ReviewState>({ status: "loading" });
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [queued, setQueued] = useState<SessionPayload["queued"]>([]);
  const [batches, setBatches] = useState<SessionPayload["batches"]>([]);
  const [replies, setReplies] = useState<SessionPayload["replies"]>([]);
  const [freeform, setFreeform] = useState("");
  const [mode, setMode] = useState<DeliveryMode>("default");
  const [sending, setSending] = useState(false);
  const [handled, setHandled] = useState(0);
  const [draft, setDraftState] = useState<MarkdownDraft | null>(
    () => sessionId === null ? null : draftsBySession.get(sessionId) ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [windowBlocked, setWindowBlocked] = useState(false);
  useEffect(() => {
    if (draft === null) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft !== null]);
  const [retry, setRetry] = useState<RetryState | null>(null);

  const setDraft = useCallback((next: MarkdownDraft | null) => {
    if (sessionId === null) return;
    if (next === null) draftsBySession.delete(sessionId);
    else draftsBySession.set(sessionId, next);
    setDraftState(next);
  }, [sessionId]);

  const loadSession = useCallback(() => {
    if (sessionId === null) {
      return;
    }

    const requestVersion = ++loadVersion.current;
    setRefreshError(null);
    setState((current) => current.status === "loaded" ? current : { status: "loading" });
    void rpc.call("getSession", { sessionId }).then(
      (payload) => {
        if (requestVersion === loadVersion.current) setState({ status: "loaded", payload });
      },
      (error: unknown) => {
        if (requestVersion !== loadVersion.current) return;
        setState((current) => {
          if (current.status === "loaded") {
            setRefreshError(`Showing the last loaded review. ${error instanceof Error ? error.message : String(error)}`);
            return current;
          }
          return { status: "error", message: error instanceof Error ? error.message : String(error) };
        });
      },
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

  useRealtime("noted:capabilities-changed", loadSession);

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
    if (loadedPayload?.markdown === null && draft !== null) {
      setDraft(null);
    }
  }, [draft, loadedPayload?.markdown, setDraft]);

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

  const { capabilities } = loadedPayload;
  const canEditMarkdown =
    capabilities.markdownEditing &&
    loadedPayload.markdown !== null &&
    loadedPayload.session.status === "open";
  const revisionChanged = draft !== null && loadedPayload.revision.sha256 !== draft.sha256;
  const reviewWindowPath = `/plugins/noted/review/${encodeURIComponent(sessionId)}`;

  if (standalone && !capabilities.newWindow) {
    return (
      <div className="p-4 text-sm" role="status">
        Opening reviews in a new window is disabled for this Noted session.
      </div>
    );
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
      <div className="flex items-center justify-between gap-3 border-b p-2 text-xs">
        <span className="min-w-0 truncate">{loadedPayload.displayPath}</span>
        <div className="flex shrink-0 items-center gap-2">
          <span>revision {loadedPayload.revisionNumber}</span>
          {capabilities.newWindow ? <button type="button" className="rounded-md border px-2 py-1" onClick={() => {
            if (standalone) {
              window.focus();
              return;
            }
            const existing = windowsBySession.get(sessionId);
            if (existing !== undefined && !existing.closed) {
              existing.focus();
              setWindowBlocked(false);
              return;
            }
            const popup = window.open(reviewWindowPath, `noted-review-${sessionId}`, "popup,width=1200,height=900");
            if (popup !== null) windowsBySession.set(sessionId, popup);
            setWindowBlocked(popup === null);
            popup?.focus();
          }}>New window</button> : null}
          {canEditMarkdown && draft === null ? (
            <button type="button" className="rounded-md border px-2 py-1" onClick={() => {
              setDraft({ content: loadedPayload.markdown ?? "", sha256: loadedPayload.revision.sha256 });
              setEditError(null);
            }}>Edit Markdown</button>
          ) : null}
        </div>
      </div>
      {windowBlocked ? <p role="alert" className="border-b p-2 text-sm">If no review window opened, <a className="underline" href={reviewWindowPath} target="_blank" rel="noreferrer">open this review</a>.</p> : null}
      {refreshError ? <p role="status" className="border-b p-2 text-sm">{refreshError}</p> : null}
      {draft !== null ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <div>
            <label htmlFor="noted-markdown" className="text-sm font-medium">Markdown source</label>
            <p className="text-xs text-muted-foreground">Editing changes the source file. The preview stays read-only.</p>
          </div>
          <textarea id="noted-markdown" className="min-h-0 flex-1 resize-none rounded-md border bg-background p-3 font-mono text-sm" value={draft.content} disabled={saving} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
          {revisionChanged ? <p role="alert" className="text-sm">The file changed while you were editing. Your draft is preserved and Save is disabled.</p> : null}
          {!canEditMarkdown ? <p role="alert" className="text-sm">Markdown editing is unavailable for this review. Your draft is preserved locally.</p> : null}
          {editError ? <p role="alert" className="text-sm">{editError}</p> : null}
          <div className="flex gap-2">
            <button type="button" className="rounded-md border px-3 py-1 text-sm disabled:opacity-50" disabled={saving || revisionChanged || !canEditMarkdown} onClick={() => {
              setSaving(true);
              setEditError(null);
              const savingDraft = draft;
              void rpc.call("saveMarkdown", { sessionId, content: savingDraft.content, expectedSha256: savingDraft.sha256 }).then(() => {
                if (draftsBySession.get(sessionId) === savingDraft) setDraft(null);
                loadSession();
              }, (error: unknown) => {
                setEditError(`Save failed. Your draft is preserved. ${error instanceof Error ? error.message : String(error)}`);
              }).finally(() => setSaving(false));
            }}>{saving ? "Saving…" : "Save"}</button>
            <button type="button" className="rounded-md border px-3 py-1 text-sm" disabled={saving} onClick={() => {
              setDraft(null);
              setEditError(null);
            }}>Cancel</button>
          </div>
        </div>
      ) : <ArtifactFrame
        frameRef={frameRef}
        srcdoc={loadedPayload.document.srcdoc}
        title={`Noted: ${loadedPayload.displayPath}`}
      />}
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
