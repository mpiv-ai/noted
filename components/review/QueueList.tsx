import { useState } from "react";
import type { z } from "zod";

import type { rpcContract } from "../../lib/rpc";

type QueuedPrompt = z.infer<typeof rpcContract.queuePrompt.output>;

export function QueueList({
  items,
  onUpdate,
  onRemove,
}: {
  items: QueuedPrompt[];
  onUpdate: (id: string, prompt: string) => void;
  onRemove: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-md border p-2 text-sm">
          {editingId === item.id ? (
            <div className="space-y-2">
              <textarea
                aria-label={`Edit annotation for ${item.selector}`}
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.value)}
                className="min-h-16 w-full resize-y rounded-md border bg-transparent p-2"
              />
              <button
                type="button"
                disabled={draft.trim() === ""}
                onClick={() => {
                  onUpdate(item.id, draft);
                  setEditingId(null);
                }}
                className="rounded-md border px-2 py-1 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 whitespace-pre-wrap">{item.prompt}</span>
              <button
                type="button"
                onClick={() => {
                  setDraft(item.prompt);
                  setEditingId(item.id);
                }}
                className="rounded-md border px-2 py-1"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="rounded-md border px-2 py-1"
              >
                Remove
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
