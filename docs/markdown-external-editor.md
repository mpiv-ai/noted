# Open Markdown in an external editor

T2: Noted is used live. Users can open the saved Markdown source in their
client's preferred file app from either review surface.

## Acceptance and delivery checklist

- [x] Markdown reviews offer Open in editor through BB's external-file API;
  HTML does not. The existing `markdownEditing` flag controls availability.
- [x] The request names the original host and absolute path. Missing host
  identity disables the action; it never guesses the client's filesystem.
- [x] Unsaved Noted drafts remain intact. Opening an editor uses the saved file.
- [x] Rejected dispatch displays an error. BB owns asynchronous launch errors,
  local-helper availability, app preferences, and remote-editor support.
- [ ] Run repository checks and verify a real client launch before claiming
  live completion (SLICE-4–6, AGENT-2/4/7).
- [ ] Observe the client launch outcome; do not count accepted dispatch as a
  successful editor launch (SLICE-7, MET-2).

The seam is the toolbar action calling `experimental_openFileExternally`.
Rollback: disable `markdownEditing`, or revert this change; no data migration
or API change is involved (SLICE-2/3/8, REV-1–5). Remove the toolbar action,
its state, tests, and this document to remove the feature. No dependencies
are added (CPX-1–7). Existing release authorization applies; no irreversible
surface is introduced (IRR). Keep the diff scoped and evidence attached
(AGENT-1–9); release and flag tracking remain part of the existing slice (MET).

## Client behavior

BB uses the user's connected local helper. A local file opens with BB's
preferred file target, falling back according to BB's app selection rules.
An OS default app is not guaranteed when another preference is set. A file
on another host needs a target that supports remote access. There is no
downloaded copy or new synchronization mechanism.

## Acceptance evidence

`app.test.tsx:15`, “opens the original Markdown file on its declared host and
reports rejected dispatch”, covers routing and immediate failure.
`app.test.tsx:27`, “does not offer an external editor for HTML”, covers format.
`app.test.tsx:44`, “opens from a standalone review without losing an unsaved
Noted draft”, covers the second surface and draft preservation.
`app.test.tsx:58`, “disables opening when the original file host is unknown”,
covers missing identity. `app.test.tsx:34`, “honors the Markdown editing switch
for external opening”, covers the kill switch. A native app launch still
requires live client verification.
