# T2: Markdown editing and review windows

## User and job

A Noted reviewer opens any HTML or Markdown review in a separate browser window, keeps the existing annotation and feedback controls, and edits Markdown source directly. HTML stays read-only. This is a source editor, not a rich-text editor.

## Acceptance criteria

1. New window opens the same review session in a full-page Noted route. Reopening focuses an existing window without erasing an unsaved draft. A blocked popup has a usable fallback.
2. Only `.md` and `.markdown` files expose editing. Save persists UTF-8 to the original file on its owning host; Cancel does not write.
3. Saves require the hash of the source loaded for editing. A concurrent update rejects the write and preserves the draft. Switching reviews never saves a draft into a different file.
4. Successful saves create a revision and update other viewers through realtime events. Preview refresh failure cannot be mistaken for save failure.
5. Ended sessions and disabled editing reject saves on the server. Read-only reviews continue to work when both new features are disabled.
6. Typecheck, tests and plugin builds pass. Browser checks cover popup and edit/save interactions; production acceptance is recorded separately after an authorized release.

## Release and removal

The runtime settings `newWindow` and `markdownEditing` default to false. The seam is the review toolbar, dedicated review route, and `saveMarkdown` RPC. Disable either setting without deploying to stop that feature. Disabling editing rejects subsequent writes; clients retain their drafts. No data migration is needed.

Rollback: disable both settings; existing files and the original review flow remain available. To remove the feature, delete the dedicated route, editing controls, save RPC and its settings; retain existing revisions and source files.

Successful and failed save attempts emit structured log events without document contents. Record first user acceptance and spec-to-acceptance cycle time during release. Existing revision events provide cross-window refresh.

## Delivery checklist

- [x] T2 because Noted is used in the live BB review workflow (TIER-5; AGENT-9).
- [x] Written scope, acceptance criteria, seam, settings and rollback (SLICE-1–3; REV-1, REV-3).
- [x] Map criteria to implementation and named tests (SLICE-5; AGENT-1–4, AGENT-7).
- [x] Pass repository gates without bypasses (SLICE-6).
- [x] Verify structured events and disabling features (SLICE-7).
- [x] Record removal instructions (SLICE-8; CPX-5).
- [ ] Complete one production user flow after authorized deployment and release (SLICE-4; IRR-5).
- [ ] Record cycle time at release; track deployment outcomes and flag age where history supports them (MET-1–3).

Keep the diff scoped, use the existing SDK and vocabulary, add no dependencies without justification, and escalate repeated failures (CPX-1–7; AGENT-3, AGENT-5–8). Preserve public contracts and data; no schema removals or irreversible actions are included (REV-4–5; IRR-1–4). Integration and release require their existing authorizations (REV-2).

## Verification record

`npm run check` passes: 83 tests, TypeScript, server build and app build. The
unchanged baseline passes 67 tests. Independent review findings about the SDK
conflict result, post-write failure handling, popup reuse after remount and
pending-save draft retention were fixed and covered by regression tests.

| Criterion | Implementation | Named test |
| --- | --- | --- |
| 1: same-session window and reuse | `app.tsx:9`, `components/review/ReviewTab.tsx:273` | `focuses an existing review window after the panel remounts` |
| 2: exact Markdown source saves | `server.ts:591` | `saves exact UTF-8 to the original host and path and refreshes revisions` |
| 3: conflicting writes and retained drafts | `server.ts:605`, `components/review/ReviewTab.tsx:313` | `rejects stale saves without overwriting a concurrent update`; `does not let an earlier save clear a newer draft after remount` |
| 4: saved acknowledgement and refresh | `server.ts:611` | `reports a committed save if realtime publication fails`; `reports a successful save even when preview generation is unavailable` |
| 5: runtime disablement and read-only formats | `server.ts:593` | `rejects HTML, ended sessions, and disabled editing`; `disables subsequent saves without reloading the plugin` |
| 6: repository gates | `package.json` check script | `npm run check` |

The isolated browser harness is an additional UI check. It replaces the SDK
transport with a fixture, so it does not certify production routing, file I/O,
or native desktop windows. Production acceptance and release metrics remain
open until an authorized live rollout.
