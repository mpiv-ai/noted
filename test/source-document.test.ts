import { describe, expect, it } from "vitest";
import { isMarkdownPath, sourceDocumentHtml } from "../lib/source-document";

describe("sourceDocumentHtml", () => {
  it("renders GitHub-flavored Markdown as an annotation-ready HTML document", () => {
    const html = sourceDocumentHtml(
      "/repo/notes.md",
      "# Plan\n\n- First\n- Second\n\n| Item | Owner |\n| --- | --- |\n| Ship | Michael |",
    );

    expect(html).toContain('data-noted-source="markdown"');
    expect(html).toContain("<h1>Plan</h1>");
    expect(html).toContain("<li>First</li>");
    expect(html).toContain("<table>");
    expect(html).not.toContain("# Plan");
  });

  it("recognizes Markdown extensions case-insensitively", () => {
    expect(isMarkdownPath("notes.MD")).toBe(true);
    expect(isMarkdownPath("notes.markdown")).toBe(true);
    expect(isMarkdownPath("notes.mdx")).toBe(false);
  });

  it("passes HTML through unchanged", () => {
    const html = "<html><body><h1>Plan</h1></body></html>";
    expect(sourceDocumentHtml("plan.html", html)).toBe(html);
  });
});
