import { describe, expect, it } from "vitest";
import { transformForReview, transformForExport } from "../lib/html-transform";

const page = `<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><h1>Hi</h1><img src="pic.png"><script src="app.js"></script></body></html>`;
const assets: Record<string, { bytes: Uint8Array; mime: string }> = {
  "style.css": { bytes: new TextEncoder().encode("h1{color:green}"), mime: "text/css" },
  "pic.png": { bytes: new Uint8Array([137, 80, 78, 71]), mime: "image/png" },
  "app.js": { bytes: new TextEncoder().encode("console.log(1)"), mime: "text/javascript" },
};
const readAsset = async (p: string) => assets[p] ?? null;

describe("transformForReview", () => {
  it("inlines css, images, and scripts and injects the SDK before </body>", async () => {
    const r = await transformForReview(page, { sdkScript: "<script>SDK</script>", readAsset, previewBaseUrl: null });
    expect(r.srcdoc).toContain('<style data-noted-inlined="style.css">h1{color:green}</style>');
    expect(r.srcdoc).toContain('src="data:image/png;base64,iVBORw=="');
    expect(r.srcdoc).toContain('<script data-noted-inlined="app.js">console.log(1)</script>');
    expect(r.srcdoc.indexOf("<script>SDK</script>")).toBeLessThan(r.srcdoc.indexOf("</body>"));
    expect(r.inlined).toEqual(["style.css", "pic.png", "app.js"]);
    expect(r.srcdoc).not.toContain("<base ");
  });
  it("leaves remote references alone", async () => {
    const remote = `<html><head><link rel="stylesheet" href="https://cdn.x/y.css"></head><body></body></html>`;
    const r = await transformForReview(remote, { sdkScript: "<script>S</script>", readAsset, previewBaseUrl: null });
    expect(r.srcdoc).toContain('href="https://cdn.x/y.css"');
    expect(r.inlined).toEqual([]);
  });
  it("falls back to <base href> for an asset over the cap when a preview url exists", async () => {
    const r = await transformForReview(page, { sdkScript: "<script>S</script>", readAsset, previewBaseUrl: "/api/v1/file-previews/abc", maxAssetBytes: 3 });
    expect(r.srcdoc).toContain('<base href="/api/v1/file-previews/abc/">');
    expect(r.linked).toContain("style.css");
    expect(r.skipped).toEqual([]);
  });
  it("reports a skipped asset when over cap and no preview url", async () => {
    const r = await transformForReview(page, { sdkScript: "<script>S</script>", readAsset, previewBaseUrl: null, maxAssetBytes: 3 });
    expect(r.skipped.map((s) => s.path)).toEqual(["style.css", "pic.png", "app.js"]);
  });
  it("appends the SDK when the document has no </body>", async () => {
    const r = await transformForReview("<p>x</p>", { sdkScript: "<script>S</script>", readAsset, previewBaseUrl: null });
    expect(r.srcdoc.endsWith("<script>S</script>")).toBe(true);
  });
});

describe("transformForExport", () => {
  it("inlines assets and never injects the SDK", async () => {
    const r = await transformForExport(page, { readAsset });
    expect(r.html).toContain("h1{color:green}");
    expect(r.html).not.toContain("<script>SDK</script>");
    expect(r.html).not.toContain("<base ");
    expect(r.inlined).toEqual(["style.css", "pic.png", "app.js"]);
  });
});
