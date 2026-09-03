# Noted command reference

All commands must run inside a bb thread.

## Open

```sh
bb noted open <file> [--view <thread>] [--reply-to <thread>] [--reopen] [--json]
```

- `<file>` can be workspace HTML or a path in `$BB_THREAD_STORAGE`.
- The producing thread owns the session and normally receives feedback.
- `--view` and `--reply-to` each accept `self`, `parent`, or a thread ID.
  `self` is the producing thread and is the default for both roles. `parent`
  requires the producing thread to have a parent.
- `--reply-to` changes the feedback target independently of the viewer. Omit it
  when feedback should return to the producing thread.
- Opening the same live artifact reuses its session. Supplying a new `--view`
  or `--reply-to` moves that role in place.
- An ended session stays ended. Use `--reopen` only after the user asks to resume.
- `--json` returns `session_id`, `path`, `view_thread`, `reply_thread`,
  `revision`, and `next_step`.

Examples:

```sh
bb noted open decision.html
bb noted open decision.html --view parent
bb noted open decision.html --view parent --reply-to parent --json
bb noted open decision.html --reopen
```

## Reply

```sh
bb noted reply <text...> [--json]
```

Adds a short agent note to the most recently updated open session visible to
the calling thread. Use it for a useful review-loop update, not as a substitute
for editing the artifact.

## Status

```sh
bb noted status [<file>] [--json]
```

Lists open sessions associated with the calling thread. Passing `<file>` filters
to that artifact. Human output shows the path, session, revision, queued item
count, and reply count. JSON also includes viewer, feedback target, and last
delivery metadata.

Do not poll status after opening a review. The plugin pushes feedback and
revision updates.

## End

```sh
bb noted end <file>
```

Ends the producing thread's open session for the artifact. Ending does not
delete the HTML or its stored review history.

## File to a knowledge base

```sh
bb noted file <file> --to <folder> --title <title> --summary <text> \
  [--profile <name>] [--json]
```

This creates two timestamped files in the explicit destination:

- a self-contained HTML export with local assets embedded when possible;
- a Markdown companion note with title, summary, source thread, profile, and a
  link to the HTML.

The default profile is `durable_research`. Filing does not end the review
session. Use only a destination supplied by the user or established by the
active repository/vault instructions, and read back both returned paths.

## Review-side capabilities

In the Noted panel the reviewer can:

- annotate a whole element or a selected text range;
- edit or remove queued feedback before sending;
- add an overall note alongside targeted items;
- deliver the batch with the session's queue or steer mode;
- choose **Send to agent** or **Send & End**;
- see agent replies and revision changes without manually reopening the file.
