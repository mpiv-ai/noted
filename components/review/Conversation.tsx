import type { z } from "zod";

import type { rpcContract } from "../../lib/rpc";

type SessionPayload = z.infer<typeof rpcContract.getSession.output>;
type ConversationEntry =
  | { kind: "batch"; at: number; batch: SessionPayload["batches"][number] }
  | { kind: "reply"; at: number; reply: SessionPayload["replies"][number] };

export function Conversation({
  batches,
  replies,
}: {
  batches: SessionPayload["batches"];
  replies: SessionPayload["replies"];
}) {
  const entries: ConversationEntry[] = [
    ...batches.map((batch) => ({ kind: "batch" as const, at: batch.sentAt, batch })),
    ...replies.map((reply) => ({ kind: "reply" as const, at: reply.createdAt, reply })),
  ].sort((left, right) => left.at - right.at);

  return (
    <ol className="space-y-2">
      {entries.map((entry) =>
        entry.kind === "batch" ? (
          <li key={`batch:${entry.batch.id}`} className="rounded-md border p-2 text-sm">
            <pre className="whitespace-pre-wrap">{entry.batch.messageText}</pre>
            <div className="text-xs text-muted-foreground">{entry.batch.delivery}</div>
            {entry.batch.error ? (
              <div role="alert" className="text-sm text-destructive">
                {entry.batch.error}
              </div>
            ) : null}
          </li>
        ) : (
          <li key={`reply:${entry.reply.id}`} className="rounded-md border p-2 text-sm">
            Agent: {entry.reply.text}
          </li>
        ),
      )}
    </ol>
  );
}
