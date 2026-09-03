export type AssetReader = (
  relativePath: string,
) => Promise<{ bytes: Uint8Array; mime: string } | null>;

export type TransformReviewOptions = {
  sdkScript: string;
  readAsset: AssetReader;
  previewBaseUrl: string | null;
  maxAssetBytes?: number;
  maxDocBytes?: number;
};

export type TransformReviewResult = {
  srcdoc: string;
  inlined: string[];
  linked: string[];
  skipped: { path: string; reason: string }[];
};

type TransformOptions = {
  readAsset: AssetReader;
  previewBaseUrl: string | null;
  sdkScript: string;
  maxAssetBytes?: number;
  maxDocBytes?: number;
};

type TransformResult = {
  html: string;
  inlined: string[];
  linked: string[];
  skipped: { path: string; reason: string }[];
};

const DEFAULT_MAX_ASSET_BYTES = 10_485_760;
const DEFAULT_MAX_DOC_BYTES = 26_214_400;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

async function replaceMatches(
  input: string,
  pattern: RegExp,
  replacement: (match: RegExpExecArray) => Promise<string>,
): Promise<string> {
  let output = "";
  let offset = 0;
  pattern.lastIndex = 0;

  for (let match = pattern.exec(input); match; match = pattern.exec(input)) {
    output += input.slice(offset, match.index);
    output += await replacement(match);
    offset = pattern.lastIndex;
  }

  return output + input.slice(offset);
}

async function transform(html: string, opts: TransformOptions): Promise<TransformResult> {
  const maxAssetBytes = opts.maxAssetBytes ?? DEFAULT_MAX_ASSET_BYTES;
  const maxDocBytes = opts.maxDocBytes ?? DEFAULT_MAX_DOC_BYTES;
  const inlined: string[] = [];
  const linked: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const decoder = new TextDecoder();

  const load = async (path: string) => {
    if (URL_SCHEME.test(path) || path.startsWith("/")) return null;

    const asset = await opts.readAsset(path);
    if (!asset) {
      skipped.push({ path, reason: "missing" });
      return null;
    }
    if (asset.bytes.length > maxAssetBytes) {
      if (opts.previewBaseUrl !== null) linked.push(path);
      else skipped.push({ path, reason: "over-cap" });
      return null;
    }

    inlined.push(path);
    return asset;
  };

  let result = await replaceMatches(
    html,
    /<link\b(?=[^>]*\brel\s*=\s*(["'])stylesheet\1)[^>]*\bhref\s*=\s*(["'])([^"']+)\2[^>]*>/gi,
    async (match) => {
      const path = match[3];
      const asset = await load(path);
      return asset ? `<style data-noted-inlined="${path}">${decoder.decode(asset.bytes)}</style>` : match[0];
    },
  );

  result = await replaceMatches(result, /<img\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi, async (match) => {
    const path = match[2];
    const asset = await load(path);
    if (!asset) return match[0];

    const dataUrl = `data:${asset.mime};base64,${Buffer.from(asset.bytes).toString("base64")}`;
    return match[0].replace(/(\bsrc\s*=\s*["'])[^"']*(["'])/i, (_value, before: string, after: string) => {
      return `${before}${dataUrl}${after}`;
    });
  });

  result = await replaceMatches(
    result,
    /<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>[\s\S]*?<\/script\s*>/gi,
    async (match) => {
      const path = match[2];
      const asset = await load(path);
      return asset ? `<script data-noted-inlined="${path}">${decoder.decode(asset.bytes)}</script>` : match[0];
    },
  );

  if (linked.length > 0 && opts.previewBaseUrl !== null) {
    const base = `<base href="${opts.previewBaseUrl}/">`;
    if (!/<base\b[^>]*>/i.test(result)) {
      result = /<head\b[^>]*>/i.test(result) ? result.replace(/<head\b[^>]*>/i, (head) => `${head}${base}`) : base + result;
    }
  }

  if (opts.sdkScript) {
    const bodyPattern = /<\/body\s*>/gi;
    let lastBody: RegExpExecArray | null = null;
    for (let match = bodyPattern.exec(result); match; match = bodyPattern.exec(result)) lastBody = match;
    result = lastBody
      ? result.slice(0, lastBody.index) + opts.sdkScript + result.slice(lastBody.index)
      : result + opts.sdkScript;
  }

  if (new TextEncoder().encode(result).length > maxDocBytes) throw new Error("document too large");

  return { html: result, inlined, linked, skipped };
}

export async function transformForReview(
  html: string,
  opts: TransformReviewOptions,
): Promise<TransformReviewResult> {
  const result = await transform(html, opts);
  return { srcdoc: result.html, inlined: result.inlined, linked: result.linked, skipped: result.skipped };
}

export async function transformForExport(
  html: string,
  opts: { readAsset: AssetReader; maxAssetBytes?: number; maxDocBytes?: number },
): Promise<{ html: string; inlined: string[]; skipped: { path: string; reason: string }[] }> {
  const result = await transform(html, { ...opts, previewBaseUrl: null, sdkScript: "" });
  return { html: result.html, inlined: result.inlined, skipped: result.skipped };
}
