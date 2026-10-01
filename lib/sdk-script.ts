import { LAVISH_SDK_SOURCE } from "./lavish-sdk.generated";

export function buildSdkScript(input: { key: string; revision: number; loadToken: string }): string {
  if (input.loadToken.length > 200) throw new Error("load token too long");

  const revision = Number.isFinite(input.revision) && input.revision >= 0 ? Math.trunc(input.revision) : 0;
  const options = {
    maxAttachmentCount: 4,
    maxAttachmentBytes: 10_485_760,
    acceptedImageMime: ["image/png", "image/jpeg", "image/webp"],
  };

  const body = `(() => {
const key=${JSON.stringify(input.key)};
const artifactRevision=${revision};
const artifactLoadToken=${JSON.stringify(input.loadToken)};
const sdkOptions=${JSON.stringify(options)};
${LAVISH_SDK_SOURCE}
})();`;

  return `<script>${body}</script>`;
}
