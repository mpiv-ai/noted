import { extname, posix } from "node:path";

const DIFF_EXTENSIONS = new Set([".diff", ".patch"]);

export type DiffLineKind = "context" | "add" | "delete";

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
  noNewlineAtEnd: boolean;
};

export type DiffHunk = {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
};

export type DiffFileStatus = "added" | "deleted" | "renamed" | "copied" | "modified";

export type DiffFile = {
  oldPath: string | null;
  newPath: string | null;
  status: DiffFileStatus;
  binary: boolean;
  headers: string[];
  hunks: DiffHunk[];
  preamble: string[];
};

export type ParsedDiff = {
  files: DiffFile[];
  trailing: string[];
};

export type DiffTarget = {
  fileIndex: number;
  path: string;
  kind: "file" | "hunk" | DiffLineKind;
  oldLine: number | null;
  newLine: number | null;
  hunk: number | null;
};

export function isDiffPath(path: string): boolean {
  return DIFF_EXTENSIONS.has(extname(path).toLowerCase());
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
const C_ESCAPES: Record<string, string> = { n: "\n", t: "\t", '"': '"', "\\": "\\", a: "\x07", b: "\b", f: "\f", r: "\r", v: "\v" };

function unquote(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"') || value.length < 2) return value;
  const bytes: number[] = [];
  const body = value.slice(1, -1);
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== "\\") {
      bytes.push(...Buffer.from(char, "utf8"));
      continue;
    }
    const octal = body.slice(index + 1, index + 4);
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(Number.parseInt(octal, 8));
      index += 3;
      continue;
    }
    const next = body[index + 1] ?? "";
    bytes.push(...Buffer.from(C_ESCAPES[next] ?? next, "utf8"));
    index += 1;
  }
  return Buffer.from(bytes).toString("utf8");
}

function headerPath(raw: string, prefix: string): string | null {
  const withoutTimestamp = raw.startsWith('"') ? raw : raw.split("\t")[0];
  const path = unquote(withoutTimestamp.trim());
  if (path === "/dev/null") return null;
  return prefix !== "" && path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

type GitHeader = { oldPath: string; newPath: string; oldPrefix: string; newPrefix: string };

function splitPrefixes(left: string, right: string): GitHeader {
  const oldPrefix = /^[a-z]\//.exec(left)?.[0] ?? "";
  const newPrefix = /^[a-z]\//.exec(right)?.[0] ?? "";
  if (oldPrefix === "" || newPrefix === "" || oldPrefix === newPrefix) {
    return { oldPath: left, newPath: right, oldPrefix: "", newPrefix: "" };
  }
  return { oldPath: left.slice(2), newPath: right.slice(2), oldPrefix, newPrefix };
}

function gitHeaderPaths(rest: string): GitHeader | null {
  const quoted = rest.match(/^("(?:[^"\\]|\\.)*"|\S+) ("(?:[^"\\]|\\.)*"|\S+)$/);
  if (quoted && (quoted[1].startsWith('"') || quoted[2].startsWith('"'))) {
    return splitPrefixes(unquote(quoted[1]), unquote(quoted[2]));
  }
  const half = (rest.length - 1) / 2;
  if (Number.isInteger(half) && rest[half] === " ") {
    const header = splitPrefixes(rest.slice(0, half), rest.slice(half + 1));
    if (header.oldPath === header.newPath) return header;
  }
  const split = rest.indexOf(" b/");
  if (split < 0 || !rest.startsWith("a/")) return null;
  return { oldPath: rest.slice(2, split), newPath: rest.slice(split + 3), oldPrefix: "a/", newPrefix: "b/" };
}

function trimBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end);
}

function finalizeStatus(file: DiffFile): void {
  if (file.status === "renamed" || file.status === "copied") return;
  if (file.oldPath === null && file.newPath !== null) file.status = "added";
  else if (file.newPath === null && file.oldPath !== null) file.status = "deleted";
}

type ParseState = {
  files: DiffFile[];
  notes: string[];
  file: DiffFile | null;
  prefixes: { old: string; new: string } | null;
  hunk: DiffHunk | null;
  oldLine: number;
  newLine: number;
  oldRemaining: number;
  newRemaining: number;
  skippingBinary: boolean;
};

