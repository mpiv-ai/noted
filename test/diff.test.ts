import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  describeDiffTarget,
  diffDocumentHtml,
  diffTargetFromSelector,
  isDiffPath,
  parseUnifiedDiff,
  type DiffFile,
} from "../lib/diff";
import { sourceDocumentHtml } from "../lib/source-document";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string) => readFileSync(join(fixtures, name), "utf8");

const summary = (file: DiffFile) => ({
  oldPath: file.oldPath,
  newPath: file.newPath,
  status: file.status,
  binary: file.binary,
  lines: file.hunks.flatMap((hunk) => hunk.lines.map((line) =>
    `${line.kind[0]}${line.oldLine ?? ""}/${line.newLine ?? ""}${line.noNewlineAtEnd ? "$" : ""}`)),
});

// Mirrors the vendored Lavish SDK's selector(): walk up at most five levels and
// stop at the nearest ancestor with an id.
function lavishSelector(element: Element): string {
  const parts: string[] = [];
  let node: Element | null = element;
  while (node !== null && parts.length < 5) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`${part}#${node.id}`);
      break;
    }
    const parent: Element | null = node.parentElement;
    if (parent !== null) {
      const same = [...parent.children].filter((child) => child.tagName === node?.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(" > ");
}

describe("isDiffPath", () => {
  it("accepts .diff and .patch in any case", () => {
    expect(isDiffPath("/x/change.diff")).toBe(true);
    expect(isDiffPath("series/0001-fix.PATCH")).toBe(true);
    expect(isDiffPath("notes.md")).toBe(false);
  });
});

describe("parseUnifiedDiff", () => {
  it("parses a multi-file git diff with add, delete, rename, binary, and EOF markers", () => {
    const parsed = parseUnifiedDiff(fixture("multi-file.diff"));
    expect(parsed.files.map(summary)).toEqual([
      { oldPath: "a.txt", newPath: "a.txt", status: "modified", binary: false, lines: ["c1/1", "d2/", "a/2", "c3/3", "c4/4", "c5/5", "c6/6", "c7/7", "a/8$"] },
      { oldPath: null, newPath: "added.html", status: "added", binary: false, lines: ["a/1"] },
      { oldPath: "deleted.txt", newPath: null, status: "deleted", binary: false, lines: ["d1/"] },
      { oldPath: "img.bin", newPath: "img.bin", status: "modified", binary: true, lines: [] },
      { oldPath: "old-name.txt", newPath: "new name.txt", status: "renamed", binary: false, lines: ["c1/1", "c2/2", "c3/3", "d4/", "a/4"] },
    ]);
    expect(parsed.files[4].headers).toContain("similarity index 58%");
    expect(parsed.trailing).toEqual([]);
  });

  it("keeps a format-patch commit message as preamble and drops the signature", () => {
    const parsed = parseUnifiedDiff(fixture("format-patch.patch"));
    expect(parsed.files).toHaveLength(5);
    expect(parsed.files[0].preamble[0]).toMatch(/^From [0-9a-f]{40} /);
    expect(parsed.files[0].preamble).toContain("Subject: [PATCH] Second change");
    expect(parsed.trailing).toEqual([]);
  });

  it("parses plain unified diffs with timestamps, omitted counts, and CRLF", () => {
    const parsed = parseUnifiedDiff([
      "--- src/old.c\t2026-10-01 10:00:00.000000000 -0500",
      "+++ src/new.c\t2026-10-02 10:00:00.000000000 -0500",
      "@@ -3 +3 @@",
      "-int x = 1;",
      "+int x = 2;",
      "--- a/lib.c",
      "+++ b/lib.c",
      "@@ -10,2 +10,3 @@ void run()\r",
      " keep\r",
      "+added\r",
      "",
      "trailing note",
    ].join("\n"));
    expect(parsed.files.map(summary)).toEqual([
      { oldPath: "src/old.c", newPath: "src/new.c", status: "modified", binary: false, lines: ["d3/", "a/3"] },
      { oldPath: "lib.c", newPath: "lib.c", status: "modified", binary: false, lines: ["c10/10", "a/11", "c11/12"] },
    ]);
    expect(parsed.files[1].hunks[0].header).toBe("@@ -10,2 +10,3 @@ void run()");
    expect(parsed.trailing).toEqual(["trailing note"]);
  });

  it("skips GIT binary patch payloads and reads paths from header-only files", () => {
    const parsed = parseUnifiedDiff(readFileSync(join(fixtures, "binary-patch.diff"), "utf8"));
    expect(parsed.files.map(summary)).toEqual([
      { oldPath: "img.bin", newPath: "img.bin", status: "modified", binary: true, lines: [] },
      { oldPath: "script.sh", newPath: "script.sh", status: "modified", binary: false, lines: [] },
      { oldPath: "src/a.ts", newPath: "src/b.ts", status: "copied", binary: false, lines: [] },
      { oldPath: "docs/my file.md", newPath: "docs/my file.md", status: "modified", binary: false, lines: [] },
      { oldPath: "x/one.txt", newPath: "x/one.txt", status: "modified", binary: false, lines: ["c1/1", "a/2"] },
    ]);
    expect(parsed.files[1].headers).toEqual(["old mode 100644", "new mode 100755"]);
  });

  it("unquotes C-style git paths, including octal UTF-8 escapes", () => {
    const parsed = parseUnifiedDiff([
      'diff --git "a/caf\\303\\251 \\"menu\\".txt" "b/caf\\303\\251 \\"menu\\".txt"',
      "index 1..2 100644",
      'Binary files "a/caf\\303\\251 \\"menu\\".txt" and "b/caf\\303\\251 \\"menu\\".txt" differ',
      'diff --git "a/tab\\there" "b/tab\\there"',
      "new file mode 100644",
      "--- /dev/null",
      '+++ "b/tab\\there"',
      "@@ -0,0 +1 @@",
      "+x",
    ].join("\n"));
    expect(parsed.files[0].newPath).toBe('café "menu".txt');
    expect(parsed.files[0].binary).toBe(true);
    expect(parsed.files[1].newPath).toBe("tab\there");
    expect(parsed.files[1].status).toBe("added");
  });

  it("handles plain Binary files lines, bare hunks, and empty input", () => {
    const binary = parseUnifiedDiff("Only in a: tmp\nBinary files /dev/null and b/logo.png differ\n");
    expect(binary.files.map(summary)).toEqual([
      { oldPath: null, newPath: "logo.png", status: "added", binary: true, lines: [] },
    ]);
    expect(binary.files[0].preamble).toEqual(["Only in a: tmp"]);

    const bare = parseUnifiedDiff("@@ -1,2 +1,2 @@\n a\n-b\n+c\n\\ No newline at end of file\n");
    expect(bare.files.map(summary)).toEqual([
      { oldPath: null, newPath: null, status: "modified", binary: false, lines: ["c1/1", "d2/", "a/2$"] },
    ]);

    expect(parseUnifiedDiff("")).toEqual({ files: [], trailing: [] });
  });

  it("starts a new file when a plain diff header follows another file's hunks", () => {
    const parsed = parseUnifiedDiff([
      "--- one", "+++ one", "@@ -1 +1 @@", "-a", "+b",
      "Binary files one.bin and two.bin differ",
    ].join("\n"));
    expect(parsed.files.map((file) => [file.newPath, file.binary])).toEqual([["one", false], ["two.bin", true]]);
  });
});

describe("diffDocumentHtml", () => {
  const html = diffDocumentHtml("/storage/review/change.diff", fixture("multi-file.diff"));
  const document = new JSDOM(html).window.document;

  it("renders a summary, table of contents, and one section per file", () => {
    expect(document.querySelector("main")?.getAttribute("data-noted-source")).toBe("diff");
    expect(document.querySelector("header h1")?.textContent).toBe("change.diff");
    expect(document.querySelector("header p")?.textContent).toBe("5 files changed, 4 additions, 3 deletions");
    expect([...document.querySelectorAll("header li a")].map((link) => link.textContent))
      .toEqual(["a.txt", "added.html", "deleted.txt", "img.bin", "new name.txt"]);
    const sections = [...document.querySelectorAll("section.nd-file")];
    expect(sections.map((section) => section.getAttribute("data-status")))
      .toEqual(["modified", "added", "deleted", "modified", "renamed"]);
    expect(sections[4].querySelector("h2 code")?.textContent).toBe("old-name.txt → new name.txt");
    expect(sections[4].getAttribute("data-old-path")).toBe("old-name.txt");
    expect(sections[3].querySelector(".nd-message")?.textContent).toBe("Binary file not shown.");
    expect(sections[3].querySelector(".nd-stat")?.textContent).toBe("binary");
    expect(sections[0].querySelector(".nd-stat")?.textContent).toBe("+2 −1");
  });

  it("emits one annotatable row per hunk line with stable ids and data attributes", () => {
    const rows = [...document.querySelectorAll("section.nd-file")][0].querySelectorAll("tr.nd-line");
    expect(rows).toHaveLength(9);
    const added = rows[2];
    expect(added.getAttribute("data-kind")).toBe("add");
    expect(added.getAttribute("data-new-line")).toBe("2");
    expect(added.hasAttribute("data-old-line")).toBe(false);
    expect(added.querySelector(".nd-code")?.textContent).toBe("TWO");
    expect(added.querySelector(".nd-code")?.getAttribute("data-marker")).toBe("+");
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(document.querySelector("tr.nd-eof")?.textContent).toBe("No newline at end of file");
    expect(document.querySelector("tr.nd-hunk")?.getAttribute("data-new-start")).toBe("1");
  });

  it("escapes diff content instead of rendering it", () => {
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(document.querySelector("section script")).toBeNull();
    const hostile = diffDocumentHtml("x.diff", '--- a/"><img src=x onerror=alert(1)>\n+++ b/"><img src=x onerror=alert(1)>\n@@ -1 +1 @@\n-a\n+b\n');
    const hostileDocument = new JSDOM(hostile).window.document;
    expect(hostileDocument.querySelector("img")).toBeNull();
    expect(hostileDocument.querySelector("section")?.getAttribute("data-path")).toBe('"><img src=x onerror=alert(1)>');
  });

  it("renders notes and the empty state", () => {
    const patch = new JSDOM(diffDocumentHtml("0001.patch", fixture("format-patch.patch"))).window.document;
    expect(patch.querySelector("#nd-note-0")?.textContent).toContain("Subject: [PATCH] Second change");
    const empty = new JSDOM(diffDocumentHtml("empty.diff", "not a diff\n")).window.document;
    expect(empty.querySelector("header p")?.textContent).toBe("No file changes found.");
    expect(empty.querySelector("#nd-note-end")?.textContent).toBe("not a diff");
    const modeOnly = new JSDOM(diffDocumentHtml("m.diff", "diff --git a/s.sh b/s.sh\nold mode 100644\nnew mode 100755\n")).window.document;
    expect(modeOnly.querySelector(".nd-message")?.textContent).toBe("No content changes.");
    expect(modeOnly.querySelector("header ol")).toBeNull();
  });

  it("is the source document for .diff and .patch paths", () => {
    expect(sourceDocumentHtml("/repo/change.patch", fixture("format-patch.patch"))).toContain('data-noted-source="diff"');
  });
});

describe("diff targets", () => {
  const document = new JSDOM(diffDocumentHtml("change.diff", fixture("multi-file.diff"))).window.document;
  const targetFor = (element: Element | null) => {
    expect(element).not.toBeNull();
    return diffTargetFromSelector(lavishSelector(element as Element));
  };

  it("resolves Lavish selectors for added, removed, context, hunk, and file targets", () => {
    const [modified, , deleted, , renamed] = [...document.querySelectorAll("section.nd-file")];
    expect(targetFor(modified.querySelector('tr[data-kind="add"] .nd-code')))
      .toEqual({ fileIndex: 0, path: "a.txt", kind: "add", oldLine: null, newLine: 2, hunk: null });
    expect(targetFor(deleted.querySelector('tr[data-kind="delete"] .nd-num')))
      .toEqual({ fileIndex: 2, path: "deleted.txt", kind: "delete", oldLine: 1, newLine: null, hunk: null });
    expect(targetFor(renamed.querySelector('tr[data-kind="delete"] .nd-code'))?.path).toBe("old-name.txt");
    expect(targetFor(renamed.querySelector('tr[data-kind="context"] .nd-code')))
      .toEqual({ fileIndex: 4, path: "new name.txt", kind: "context", oldLine: 1, newLine: 1, hunk: null });
    expect(targetFor(modified.querySelector("tr.nd-hunk .nd-code"))).toMatchObject({ kind: "hunk", hunk: 1 });
    expect(targetFor(modified.querySelector("h2 code"))).toMatchObject({ kind: "file", path: "a.txt" });
    expect(targetFor(modified.querySelector("tr.nd-eof .nd-code"))).toMatchObject({ kind: "file", path: "a.txt" });
  });

  it("ignores selectors that are not diff ids", () => {
    expect(diffTargetFromSelector("pre#nd-note-0")).toBeNull();
    expect(diffTargetFromSelector("p#intro")).toBeNull();
    expect(diffTargetFromSelector("tr#nd-0-616-R2")).toBeNull();
  });

  it("describes each target with path, side, and line", () => {
    const base = { fileIndex: 0, path: "src/app.ts", oldLine: null, newLine: null, hunk: null };
    expect(describeDiffTarget({ ...base, kind: "add", newLine: 14 })).toBe("`src/app.ts` line 14, new side (added)");
    expect(describeDiffTarget({ ...base, kind: "delete", oldLine: 12 })).toBe("`src/app.ts` line 12, old side (removed)");
    expect(describeDiffTarget({ ...base, kind: "context", oldLine: 18, newLine: 20 })).toBe("`src/app.ts` line 20, new side (context; old line 18)");
    expect(describeDiffTarget({ ...base, kind: "hunk", hunk: 2 })).toBe("`src/app.ts` hunk 2");
    expect(describeDiffTarget({ ...base, kind: "file" })).toBe("`src/app.ts` (file)");
  });
});
