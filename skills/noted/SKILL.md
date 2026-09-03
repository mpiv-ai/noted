---
name: noted
description: 'Operate the complete Noted review workflow for HTML artifacts in bb. Use when opening an artifact for review, routing review to another thread, responding to annotations, checking or ending a session, reopening an ended review, or filing a finished artifact to a knowledge base. Also use when a user message begins with "Noted: feedback on".'
---

# Noted review workflow

Use Noted to collaborate on an HTML artifact in the bb side panel. For creating
the artifact itself, also use `reviewable-html` when that skill is available.

## Start a review

1. Make sure the HTML exists in the workspace or `$BB_THREAD_STORAGE`.
2. Run `bb noted open <file>` from the producing thread.
3. Route the review only when needed:
   - `--view parent` shows it in the thread that spawned this one.
   - `--view <thread>` shows it in another thread.
   - `--reply-to <thread>` sends the feedback somewhere other than the
     producing thread.
4. End the turn with one short sentence telling the user the artifact is ready.
   Do not poll or call `status` while waiting; feedback arrives as a new user
   message.

Read [references/commands.md](references/commands.md) before using cross-thread
routing, reopening, JSON output, or knowledge-base filing.

## Respond to feedback

A feedback message starts with `Noted: feedback on` and identifies the artifact
revision. Each numbered item includes its target, selected text when relevant,
and the requested change.

1. Apply every accepted item to the same HTML file. Preserve the target's
   stable `id` or semantic structure unless the requested change requires it.
2. If an item is ambiguous or conflicts with another item, make safe independent
   changes and ask one focused question about the conflict.
3. Run the artifact's relevant checks. Do not reopen the session: Noted captures
   the changed file as a new revision after the turn and refreshes the panel.
4. When useful, run `bb noted reply <text>` to leave a short implementation note
   in the review conversation.
5. End with a concise summary of what changed.

Do not treat the selector itself as the requested copy. It identifies where the
user commented. Keep factual claims and project constraints intact unless the
feedback explicitly changes them.

## Close or continue

- The reviewer can use **Send to agent** to continue the session or
  **Send & End** to send the batch and close it.
- Run `bb noted end <file>` when the user asks the agent to close an open
  session.
- Do not reopen a session the user ended unless they explicitly ask to resume
  review. Then use `bb noted open <file> --reopen`.
- Use `bb noted status [<file>]` only for a requested status check, recovery, or
  before an explicit close/file operation when the active artifact is unclear.

## Completion

A feedback turn is complete when the requested changes are reflected in the
artifact and its checks pass. The session may remain open for another review
round. The overall review is closed only when the user ends it or asks the agent
to end it. Filing is a separate explicit operation; do not infer a vault
destination or export a draft without instruction.
