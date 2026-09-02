import { useState } from "react";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import type { PluginFileOpenerProps } from "@get-bb/plugin-sdk/app";

import type { rpcContract } from "../lib/rpc";

export default function HtmlOpener({ path, source, Original }: PluginFileOpenerProps) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [opening, setOpening] = useState(false);
  const disabled = source.threadId === null || source.kind === "thread-storage";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-end border-b p-2">
        <button
          type="button"
          disabled={disabled || opening}
          title={disabled ? `Run bb noted open ${path} from the thread` : undefined}
          onClick={() => {
            const threadId = source.threadId;
            if (threadId === null || source.kind === "thread-storage") {
              return;
            }

            setOpening(true);
            void rpc
              .call("listSessions", { threadId })
              .then(async ({ sessions }) => {
                const existing = sessions.find(
                  (session) =>
                    session.status === "open" &&
                    session.producerThreadId === threadId &&
                    (session.absolutePath === path || session.absolutePath.endsWith(`/${path}`)),
                );
                const sessionId = existing
                  ? existing.id
                  : (await rpc.call("openSession", { threadId, path })).session.id;
                void navigate.openThreadPanel({
                  actionId: "review",
                  params: { sessionId },
                });
              })
              .finally(() => setOpening(false));
          }}
          className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
        >
          Review with Noted
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Original />
      </div>
    </div>
  );
}
