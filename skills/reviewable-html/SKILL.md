---
name: reviewable-html
description: Create or substantially revise branded, reviewable HTML artifacts in bb. Use whenever an agent will write an .html file for a user, including plans, reports, comparisons, decision memos, research syntheses, implementation proposals, status packets, diagrams, tables, and prototypes. Use this together with any matching brand or design skill; the brand skill supplies the visual system and this skill supplies the artifact and review standard. Also use when the user asks for an HTML artifact, a reviewable page, branded HTML, or something to review in Noted. Substantial visual deliverables default to HTML when no other format is required. Do not use for a trivial answer, a code-only change, or a question merely about HTML.
---

# Reviewable HTML standard

Create one durable HTML artifact that the user can inspect and annotate in
Noted. A substantial visual deliverable defaults to HTML unless the user asks
for another format or the repository defines a different canonical artifact.

## 1. Start from a brand template

Never invent a visual system from a blank page.

1. Identify the applicable organization, product, or repository brand from the
   request, project instructions, and available skill catalog.
2. If a matching brand/design skill exists, read it and its required references
   completely. Copy its closest HTML template and required assets into the
   artifact destination, then adapt it within that design system.
3. Do not silently apply one client's brand to another client's work. If more
   than one brand plausibly applies and the choice changes the result, ask.
4. If no applicable brand skill or HTML template exists, copy
   [assets/noted-review.html](assets/noted-review.html) and use its Noted house
   theme. Replace every bracketed placeholder before review.

The finished artifact must not depend on an absolute path into a skill folder.
Keep its CSS inline or beside it. BB's ordinary HTML preview may render the page
as `srcdoc`, where relative image URLs have no filesystem base. Embed small,
identity-critical images such as logos as data URLs generated from the supplied
brand assets; keep larger images, fonts, and scripts relative and local so Noted
can inline or export them.

## 2. Make the document easy to review

- Use semantic landmarks: `header`, `nav` when useful, `main`, named `section`
  elements, and `footer`.
- Give every section and important decision, table, or card a short, stable,
  descriptive `id`. Preserve those IDs across revisions so feedback remains
  intelligible.
- Use real text rather than drawing copy into canvas or images. Use an HTML
  table for tabular comparison and SVG or Mermaid only when a diagram materially
  improves understanding.
- Lead with the outcome, recommendation, or status. Put evidence, alternatives,
  risks, and open questions in distinct sections.
- Make the page responsive, keyboard-readable, and usable at 200% zoom. Keep
  body text at least 15px, visible focus styles, sufficient contrast, and a
  logical heading order.
- Avoid decorative controls. If the artifact is interactive, controls must work
  without sending data or mutating external systems unless the user explicitly
  requested that behavior.

## 3. Verify before opening

1. Check that the artifact contains no unresolved placeholders, secrets, or
   unsupported factual claims.
2. Open it locally or render and inspect it when tooling permits. Also render it
   without a base URL (the equivalent of iframe `srcdoc`) when it contains local
   assets. Check desktop and narrow layouts, overflow, missing assets, and basic
   interaction.
3. Run any repository checks that cover the artifact.
4. Apply the active brand skill's delivery checklist. When using the fallback,
   use [references/fallback-checklist.md](references/fallback-checklist.md).

## 4. Review in Noted

Use the `noted` skill for the session lifecycle.

```sh
bb noted open <artifact.html>
```

For a substantial deliverable in an interactive bb thread, open it for review
by default. Do not open it when the user says not to or when the artifact is only
an intermediate input to another task. When a parent or designated review thread
should see it, pass `--view parent` or the specific thread. End the turn after
opening it; do not poll. Apply incoming targeted feedback to the same file so
the open panel advances through revisions.

## Done

The artifact is complete when it is on-brand, self-contained enough to preview
and export, structurally easy to annotate, and visually checked. When review is
part of the task, it must also be open in the correct Noted thread.
Knowledge-base filing is a separate explicit step.
