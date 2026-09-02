# Noted

Noted is a [bb](https://getbb.app) plugin for reviewing agent-made HTML artifacts inside the thread side panel. Select an element or a text range, queue feedback, and send the batch to a bb thread.

Noted is built on [Lavish](https://github.com/kunchenguid/lavish-axi) by Kun Chen. It vendors Lavish's in-artifact annotation SDK unchanged and connects the review loop to bb threads.

## Status

v0.1 supports:

- HTML artifact review in the bb side panel.
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
bb noted open packet.html --view parent
bb noted reply "Applied the three changes."
bb noted status
bb noted file plan.html --to <vault-folder> --title "Plan A" --summary "..."
```

Feedback arrives in the selected thread as a message that starts with `Noted: feedback on ...`.

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
