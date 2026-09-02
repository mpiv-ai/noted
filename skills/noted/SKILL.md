---
name: noted
description: Review HTML artifacts with the user through the Noted side panel. Use when a plan, comparison, report, or prototype is clearer as a page than as prose.
---

# Noted: review artifacts with the user

Use when a plan, comparison, report, table, diagram, or prototype is clearer as a page than as prose.

1. Write the HTML file in the workspace (or `$BB_THREAD_STORAGE` for drafts). Inline styles; relative assets next to the file are fine.
2. Run `bb noted open <file>`. To show it in the thread that spawned you, add `--view parent`. Feedback always returns to you unless you pass `--reply-to`.
3. End your turn with one short line. Do not poll. Do not reopen a session the user ended.
4. Feedback arrives as a user message starting with `Noted: feedback on …`. Each numbered item names a CSS selector, the visible text, and what to change. Edit the file in place; the panel reloads when your turn ends.
5. `bb noted reply <text>` puts a short note in the review panel. `bb noted status` lists your open sessions. `bb noted end <file>` ends one. `bb noted file <file> --to <vault-folder> --title … --summary …` files a finished artifact to the KB.

Design direction: when the network allows, `npx -y lavish-axi design` and `npx -y lavish-axi playbook <id>` give current authoring guidance.
