export type DeliveryMode = "default" | "queue" | "steer";

export function Composer({
  freeform,
  onFreeformChange,
  mode,
  onModeChange,
  canSend,
  sending,
  onSend,
  onSendAndEnd,
}: {
  freeform: string;
  onFreeformChange: (value: string) => void;
  mode: DeliveryMode;
  onModeChange: (mode: DeliveryMode) => void;
  canSend: boolean;
  sending: boolean;
  onSend: () => void;
  onSendAndEnd: () => void;
}) {
  return (
    <div className="space-y-2">
      <textarea
        aria-label="Message to the agent"
        value={freeform}
        onChange={(event) => onFreeformChange(event.currentTarget.value)}
        className="min-h-20 w-full resize-y rounded-md border bg-transparent p-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Delivery"
          value={mode}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (value === "default" || value === "queue" || value === "steer") {
              onModeChange(value);
            }
          }}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="default">Default</option>
          <option value="queue">Queue</option>
          <option value="steer">Steer</option>
        </select>
        <button
          type="button"
          disabled={!canSend || sending}
          onClick={onSend}
          className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
        >
          Send to agent
        </button>
        <button
          type="button"
          disabled={!canSend || sending}
          onClick={onSendAndEnd}
          className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
        >
          Send &amp; End
        </button>
      </div>
    </div>
  );
}
