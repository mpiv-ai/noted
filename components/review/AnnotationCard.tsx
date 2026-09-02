import { useState } from "react";

export function AnnotationCard({
  selector,
  tag,
  text,
  onQueue,
  onCancel,
}: {
  selector: string;
  tag: string;
  text: string;
  onQueue: (prompt: string) => void;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const blank = prompt.trim() === "";

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="font-mono text-xs">{`<${tag}> ${selector}`}</div>
      <blockquote className="border-l-2 pl-2 text-sm text-muted-foreground">
        {text}
      </blockquote>
      <textarea
        aria-label={`Annotation for ${selector}`}
        value={prompt}
        onChange={(event) => setPrompt(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
          }

          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!blank) {
              onQueue(prompt);
            }
          }
        }}
        className="min-h-20 w-full resize-y rounded-md border bg-transparent p-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={blank}
          onClick={() => onQueue(prompt)}
          className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
        >
          Queue
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-3 py-1 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
