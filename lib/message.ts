import type { QueuedPrompt } from "./store";

export type FeedbackMessageInput = {
  displayPath: string;
  revisionNumber: number;
  items: QueuedPrompt[];
  freeform: string | null;
  endSession: boolean;
  reviewedInThreadId: string | null;
  replyThreadId: string;
};

function excerpt(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 120)}…` : normalized;
}

function itemLine(item: QueuedPrompt, number: number): string {
  const target = item.target;
  const quotedExcerpt = `"${excerpt(item.text)}"`;
  const prompt = item.prompt.trim();

  if (typeof target === "object" && target !== null && "kind" in target && target.kind === "table-cell") {
    const row = "row" in target && typeof target.row === "string" ? `row "${target.row}"` : null;
    const column = "column" in target && typeof target.column === "string" ? `column "${target.column}"` : null;
    const location = [row, column].filter((part) => part !== null).join(", ");
    const suffix = location ? ` (${location})` : "";
    return `${number}. ${item.tag} \`${item.selector}\`${suffix} — ${quotedExcerpt} → ${prompt}`;
  }

  if (typeof target === "object" && target !== null && "type" in target && target.type === "text-range") {
    return `${number}. text in \`${item.selector}\`: ${quotedExcerpt} → ${prompt}`;
  }

  return `${number}. ${item.tag} \`${item.selector}\` — ${quotedExcerpt} → ${prompt}`;
}

export function buildFeedbackMessage(input: FeedbackMessageInput): string {
  const freeform = input.freeform?.trim() || null;
  const itemCount = input.items.length + (freeform ? 1 : 0);
  const lines = [
    `Noted: feedback on ${input.displayPath} (revision ${input.revisionNumber}, ${itemCount} items)`,
    "",
  ];

  if (input.reviewedInThreadId !== null) {
    lines.push(`Reviewed in thread ${input.reviewedInThreadId} by Michael.`, "");
  }

  lines.push(...input.items.map((item, index) => itemLine(item, index + 1)));
  if (freeform) {
    lines.push(`${input.items.length + 1}. message → ${freeform}`);
  }

  lines.push("");
  if (input.endSession) {
    lines.push("The reviewer ended the session. Do not reopen it.", "");
  }

  lines.push("Edit the file in place. Reply in chat or with `bb noted reply <text>`; the reviewer is watching the panel.");
  return lines.join("\n");
}
