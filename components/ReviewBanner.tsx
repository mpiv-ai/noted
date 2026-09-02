import { useCallback, useEffect, useState } from "react";
import { useBbNavigate, useComposerView, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { z } from "zod";

import type { rpcContract } from "../lib/rpc";

type Session = z.infer<typeof rpcContract.listSessions.output>["sessions"][number];

export default function ReviewBanner() {
  const scope = useComposerView().scope;

  if (scope.kind !== "thread") {
    return null;
  }

  return <ThreadReviewBanner threadId={scope.threadId} />;
}

function ThreadReviewBanner({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const loadSessions = useCallback(() => {
    void rpc.call("listSessions", { threadId }).then(({ sessions: nextSessions }) => {
      setSessions(nextSessions);
    });
  }, [rpc, threadId]);

  useEffect(loadSessions, [loadSessions]);
  useRealtime("noted:session-changed", loadSessions);

  const visible = sessions.filter(
    (session) =>
      session.status === "open" &&
      session.viewThreadId === threadId &&
      session.producerThreadId !== threadId &&
      !dismissed.has(session.id),
  );

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-md border p-2">
      {visible.map((session) => (
        <div key={session.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-1">
            Review requested: {session.absolutePath.split("/").pop() ?? session.absolutePath} from{" "}
            {session.producerThreadId}
          </span>
          <button
            type="button"
            onClick={() => {
              void navigate.openThreadPanel({
                actionId: "review",
                params: { sessionId: session.id },
              });
            }}
            className="rounded-md border px-2 py-1"
          >
            Open
          </button>
          <button
            type="button"
            onClick={() => {
              setDismissed((current) => new Set(current).add(session.id));
            }}
            className="rounded-md border px-2 py-1"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