function startFile(state: ParseState, prefixes: ParseState["prefixes"]): DiffFile {
  if (state.file !== null) finalizeStatus(state.file);
  const file: DiffFile = {
    oldPath: null,
    newPath: null,
    status: "modified",
    binary: false,
    headers: [],
    hunks: [],
    preamble: trimBlank(state.notes),
  };
  state.files.push(file);
  state.notes = [];
  state.file = file;
  state.prefixes = prefixes;
  state.hunk = null;
  state.skippingBinary = false;
  return file;
}

function consumeHunkLine(state: ParseState, hunk: DiffHunk, line: string): boolean {
  const marker = line[0];
  if (marker === "+" && state.newRemaining > 0) {
    hunk.lines.push({ kind: "add", text: line.slice(1), oldLine: null, newLine: state.newLine, noNewlineAtEnd: false });
    state.newLine += 1;
    state.newRemaining -= 1;
    return true;
  }
  if (marker === "-" && state.oldRemaining > 0) {
    hunk.lines.push({ kind: "delete", text: line.slice(1), oldLine: state.oldLine, newLine: null, noNewlineAtEnd: false });
    state.oldLine += 1;
    state.oldRemaining -= 1;
    return true;
  }
  if ((marker === " " || line === "") && state.oldRemaining > 0 && state.newRemaining > 0) {
    hunk.lines.push({ kind: "context", text: line.slice(1), oldLine: state.oldLine, newLine: state.newLine, noNewlineAtEnd: false });
    state.oldLine += 1;
    state.newLine += 1;
    state.oldRemaining -= 1;
    state.newRemaining -= 1;
    return true;
  }
  if (marker !== "\\") {
    state.oldRemaining = 0;
    state.newRemaining = 0;
  }
  return false;
}

function consumeExtendedHeader(file: DiffFile, line: string, state: ParseState): boolean {
  if (line === "GIT binary patch") {
    file.binary = true;
    state.skippingBinary = true;
    return true;
  }
  const copyOrRename = /^(rename|copy) (from|to) (.+)$/.exec(line);
  if (copyOrRename !== null) {
    file.status = copyOrRename[1] === "rename" ? "renamed" : "copied";
    const path = unquote(copyOrRename[3]);
    if (copyOrRename[2] === "from") file.oldPath = path;
    else file.newPath = path;
  } else if (line.startsWith("new file mode")) {
    file.oldPath = null;
    file.status = "added";
  } else if (line.startsWith("deleted file mode")) {
    file.newPath = null;
    file.status = "deleted";
  } else if (!/^(index |old mode |new mode |similarity index |dissimilarity index )/.test(line)) {
    return false;
  }
  file.headers.push(line);
  return true;
}

