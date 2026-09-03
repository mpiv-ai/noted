import { describe, expect, it } from "vitest";
import { isMarkdownPath, sourceDocumentHtml } from "../lib/source-document";

describe("sourceDocumentHtml", () => {
  it("renders GitHub-flavored Markdown as an annotation-ready HTML document", () => {
    const html = sourceDocumentHtml(
      "/repo/notes.md",
      "# Plan\n\n- First\n- Second\n\n[Guide](assets/guide.md)\n\n[Home](../README.md)\n\n[Root guide](/guide.md)\n\n[Download](?raw=1)\n\n[Details](#details)\n\n## Details\n\n<script>alert('no')</script>\n\n| Item | Owner |\n| --- | --- |\n| Ship | Michael |",
      {
        previewBaseUrl: "/api/v1/file-previews/review-root/",
        sourceDirectory: "docs/reviews",
      },
    );

    expect(html).toContain('data-noted-source="markdown"');
    expect(html).toContain('<h1 id="plan">Plan</h1>');
    expect(html).toContain("<li>First</li>");
    expect(html).toContain('<a href="/api/v1/file-previews/review-root/docs/reviews/assets/guide.md">Guide</a>');
    expect(html).toContain('<a href="/api/v1/file-previews/review-root/docs/README.md">Home</a>');
    expect(html).toContain('<a href="/api/v1/file-previews/review-root/guide.md">Root guide</a>');
    expect(html).toContain('<a href="/api/v1/file-previews/review-root/docs/reviews/notes.md?raw=1">Download</a>');
    expect(html).toContain('<a href="#details">Details</a>');
    expect(html).toContain('<h2 id="details">Details</h2>');
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

  it("deduplicates GitHub-compatible heading IDs", () => {
    const html = sourceDocumentHtml("notes.md", "## Details\n\n## Details");
    expect(html).toContain('<h2 id="details">Details</h2>');
    expect(html).toContain('<h2 id="details-1">Details</h2>');
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

  it("removes local image sources that escape the available preview root", () => {
    const html = sourceDocumentHtml(
      "docs/reviews/notes.md",
      "![Inside](../inside.png)\n\n![Outside](../../../outside.png)\n\n![Root](/images/root.png)",
      { previewBaseUrl: "/preview", sourceDirectory: "docs/reviews" },
    );
    expect(html).toContain('<img alt="Inside" src="../inside.png" />');
    expect(html).toContain('<img alt="Outside" />');
    expect(html).toContain('<img alt="Root" src="/preview/images/root.png" />');
  });

  it("preserves confined parent and root-relative images for export", () => {
    const html = sourceDocumentHtml(
      "docs/notes.md",
      "![Parent](../images/parent.png)\n\n![Root](/images/root.png)",
      { sourceDirectory: "docs" },
    );
    expect(html).toContain('<img alt="Parent" src="../images/parent.png" />');
    expect(html).toContain('<img alt="Root" src="../images/root.png" />');
  });
});
