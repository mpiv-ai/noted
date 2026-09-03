export type AssetReader = (
  relativePath: string,
) => Promise<{ bytes: Uint8Array; mime: string } | null>;

export type TransformReviewOptions = {
  sdkScript: string;
  readAsset: AssetReader;
  previewBaseUrl: string | null;
  previewRootUrl?: string | null;
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
  previewRootUrl?: string | null;
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

function localAssetReference(reference: string): { path: string; fragment: string } | null {
  if (URL_SCHEME.test(reference) || reference.startsWith("/")) return null;
  const queryIndex = reference.indexOf("?");
  const fragmentIndex = reference.indexOf("#");
  const suffixIndexes = [queryIndex, fragmentIndex].filter((index) => index >= 0);
  const pathEnd = suffixIndexes.length === 0 ? reference.length : Math.min(...suffixIndexes);
  const fragment = fragmentIndex >= 0 ? reference.slice(fragmentIndex) : "";
  try {
    return { path: decodeURIComponent(reference.slice(0, pathEnd)), fragment };
  } catch {
    return null;
  }
}

function previewAssetUrl(
  reference: string,
  previewBaseUrl: string,
  previewRootUrl: string,
): string | null {
  const syntheticOrigin = "https://noted.invalid";
  try {
    const root = new URL(`${previewRootUrl.replace(/\/+$/, "")}/`, syntheticOrigin);
    const base = new URL(`${previewBaseUrl.replace(/\/+$/, "")}/`, syntheticOrigin);
    const resolved = new URL(reference.replaceAll("\\", "/"), base);
    if (resolved.origin !== root.origin || !resolved.pathname.startsWith(root.pathname)) {
      return null;
    }
    return URL_SCHEME.test(previewRootUrl)
      ? resolved.href
      : `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

function replaceAttribute(markup: string, attribute: "href" | "src", value: string): string {
  const pattern = new RegExp(`(\\b${attribute}\\s*=\\s*["'])[^"']*(["'])`, "i");
  return markup.replace(pattern, (_match, before: string, after: string) => `${before}${value}${after}`);
}

function removeAttribute(markup: string, attribute: "href" | "src"): string {
  const pattern = new RegExp(`\\s*\\b${attribute}\\s*=\\s*(["'])[^"']*\\1`, "i");
  return markup.replace(pattern, "");
}

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

  const load = async (reference: string) => {
    const local = localAssetReference(reference);
    if (local === null) return { kind: "unchanged" } as const;

    const asset = await opts.readAsset(local.path);
    if (!asset) {
      skipped.push({ path: local.path, reason: "missing" });
      if (opts.previewBaseUrl === null) return { kind: "unchanged" } as const;
      const href = previewAssetUrl(
        reference,
        opts.previewBaseUrl,
        opts.previewRootUrl ?? opts.previewBaseUrl,
      );
      if (href === null) return { kind: "blocked" } as const;
      linked.push(local.path);
      return { kind: "linked", href } as const;
    }
    if (asset.bytes.length > maxAssetBytes) {
      if (opts.previewBaseUrl === null) {
        skipped.push({ path: local.path, reason: "over-cap" });
        return { kind: "unchanged" } as const;
      }
      const href = previewAssetUrl(
        reference,
        opts.previewBaseUrl,
        opts.previewRootUrl ?? opts.previewBaseUrl,
      );
      if (href === null) {
        skipped.push({ path: local.path, reason: "over-cap" });
        return { kind: "blocked" } as const;
      }
      linked.push(local.path);
      return { kind: "linked", href } as const;
    }

    inlined.push(local.path);
    return { kind: "inlined", ...asset, fragment: local.fragment } as const;
  };

  let result = await replaceMatches(
    html,
    /<link\b(?=[^>]*\brel\s*=\s*(["'])stylesheet\1)[^>]*\bhref\s*=\s*(["'])([^"']+)\2[^>]*>/gi,
    async (match) => {
      const path = match[3];
      const asset = await load(path);
      if (asset.kind === "inlined") {
        return `<style data-noted-inlined="${path}">${decoder.decode(asset.bytes)}</style>`;
      }
      if (asset.kind === "linked") return replaceAttribute(match[0], "href", asset.href);
      return asset.kind === "blocked" ? "" : match[0];
    },
  );

  result = await replaceMatches(result, /<img\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi, async (match) => {
    const path = match[2];
    const asset = await load(path);
    if (asset.kind === "linked") return replaceAttribute(match[0], "src", asset.href);
    if (asset.kind === "blocked") return removeAttribute(match[0], "src");
    if (asset.kind === "unchanged") return match[0];

    const dataUrl = `data:${asset.mime};base64,${Buffer.from(asset.bytes).toString("base64")}${asset.fragment}`;
    return replaceAttribute(match[0], "src", dataUrl);
  });

  result = await replaceMatches(
    result,
    /<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>[\s\S]*?<\/script\s*>/gi,
    async (match) => {
      const path = match[2];
      const asset = await load(path);
      if (asset.kind === "inlined") {
        return `<script data-noted-inlined="${path}">${decoder.decode(asset.bytes)}</script>`;
      }
      if (asset.kind === "linked") return replaceAttribute(match[0], "src", asset.href);
      return asset.kind === "blocked" ? "" : match[0];
    },
  );

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
