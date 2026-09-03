import { describe, expect, it } from "vitest";
import { isMarkdownPath, sourceDocumentHtml } from "../lib/source-document";

describe("sourceDocumentHtml", () => {
  it("renders GitHub-flavored Markdown as an annotation-ready HTML document", () => {
    const html = sourceDocumentHtml(
      "/repo/notes.md",
      "# Plan\n\n- First\n- Second\n\n[Guide](assets/guide.md)\n\n[Home](../README.md)\n\n[Details](#details)\n\n<a id=\"details\"></a>\n\n<script>alert('no')</script>\n\n| Item | Owner |\n| --- | --- |\n| Ship | Michael |",
      {
        previewBaseUrl: "/api/v1/file-previews/review-root/",
        sourceDirectory: "docs/reviews",
      },
    );

    expect(html).toContain('data-noted-source="markdown"');
    expect(html).toContain("<h1>Plan</h1>");
    expect(html).toContain("<li>First</li>");
    expect(html).toContain('<a href="/api/v1/file-previews/review-root/docs/reviews/assets/guide.md">Guide</a>');
    expect(html).toContain('<a href="/api/v1/file-previews/review-root/docs/README.md">Home</a>');
    expect(html).toContain('<a href="#details">Details</a>');
    expect(html).toContain('<a id="details"></a>');
    expect(html).toContain("<table>");
    expect(html).not.toContain("# Plan");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert('no')");
  });

  it("strips executable attributes and unsafe URL schemes from raw HTML", () => {
    const html = sourceDocumentHtml(
      "notes.md",
      '<img src="diagram.png" onerror="alert(1)"><a href="javascript:alert(2)">Bad</a>',
      { previewBaseUrl: "/preview" },
    );

    expect(html).toContain('<img src="diagram.png" />');
    expect(html).toContain("<a>Bad</a>");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
  });

  it("recognizes Markdown extensions case-insensitively", () => {
    expect(isMarkdownPath("notes.MD")).toBe(true);
    expect(isMarkdownPath("notes.markdown")).toBe(true);
    expect(isMarkdownPath("notes.mdx")).toBe(false);
  });

  it("passes HTML through unchanged", () => {
    const html = "<html><body><h1>Plan</h1></body></html>";
    expect(sourceDocumentHtml("plan.html", html, { previewBaseUrl: "/preview" })).toBe(html);
  });

  it("removes links that escape the available preview root", () => {
    const html = sourceDocumentHtml("notes.md", "[Outside](../outside.md)", {
      previewBaseUrl: "/preview",
    });
    expect(html).toContain("<a>Outside</a>");
    expect(html).not.toContain("../outside.md");
  });
});
