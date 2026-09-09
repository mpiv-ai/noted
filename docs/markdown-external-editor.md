# Open Markdown in the default app

T2: Noted is used live. Markdown filenames expose BB's supported file menu in
embedded and standalone reviews. Right-click the filename, then choose
**Open in → Default App**. This respects the OS association without changing
BB preferences or naming a particular app.

## Contract

The seam is the SDK's `experimental_FileLink`, targeting the review's original
host and absolute path. HTML, disabled Markdown editing, closed reviews, and
reviews without host identity keep a plain filename. Unsaved drafts stay in
Noted; the external app receives the saved file.

BB owns target discovery, the local helper, and launch errors. Default App
requires a file on the client's machine. Remote files need a compatible remote
editor; this feature adds no downloaded copy or synchronization mechanism.

## Verification and rollback

The first five tests in `app.test.tsx` cover original host/path routing, HTML
exclusion, the existing Markdown switch, standalone draft preservation, and
missing host identity. The SDK test harness verifies file-link routing, not
the host context menu or a native launch. Live verification must select
Default App from both BB clients and observe the resulting editor.

Run `npm run check` before shipping. Disable `markdownEditing` or revert the
file-link UI, tests, and documentation to roll back. No dependency, backend API,
data migration, or BB core change is required (SLICE-2–8, REV-1–5, CPX-1–7).
Report measured launch results with delivery evidence (MET-2, AGENT-2/4/7).
