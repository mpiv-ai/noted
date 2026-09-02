declare module "*/vendor/lavish/artifact-sdk.js" {
  export const LAVISH_INTERNAL_QUEUE_KEY: string;
  export const MODE_TOGGLE_HOTKEY_KEY: string;
  export const isModeToggleHotkeyEvent: (...args: unknown[]) => unknown;
  export const deriveLavishQueueKey: (...args: unknown[]) => unknown;
  export const isNativeInteractiveControl: (...args: unknown[]) => unknown;
  export const classifySevereTextOverflow: (...args: unknown[]) => unknown;
  export const classifyMaterialRectEscape: (...args: unknown[]) => unknown;
  export const isMaterialPageOverflow: (...args: unknown[]) => unknown;
  export const findStableLayoutFindings: (...args: unknown[]) => unknown;
  export const isNearTotalOcclusion: (...args: unknown[]) => unknown;
  export const attachmentSizeError: (...args: unknown[]) => unknown;
  export const classifyAttachmentBatch: (...args: unknown[]) => unknown;
  export const partitionDroppedFiles: (...args: unknown[]) => unknown;
  export const acceptedImageTypes: (...args: unknown[]) => unknown;
  export const planClipboardPaste: (...args: unknown[]) => unknown;
  export const isTrustedAttachmentResult: (...args: unknown[]) => unknown;
  export const deriveAttachmentNoticeState: (...args: unknown[]) => unknown;
  export const createArtifactSdk: (...args: unknown[]) => unknown;
}

declare module "*/vendor/lavish/mermaid-node.js" {
  export const isMermaidSvg: (...args: unknown[]) => unknown;
  export const readNodeLabel: (...args: unknown[]) => unknown;
  export const mermaidNodeElement: (...args: unknown[]) => unknown;
  export const mermaidNodeFrom: (...args: unknown[]) => unknown;
  export const normalizeMermaidNodeTarget: (...args: unknown[]) => unknown;
}

declare module "*/vendor/lavish/table-cell.js" {
  export const tableTagName: (...args: unknown[]) => unknown;
  export const tableText: (...args: unknown[]) => unknown;
  export const tableRowsIn: (...args: unknown[]) => unknown;
  export const tableRowCells: (...args: unknown[]) => unknown;
  export const tableSpanValue: (...args: unknown[]) => unknown;
  export const tableColumnSpan: (...args: unknown[]) => unknown;
  export const tableCellSpansRows: (...args: unknown[]) => unknown;
  export const tableRowGroup: (...args: unknown[]) => unknown;
  export const tableRowIsShifted: (...args: unknown[]) => unknown;
  export const tableHeaderRow: (...args: unknown[]) => unknown;
  export const tableColumnLabel: (...args: unknown[]) => unknown;
  export const tableCellTarget: (...args: unknown[]) => unknown;
}
