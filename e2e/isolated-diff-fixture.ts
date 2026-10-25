import { transformForReview } from "../lib/html-transform";
import { buildFeedbackMessage } from "../lib/message";
import { buildSdkScript } from "../lib/sdk-script";
import { sourceDocumentHtml } from "../lib/source-document";

/** Renders a diff through the same source and SDK injection path the server uses. */
export async function diffReviewDocument(path: string, source: string, sessionId: string, loadToken: string) {
  return transformForReview(sourceDocumentHtml(path, source), {
    sdkScript: buildSdkScript({ key: sessionId, revision: 1, loadToken }),
    previewBaseUrl: null,
    readAsset: async () => null,
  });
}

export { buildFeedbackMessage };
