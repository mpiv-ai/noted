/// <reference path="../vendor/lavish/index.d.ts" />

import {
  MODE_TOGGLE_HOTKEY_KEY,
  acceptedImageTypes,
  attachmentSizeError,
  classifyAttachmentBatch,
  classifyMaterialRectEscape,
  classifySevereTextOverflow,
  createArtifactSdk,
  deriveAttachmentNoticeState,
  deriveLavishQueueKey,
  findStableLayoutFindings,
  isMaterialPageOverflow,
  isModeToggleHotkeyEvent,
  isNativeInteractiveControl,
  isNearTotalOcclusion,
  isTrustedAttachmentResult,
  partitionDroppedFiles,
  planClipboardPaste,
} from "../vendor/lavish/artifact-sdk.js";
import * as mermaidNode from "../vendor/lavish/mermaid-node.js";
import * as tableCellHelpers from "../vendor/lavish/table-cell.js";

export function buildSdkScript(input: { key: string; revision: number; loadToken: string }): string {
  if (input.loadToken.length > 200) throw new Error("load token too long");

  const revision = Number.isFinite(input.revision) && input.revision >= 0 ? Math.trunc(input.revision) : 0;
  const mermaidEntries = Object.entries(mermaidNode);
  const mermaidDeclarations = mermaidEntries.map(([name, fn]) => `const ${name}=${fn.toString()};`).join("\n");
  const mermaidNames = mermaidEntries.map(([name]) => name);
  const tableEntries = Object.entries(tableCellHelpers);
  const tableDeclarations = tableEntries.map(([name, fn]) => `const ${name}=${fn.toString()};`).join("\n");
  const options = {
    maxAttachmentCount: 4,
    maxAttachmentBytes: 10_485_760,
    acceptedImageMime: ["image/png", "image/jpeg", "image/webp"],
  };

  const body = `(() => {
const key=${JSON.stringify(input.key)};
const artifactRevision=${revision};
const artifactLoadToken=${JSON.stringify(input.loadToken)};
const deriveQueueKey=${deriveLavishQueueKey.toString()};
const isNativeInteractiveControl=${isNativeInteractiveControl.toString()};
const MODE_TOGGLE_HOTKEY_KEY=${JSON.stringify(MODE_TOGGLE_HOTKEY_KEY)};
const isModeToggleHotkeyEvent=${isModeToggleHotkeyEvent.toString()};
const classifySevereTextOverflow=${classifySevereTextOverflow.toString()};
const classifyMaterialRectEscape=${classifyMaterialRectEscape.toString()};
const isMaterialPageOverflow=${isMaterialPageOverflow.toString()};
const findStableLayoutFindings=${findStableLayoutFindings.toString()};
const isNearTotalOcclusion=${isNearTotalOcclusion.toString()};
const attachmentSizeError=${attachmentSizeError.toString()};
const classifyAttachmentBatch=${classifyAttachmentBatch.toString()};
const partitionDroppedFiles=${partitionDroppedFiles.toString()};
const planClipboardPaste=${planClipboardPaste.toString()};
const acceptedImageTypes=${acceptedImageTypes.toString()};
const isTrustedAttachmentResult=${isTrustedAttachmentResult.toString()};
const deriveAttachmentNoticeState=${deriveAttachmentNoticeState.toString()};
${mermaidDeclarations}
const mermaidHelpers={ ${mermaidNames.join(", ")} };
${tableDeclarations}
(${createArtifactSdk.toString()})(deriveQueueKey, isNativeInteractiveControl, mermaidHelpers, artifactRevision, artifactLoadToken, key, ${JSON.stringify(options)});
})();`;

  return `<script>${body}</script>`;
}
