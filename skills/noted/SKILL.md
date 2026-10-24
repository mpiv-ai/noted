---
name: noted
description: 'Operate the complete Noted review workflow for HTML, Markdown, and diff or patch artifacts in bb. Use when opening an artifact or a code diff for review, routing review to another thread, responding to annotations, checking or ending a session, reopening an ended review, or filing a finished artifact to a knowledge base. Also use when a user message begins with "Noted: feedback on".'
---

# Noted review workflow

Use Noted to collaborate on an HTML, rendered Markdown, or unified diff
artifact in the bb side panel. For creating an HTML artifact, also use `reviewable-html` when that
skill is available.

## Start a review

1. Make sure the HTML, Markdown, `.diff`, or `.patch` file exists in the
   workspace or `$BB_THREAD_STORAGE`.
2. Run `bb noted open <file>` from the producing thread.
3. Route the review only when needed:
   - `--view parent` shows it in the thread that spawned this one.
   - `--view <thread>` shows it in another thread.
   - `--reply-to <thread>` sends the feedback somewhere other than the
     producing thread.
4. Tell the user the artifact is ready. If the requested work is complete or
   further work requires their feedback, end the turn. Otherwise continue
   independent authorized work; opening a review does not create an approval
   gate. Do not poll or call `status` merely to wait for feedback; it arrives
   as a new user message.

### Review a code diff

To have the user annotate code changes line by line, write a unified diff to
thread storage and open it:

```sh
git diff > "$BB_THREAD_STORAGE/review.diff"
bb noted open "$BB_THREAD_STORAGE/review.diff"
```

Any unified diff works: `git diff`, `git diff --cached`, `git diff main...HEAD`,
`git show`, `git format-patch --stdout`, or `diff -u`. Noted renders each file,
hunk, and line as an annotatable element and shows binary files as a notice.
Keep the diff out of the repository so it is not committed.

Read [references/commands.md](references/commands.md) before using cross-thread
routing, reopening, JSON output, or knowledge-base filing.

## Respond to feedback

A feedback message starts with `Noted: feedback on` and identifies the artifact
revision. Each numbered item includes its target, selected text when relevant,
and the requested change.

1. Apply every accepted item to the same source file. For HTML, preserve the
   target's stable `id` or semantic structure unless the requested change
   requires it. For Markdown, use the quoted text and rendered element as the
   target; selectors refer to rendered HTML rather than Markdown syntax.
   For a diff, each item names the changed file, the side, and the line, such
   as ``diff `src/app.ts` line 14, new side (added)``. New-side lines number
   the file after the change and old-side lines the file before it. Edit the
   named source files, not the diff, then regenerate the diff file with the
   same command so Noted captures a new revision.
2. If an item is ambiguous or conflicts with another item, make safe independent
   changes and ask one focused question about the conflict.
3. Run the artifact's relevant checks. Do not reopen the session: Noted captures
   the changed file as a new revision after the turn and refreshes the panel.
4. When useful, run `bb noted reply <text>` to leave a short implementation note
   in the review conversation.
5. Finish the requested feedback work and any remaining independent authorized
   work, then give a concise summary of what changed.

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
