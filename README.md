# Noted

Noted is a [bb](https://getbb.app) plugin for reviewing HTML and Markdown artifacts inside the thread side panel. Select an element or a text range, queue feedback, and send the batch to a bb thread.

Noted is built on [Lavish](https://github.com/kunchenguid/lavish-axi) by Kun Chen. It vendors Lavish's in-artifact annotation SDK unchanged and connects the review loop to bb threads.

## Status

v0.1 supports:

- HTML and rendered Markdown review in the bb side panel.
- Element and text-range annotations.
- Queue and steer feedback delivery.
- Revision capture after agent turns.
- The `bb noted` CLI, including knowledge-base export.

The review loop works in the macOS bb app when it connects to a remote server and in a browser through bb Connect.

## Requirements

- bb 0.40 or later.

## Install

```sh
bb plugin install git:github.com/mpiv-ai/noted@^0.1.1
```

To install from a checkout:

```sh
git clone https://github.com/mpiv-ai/noted.git
cd noted
npm ci
bb plugin install .
```

## Use

Run these commands from an agent thread:

```sh
bb noted open plan.html
bb noted open notes.md
bb noted open packet.html --view parent
bb noted reply "Applied the three changes."
bb noted status
bb noted file plan.html --to <vault-folder> --title "Plan A" --summary "..."
```

Feedback arrives in the selected thread as a message that starts with `Noted: feedback on ...`.

Noted registers as a file opener for `.html`, `.htm`, `.md`, and `.markdown`.
Opening one of those files normally keeps BB's rendered preview visible with a
**Review with Noted** button above it. As with every BB file opener, a user can
pin BB Preview or another installed opener for an extension in Settings.

## Agent skills

Installing Noted contributes two skills to new bb agent sessions:

- `reviewable-html` makes a branded, annotation-friendly HTML page the default
  for substantial visual plans, reports, comparisons, and decision artifacts.
  It starts from the applicable brand skill's template, with a bundled Noted
  house template as the fallback.
- `noted` covers the complete review lifecycle: opening and routing sessions,
  applying targeted feedback, replying, checking status, ending or reopening a
  review, and filing a finished artifact to a knowledge base.

Skills are discovered when a new agent session starts. Existing sessions do not
receive skill changes mid-session.

## Trust and data

BB plugins run with full trust. Noted reads only artifacts and assets that you open. It stores sessions, revisions, and feedback in BB-managed SQLite. The `bb noted file --to` command writes exports only to the destination that you provide. Noted sends feedback to the BB thread that you select and adds no independent telemetry.

Review the [security policy](SECURITY.md) before reporting a vulnerability.

## Develop

```sh
npm ci
npm run check
bb plugin dev .
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution requirements.

## Roadmap

Whiteboard review is planned for v0.2.

## License

Noted is licensed under the MIT License. See [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [CHANGELOG.md](CHANGELOG.md).
