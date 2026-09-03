import { extname, posix } from "node:path";
import GithubSlugger from "github-slugger";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

const MARKDOWN_STYLES = `
:root {
  color-scheme: light dark;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.6;
}
body {
  margin: 0;
  color: #24292f;
  background: #ffffff;
}
main {
  box-sizing: border-box;
  width: min(100%, 52rem);
  margin: 0 auto;
  padding: 2rem clamp(1rem, 4vw, 3rem) 4rem;
}
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.5em 0 0.6em; }
h1, h2 { padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de; }
p, ul, ol, blockquote, pre, table { margin: 0 0 1rem; }
a { color: #0969da; }
blockquote { margin-left: 0; padding-left: 1rem; color: #57606a; border-left: 0.25rem solid #d0d7de; }
code { padding: 0.15em 0.35em; border-radius: 0.3rem; background: #f6f8fa; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
pre { overflow: auto; padding: 1rem; border-radius: 0.5rem; background: #f6f8fa; }
pre code { padding: 0; background: transparent; }
table { display: block; max-width: 100%; overflow: auto; border-collapse: collapse; }
th, td { padding: 0.45rem 0.75rem; border: 1px solid #d0d7de; text-align: left; }
img { max-width: 100%; height: auto; }
hr { height: 1px; margin: 1.5rem 0; border: 0; background: #d0d7de; }
@media (prefers-color-scheme: dark) {
  body { color: #e6edf3; background: #0d1117; }
  h1, h2, th, td { border-color: #30363d; }
  a { color: #58a6ff; }
  blockquote { color: #8b949e; border-color: #30363d; }
  code, pre { background: #161b22; }
  hr { background: #30363d; }
}
`;

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSIONS.has(extname(path).toLowerCase());
}

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

type SourceDocumentOptions = {
  previewBaseUrl?: string | null;
  sourceDirectory?: string;
};

function resolveReviewHref(href: string, options: SourceDocumentOptions): string | null {
  const base = options.previewBaseUrl?.replace(/\/+$/, "");
  if (
    !base
    || href === ""
    || href.startsWith("#")
    || href.startsWith("?")
    || href.startsWith("/")
    || href.startsWith("//")
    || URL_SCHEME.test(href)
  ) {
    return href;
  }

  const suffixIndex = [href.indexOf("?"), href.indexOf("#")]
    .filter((index) => index >= 0)
    .reduce((lowest, index) => Math.min(lowest, index), href.length);
  const suffix = href.slice(suffixIndex);
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(href.slice(0, suffixIndex)).replaceAll("\\", "/");
  } catch {
    return null;
  }
  if (decodedPath.startsWith("/")) {
    return null;
  }

  const resolvedPath = posix.normalize(posix.join(options.sourceDirectory ?? "", decodedPath));
  if (
    resolvedPath === ".."
    || resolvedPath.startsWith("../")
    || posix.isAbsolute(resolvedPath)
  ) {
    return null;
  }
  const encodedPath = resolvedPath.split("/").map(encodeURIComponent).join("/");
  return `${base}/${encodedPath}${suffix}`;
}

export function sourceDocumentHtml(
  path: string,
  source: string,
  options: SourceDocumentOptions = {},
): string {
  if (!isMarkdownPath(path)) {
    return source;
  }

  const slugger = new GithubSlugger();
  const renderer = new marked.Renderer();
  renderer.heading = function ({ depth, text, tokens }) {
    const content = this.parser.parseInline(tokens);
    const plainText = this.parser.parseInline(tokens, this.parser.textRenderer);
    return `<h${depth} id="${slugger.slug(plainText || text)}">${content}</h${depth}>`;
  };
  const rendered = marked.parse(source, {
    async: false,
    gfm: true,
    renderer,
  });
  const body = sanitizeHtml(rendered, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "details",
      "img",
      "input",
      "summary",
    ]),
    allowedAttributes: {
      "*": ["class", "id", "title"],
      a: ["href", "name", "rel", "target"],
      img: ["alt", "height", "loading", "src", "srcset", "width"],
      input: ["checked", "disabled", "type"],
      ol: ["start"],
      td: ["align"],
      th: ["align"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["data", "http", "https"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attributes) => {
        if (attributes.href === undefined) {
          return { tagName: "a", attribs: attributes };
        }
        const { href: _href, ...otherAttributes } = attributes;
        const href = resolveReviewHref(attributes.href, options);
        return {
          tagName: "a",
          attribs: href === null ? otherAttributes : { ...otherAttributes, href },
        };
      },
    },
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${MARKDOWN_STYLES}</style>
</head>
<body>
  <main data-noted-source="markdown">${body}</main>
</body>
</html>`;
}
