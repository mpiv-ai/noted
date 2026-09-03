import { useState } from "react";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import type { PluginFileOpenerProps } from "@get-bb/plugin-sdk/app";

import type { rpcContract } from "../lib/rpc";
import ReviewTab from "./review/ReviewTab";

export default function HtmlOpener({ path, source, Original }: PluginFileOpenerProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [opening, setOpening] = useState(false);
  const [inlineSessionId, setInlineSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disabled = source.threadId === null;

  if (inlineSessionId !== null && source.threadId !== null) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-end border-b p-2">
          <button
            type="button"
            onClick={() => setInlineSessionId(null)}
            className="rounded-md border px-3 py-1 text-sm"
          >
            Back to preview
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <ReviewTab threadId={source.threadId} params={{ sessionId: inlineSessionId }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b p-2">
        {error ? (
          <p role="alert" className="min-w-0 flex-1 text-sm text-destructive">
            Noted could not start this review: {error}
          </p>
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          disabled={disabled || opening}
          title={disabled ? `Run bb noted open ${path} from the thread` : undefined}
          onClick={() => {
            const threadId = source.threadId;
            if (threadId === null) {
              return;
            }

            setOpening(true);
            setError(null);
            void (async () => {
              try {
                const { sessions } = await rpc.call("listSessions", { threadId });
                const existing = sessions.find(
                  (session) =>
                    session.status === "open" &&
                    session.producerThreadId === threadId &&
                    (session.absolutePath === path || session.absolutePath.endsWith(`/${path}`)),
                );
                const sessionId = existing
                  ? existing.id
                  : (await rpc.call("openSession", {
                    threadId,
                    path,
                    source: source.kind,
                    reopen: true,
                  })).session.id;
                const accepted = navigate.openThreadPanel({
                  actionId: "review",
                  params: { sessionId },
                });

                if (!accepted) {
                  setInlineSessionId(sessionId);
                }
              } catch (cause: unknown) {
                setError(cause instanceof Error ? cause.message : String(cause));
              } finally {
                setOpening(false);
              }
            })();
          }}
          className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
        >
          Review with Noted
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Original />
      </div>
    </div>
  );
}