export function parseUnifiedDiff(source: string): ParsedDiff {
  const lines = source.split("\n").map((line) => line.replace(/\r$/, ""));
  const state: ParseState = {
    files: [],
    notes: [],
    file: null,
    prefixes: null,
    hunk: null,
    oldLine: 0,
    newLine: 0,
    oldRemaining: 0,
    newRemaining: 0,
    skippingBinary: false,
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inHunk = state.hunk !== null && (state.oldRemaining > 0 || state.newRemaining > 0);
    if (inHunk && state.hunk !== null && consumeHunkLine(state, state.hunk, line)) continue;

    const lastLine = state.hunk?.lines.at(-1);
    if (line.startsWith("\\") && lastLine !== undefined) {
      lastLine.noNewlineAtEnd = true;
      continue;
    }

    if (line.startsWith("diff --git ")) {
      const paths = gitHeaderPaths(line.slice("diff --git ".length));
      const file = startFile(state, { old: paths?.oldPrefix ?? "a/", new: paths?.newPrefix ?? "b/" });
      if (paths !== null) {
        file.oldPath = paths.oldPath;
        file.newPath = paths.newPath;
      }
      continue;
    }

    if (state.skippingBinary) continue;

    const headerOpen = state.file !== null && state.file.hunks.length === 0 && !state.file.binary;
    const next = lines[index + 1];
    if (line.startsWith("--- ") && next?.startsWith("+++ ")) {
      const reuse = headerOpen && state.file !== null
        && (state.prefixes !== null || (state.file.oldPath === null && state.file.newPath === null));
      const file = reuse && state.file !== null ? state.file : startFile(state, null);
      const plainPrefixed = /^"?a\//.test(line.slice(4)) && /^"?b\//.test(next.slice(4));
      const prefixes = state.prefixes ?? (plainPrefixed ? { old: "a/", new: "b/" } : { old: "", new: "" });
      file.oldPath = headerPath(line.slice(4), prefixes.old);
      file.newPath = headerPath(next.slice(4), prefixes.new);
      index += 1;
      continue;
    }

    const hunkMatch = HUNK_HEADER.exec(line);
    if (hunkMatch !== null) {
      const file = state.file ?? startFile(state, null);
      const hunk: DiffHunk = { header: line, oldStart: Number(hunkMatch[1]), newStart: Number(hunkMatch[3]), lines: [] };
      file.hunks.push(hunk);
      state.hunk = hunk;
      state.oldLine = hunk.oldStart;
      state.newLine = hunk.newStart;
      state.oldRemaining = hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2]);
      state.newRemaining = hunkMatch[4] === undefined ? 1 : Number(hunkMatch[4]);
      continue;
    }

    const binary = /^Binary files (.+) and (.+) differ$/.exec(line);
    if (binary !== null) {
      const file = headerOpen && state.file !== null ? state.file : startFile(state, null);
      if (file.oldPath === null && file.newPath === null) {
        file.oldPath = headerPath(binary[1], "a/");
        file.newPath = headerPath(binary[2], "b/");
      }
      file.binary = true;
      continue;
    }

    if (headerOpen && state.file !== null && consumeExtendedHeader(state.file, line, state)) continue;

    state.notes.push(line);
  }

  if (state.file !== null) finalizeStatus(state.file);
  const trailing = trimBlank(state.notes);
  const signature = trailing.indexOf("-- ");
  return { files: state.files, trailing: signature >= 0 ? trimBlank(trailing.slice(0, signature)) : trailing };
}

export function diffFileDisplayPath(file: DiffFile): string {
  return file.newPath ?? file.oldPath ?? "(unknown file)";
}

function hexPath(path: string): string {
  return Buffer.from(path, "utf8").toString("hex");
}

function fileId(index: number, path: string): string {
  return `nd-${index}-${hexPath(path)}`;
}

function lineId(index: number, file: DiffFile, line: DiffLine): string {
  const path = line.kind === "delete" ? (file.oldPath ?? diffFileDisplayPath(file)) : diffFileDisplayPath(file);
  const suffix = line.kind === "add"
    ? `R${line.newLine}`
    : line.kind === "delete"
      ? `L${line.oldLine}`
      : `L${line.oldLine}R${line.newLine}`;
  return `${fileId(index, path)}-${suffix}`;
}

const TARGET_ID = /#nd-(\d+)-((?:[0-9a-f]{2})+)(?:-(?:H(\d+)|L(\d+)R(\d+)|L(\d+)|R(\d+)))?(?![\w-])/;

export function diffTargetFromSelector(selector: string): DiffTarget | null {
  const match = TARGET_ID.exec(selector);
  if (match === null) return null;
  const [, fileIndex, hex, hunk, contextOld, contextNew, deleted, added] = match;
  const path = Buffer.from(hex, "hex").toString("utf8");
  const target: DiffTarget = { fileIndex: Number(fileIndex), path, kind: "file", oldLine: null, newLine: null, hunk: null };
  if (hunk !== undefined) return { ...target, kind: "hunk", hunk: Number(hunk) + 1 };
  if (contextOld !== undefined) return { ...target, kind: "context", oldLine: Number(contextOld), newLine: Number(contextNew) };
  if (deleted !== undefined) return { ...target, kind: "delete", oldLine: Number(deleted) };
  if (added !== undefined) return { ...target, kind: "add", newLine: Number(added) };
  return target;
}

