# Noted BB plugin

## Working agreement

Complete the requested work through verification. Make reasonable local decisions and ask only when a missing answer changes the outcome; continue independent work while waiting. Preserve user edits and carry outstanding requests across interruptions.

Use the tools and model actually available in this session. Skills supply task guidance within the user's scope and existing authorization. Keep simple work local. When delegation is authorized and useful, give workers bounded ownership, keep at most three active across the whole task, and inspect and integrate their results.

Run checks relevant to the change plus required repository gates. Broaden testing only for new changes, failures, or unresolved risk. Report the result, evidence, and actual limits in concise plain prose. Commits, pushes, publishing, messages, credential changes, and destructive actions need authorization covering the action; do not request it again when already given. Do not add agent or model attribution.

## Repository context

`server.ts` owns backend behavior, `app.tsx` and `components/` own the review UI, and `skills/` contains instructions delivered to agent sessions. Read `CONTRIBUTING.md` for contribution requirements. Keep the vendored Lavish SDK and its attribution intact.

Use the installed BB SDK declarations as the API contract. For plugin code, load the available `bb-plugin-authoring` skill and only relevant references. Editing review instructions must preserve user authority over cross-thread messages, ending sessions, and vault exports. Opening a review is not an approval gate for unrelated authorized work.

## Verification

Run `npm run check` for plugin code changes. Use `npm run e2e` when changes affect the review flow and a suitable test instance is available. For skill-only changes, check frontmatter, references, and the affected workflow. Installing or reloading a live plugin is separate from editing its source.