export function describeDiffTarget(target: DiffTarget): string {
  const path = `\`${target.path}\``;
  if (target.kind === "add") return `${path} line ${target.newLine}, new side (added)`;
  if (target.kind === "delete") return `${path} line ${target.oldLine}, old side (removed)`;
  if (target.kind === "context") return `${path} line ${target.newLine}, new side (context; old line ${target.oldLine})`;
  if (target.kind === "hunk") return `${path} hunk ${target.hunk}`;
  return `${path} (file)`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

function fileStats(file: DiffFile): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "add") additions += 1;
      if (line.kind === "delete") deletions += 1;
    }
  }
  return { additions, deletions };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function renderNote(lines: string[], id: string): string {
  if (lines.length === 0) return "";
  return `<pre class="nd-note" id="${id}">${escapeHtml(lines.join("\n"))}</pre>`;
}

function renderLine(fileIndex: number, file: DiffFile, line: DiffLine): string {
  const marker = line.kind === "add" ? "+" : line.kind === "delete" ? "-" : " ";
  const attributes = [
    `class="nd-line nd-${line.kind}"`,
    `id="${lineId(fileIndex, file, line)}"`,
    `data-kind="${line.kind}"`,
    line.oldLine === null ? "" : `data-old-line="${line.oldLine}"`,
    line.newLine === null ? "" : `data-new-line="${line.newLine}"`,
  ].filter(Boolean).join(" ");
  const row = `<tr ${attributes}>`
    + `<td class="nd-num" data-ln="${line.oldLine ?? ""}"></td>`
    + `<td class="nd-num" data-ln="${line.newLine ?? ""}"></td>`
    + `<td class="nd-code" data-marker="${marker}">${escapeHtml(line.text)}</td></tr>`;
  if (!line.noNewlineAtEnd) return row;
  return `${row}<tr class="nd-eof"><td class="nd-num"></td><td class="nd-num"></td><td class="nd-code">No newline at end of file</td></tr>`;
}

function renderFile(file: DiffFile, index: number): string {
  const path = diffFileDisplayPath(file);
  const id = fileId(index, path);
  const { additions, deletions } = fileStats(file);
  const title = file.status === "renamed" || file.status === "copied"
    ? `${escapeHtml(file.oldPath ?? "")} → ${escapeHtml(file.newPath ?? "")}`
    : escapeHtml(path);
  const stat = file.binary
    ? `<span class="nd-stat">binary</span>`
    : `<span class="nd-stat"><span class="nd-plus">+${additions}</span> <span class="nd-minus">−${deletions}</span></span>`;
  const body: string[] = [];
  if (file.binary) body.push(`<p class="nd-message">Binary file not shown.</p>`);
  else if (file.hunks.length === 0) body.push(`<p class="nd-message">No content changes.</p>`);
  if (file.hunks.length > 0) {
    body.push("<table><tbody>");
    file.hunks.forEach((hunk, hunkIndex) => {
      body.push(`<tr class="nd-hunk" id="${id}-H${hunkIndex}" data-old-start="${hunk.oldStart}" data-new-start="${hunk.newStart}"><td class="nd-num"></td><td class="nd-num"></td><td class="nd-code">${escapeHtml(hunk.header)}</td></tr>`);
      for (const line of hunk.lines) body.push(renderLine(index, file, line));
    });
    body.push("</tbody></table>");
  }
  const oldPathAttribute = file.oldPath === null ? "" : ` data-old-path="${escapeHtml(file.oldPath)}"`;
  const newPathAttribute = file.newPath === null ? "" : ` data-new-path="${escapeHtml(file.newPath)}"`;
  return `${renderNote(file.preamble, `nd-note-${index}`)}<section class="nd-file nd-${file.status}" id="${id}" data-path="${escapeHtml(path)}"${oldPathAttribute}${newPathAttribute} data-status="${file.status}">`
    + `<h2><span class="nd-status">${file.status}</span> <code>${title}</code> ${stat}</h2>`
    + `${body.join("")}</section>`;
}

const DIFF_STYLES = `
:root {
  color-scheme: light dark;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.5;
  --nd-border: #d0d7de; --nd-muted: #57606a; --nd-panel: #f6f8fa;
  --nd-add: #dafbe1; --nd-add-num: #ccffd8; --nd-del: #ffebe9; --nd-del-num: #ffd7d5; --nd-hunk: #ddf4ff;
}
body { margin: 0; color: #24292f; background: #ffffff; }
main { box-sizing: border-box; padding: 1.25rem clamp(0.75rem, 3vw, 2rem) 3rem; }
header h1 { margin: 0 0 0.25rem; font-size: 1.25rem; }
header p { margin: 0 0 1rem; color: var(--nd-muted); }
header ol { margin: 0 0 1.25rem; padding-left: 1.25rem; font-size: 0.875rem; }
a { color: #0969da; }
code, pre, td.nd-code { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.8125rem; }
.nd-note { margin: 0 0 1rem; padding: 0.75rem 1rem; white-space: pre-wrap; border: 1px solid var(--nd-border); border-radius: 0.5rem; background: var(--nd-panel); }
.nd-file { margin: 0 0 1.25rem; border: 1px solid var(--nd-border); border-radius: 0.5rem; overflow-x: auto; }
.nd-file h2 { position: sticky; left: 0; display: flex; gap: 0.5rem; align-items: baseline; margin: 0; padding: 0.5rem 0.75rem; font-size: 0.875rem; font-weight: 600; background: var(--nd-panel); border-bottom: 1px solid var(--nd-border); }
.nd-file h2 code { overflow-wrap: anywhere; }
.nd-status { padding: 0 0.4rem; border: 1px solid var(--nd-border); border-radius: 1rem; font-size: 0.75rem; font-weight: 500; color: var(--nd-muted); text-transform: capitalize; }
.nd-stat { margin-left: auto; font-size: 0.75rem; white-space: nowrap; }
.nd-plus { color: #1a7f37; } .nd-minus { color: #cf222e; }
.nd-message { margin: 0; padding: 0.75rem; color: var(--nd-muted); font-style: italic; }
table { width: 100%; border-collapse: collapse; }
td { padding: 0 0.5rem; vertical-align: top; }
td.nd-num { width: 1%; min-width: 2.5rem; color: var(--nd-muted); text-align: right; user-select: none; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.75rem; }
td.nd-num::before { content: attr(data-ln); }
td.nd-code { white-space: pre; }
td.nd-code[data-marker]::before { content: attr(data-marker); display: inline-block; width: 1.25em; color: var(--nd-muted); user-select: none; }
tr.nd-add { background: var(--nd-add); } tr.nd-add td.nd-num { background: var(--nd-add-num); }
tr.nd-delete { background: var(--nd-del); } tr.nd-delete td.nd-num { background: var(--nd-del-num); }
tr.nd-hunk td { padding-top: 0.2rem; padding-bottom: 0.2rem; color: var(--nd-muted); background: var(--nd-hunk); }
tr.nd-eof td.nd-code { color: var(--nd-muted); font-style: italic; }
@media (prefers-color-scheme: dark) {
  :root { --nd-border: #30363d; --nd-muted: #8b949e; --nd-panel: #161b22; --nd-add: #12261e; --nd-add-num: #1b4721; --nd-del: #25171c; --nd-del-num: #542426; --nd-hunk: #121d2f; }
  body { color: #e6edf3; background: #0d1117; }
  a { color: #58a6ff; }
  .nd-plus { color: #3fb950; } .nd-minus { color: #f85149; }
}
`;

export function diffDocumentHtml(path: string, source: string): string {
  const parsed = parseUnifiedDiff(source);
  const totals = parsed.files.reduce((sum, file) => {
    const stats = fileStats(file);
    return { additions: sum.additions + stats.additions, deletions: sum.deletions + stats.deletions };
  }, { additions: 0, deletions: 0 });
  const title = escapeHtml(posix.basename(path.replaceAll("\\", "/")));
  const summary = parsed.files.length === 0
    ? "No file changes found."
    : `${plural(parsed.files.length, "file")} changed, ${plural(totals.additions, "addition")}, ${plural(totals.deletions, "deletion")}`;
  const contents = parsed.files.length > 1
    ? `<ol>${parsed.files.map((file, index) => `<li><a href="#${fileId(index, diffFileDisplayPath(file))}">${escapeHtml(diffFileDisplayPath(file))}</a></li>`).join("")}</ol>`
    : "";
  const files = parsed.files.map(renderFile).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${DIFF_STYLES}</style>
</head>
<body>
  <main data-noted-source="diff"><header><h1>${title}</h1><p>${summary}</p>${contents}</header>${files}${renderNote(parsed.trailing, "nd-note-end")}</main>
</body>
</html>`;
}
