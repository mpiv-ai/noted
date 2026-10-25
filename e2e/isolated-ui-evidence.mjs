import { chromium } from "playwright";
import { build } from "esbuild";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";

const root = process.cwd();
const scratch = join(root, ".noted-e2e", "isolated-ui");
const bundlePath = join(scratch, "isolated-ui.js");
const editorScreenshotPath = join(scratch, "noted-isolated-editor.png");
const screenshotPath = join(scratch, "noted-isolated-popout.png");
const videoDir = join(scratch, "video");
const mp4Path = join(scratch, "noted-isolated-popout.mp4");
const contactSheetPath = join(scratch, "noted-isolated-popout-contact-sheet.png");
const diffFixturePath = join(scratch, "diff-fixture.mjs");
const diffScreenshotPath = join(scratch, "noted-isolated-diff.png");
const diffSentScreenshotPath = join(scratch, "noted-isolated-diff-sent.png");
const diffDocumentScreenshotPath = join(scratch, "noted-isolated-diff-document.png");
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";

rmSync(scratch, { recursive: true, force: true });
mkdirSync(videoDir, { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: ["e2e/isolated-ui-entry.tsx"],
  bundle: true,
  format: "iife",
  platform: "browser",
  outfile: bundlePath,
  jsx: "automatic",
  plugins: [{
    name: "isolated-plugin-sdk-app",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@get-bb\/plugin-sdk\/app$/ }, () => ({ path: join(root, "e2e/isolated-sdk-app.ts") }));
    },
  }],
});

await build({
  absWorkingDir: root,
  entryPoints: ["e2e/isolated-diff-fixture.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  outfile: diffFixturePath,
});
const { diffReviewDocument, buildFeedbackMessage } = await import(diffFixturePath);
const diffSource = readFileSync(join(root, "test/fixtures/multi-file.diff"), "utf8");
const diffSha256 = digest(diffSource);
const diffDocument = await diffReviewDocument("/repo/review/change.diff", diffSource, "diff-session", `revision-${diffSha256.slice(0, 8)}`);
const diffQueue = [];
const diffBatches = [];

const markdown = { content: "# Original plan\n\nA reviewable Markdown document.\n", sha256: "" };
markdown.sha256 = digest(markdown.content);

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escape(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function markdownDocument(source) {
  const heading = source.match(/^#\s+(.+)$/m)?.[1] ?? "Untitled";
  const paragraph = source.split(/\n\n+/).find((part) => !part.startsWith("#")) ?? "";
  return `<html><body><main><h1>${escape(heading)}</h1><p>${escape(paragraph)}</p></main></body></html>`;
}

function diffPayload() {
  return {
    session: {
      id: "diff-session", producerThreadId: "thread-a", viewThreadId: "thread-a", replyThreadId: "thread-a",
      projectId: "project-a", hostId: "host-a", absolutePath: "/repo/review/change.diff",
      sourceKind: "workspace", status: "open", endedBy: null, deliveryMode: "default", createdAt: 1, updatedAt: 1,
    },
    revision: { id: `revision-${diffSha256.slice(0, 8)}`, sessionId: "diff-session", sha256: diffSha256, sizeBytes: Buffer.byteLength(diffSource), recordedAt: 1, trigger: "open" },
    revisionNumber: 1,
    displayPath: "review/change.diff",
    capabilities: { newWindow: true, markdownEditing: true },
    markdown: null,
    document: diffDocument,
    queued: [...diffQueue], batches: [...diffBatches], replies: [],
  };
}

function payload(sessionId) {
  if (sessionId === "diff-session") return diffPayload();
  const isHtml = sessionId === "html-session";
  const source = isHtml ? "<h1>HTML review</h1><p>This format is read-only.</p>" : markdown.content;
  const sha256 = isHtml ? digest(source) : markdown.sha256;
  return {
    session: {
      id: sessionId, producerThreadId: "thread-a", viewThreadId: "thread-a", replyThreadId: "thread-a",
      projectId: "project-a", hostId: "host-a", absolutePath: isHtml ? "/repo/plan.html" : "/repo/plan.md",
      sourceKind: "workspace", status: "open", endedBy: null, deliveryMode: "default", createdAt: 1, updatedAt: 1,
    },
    revision: { id: `revision-${sha256.slice(0, 8)}`, sessionId, sha256, sizeBytes: Buffer.byteLength(source), recordedAt: 1, trigger: "manual" },
    revisionNumber: isHtml ? 1 : (markdown.content.startsWith("# Updated plan") ? 2 : 1),
    displayPath: isHtml ? "plan.html" : "plan.md",
    capabilities: { newWindow: true, markdownEditing: true },
    markdown: isHtml ? null : markdown.content,
    document: { srcdoc: isHtml ? `<html><body>${source}</body></html>` : markdownDocument(source), inlined: [], linked: [], skipped: [] },
    queued: [], batches: [], replies: [],
  };
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "POST" && url.pathname === "/__noted_rpc") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const { method, input } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    try {
      if (method === "getSession") return json(response, 200, { value: payload(input.sessionId) });
      if (method === "saveMarkdown") {
        if (input.expectedSha256 !== markdown.sha256) throw new Error("File changed since it was read");
        markdown.content = input.content;
        markdown.sha256 = digest(markdown.content);
        return json(response, 200, { value: { sha256: markdown.sha256 } });
      }
      if (method === "queuePrompt" && input.sessionId === "diff-session") {
        const prompt = { id: `prompt-${diffQueue.length + 1}`, sessionId: input.sessionId, revisionId: diffPayload().revision.id, createdAt: Date.now(), uid: input.uid, prompt: input.prompt, selector: input.selector, tag: input.tag, text: input.text, target: input.target ?? null };
        diffQueue.push(prompt);
        return json(response, 200, { value: prompt });
      }
      if (method === "send" && input.sessionId === "diff-session") {
        const items = diffQueue.splice(0);
        const messageText = buildFeedbackMessage({ displayPath: "review/change.diff", revisionNumber: 1, items, freeform: input.freeform ?? null, endSession: input.endSession, reviewedInThreadId: null, replyThreadId: "thread-a" });
        const batch = { id: `batch-${diffBatches.length + 1}`, sessionId: input.sessionId, revisionId: diffPayload().revision.id, items, messageText, mode: input.mode ?? "queue-if-active", delivery: "sent", error: null, sentAt: Date.now() };
        diffBatches.push(batch);
        return json(response, 200, { value: { batch } });
      }
      if (method === "setDeliveryMode" || method === "updatePrompt" || method === "removePrompt") return json(response, 200, { value: { ok: true } });
      throw new Error(`Unsupported isolated RPC method: ${method}`);
    } catch (error) {
      return json(response, 409, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (url.pathname === "/isolated-ui.js") {
    response.writeHead(200, { "content-type": "application/javascript" });
    return response.end(readFileSync(bundlePath));
  }
  if (url.pathname === "/app.css") {
    response.writeHead(200, { "content-type": "text/css" });
    return response.end(readFileSync(join(root, "dist", "app.css")));
  }
  response.writeHead(200, { "content-type": "text/html" });
  response.end(`<!doctype html><html><head><meta charset="utf-8"><title>Noted isolated UI</title><link rel="stylesheet" href="/app.css"><style>
    :root { --background: #ffffff; --foreground: #18212b; --border: #d8dee7; --muted-foreground: #697586; --destructive: #b42318; }
    * { box-sizing: border-box; } html, body, #root { height: 100%; } body { margin: 0; font-family: ui-sans-serif, system-ui; color: var(--foreground); background: #f6f7f9; } main { height: 100vh; display: flex; flex-direction: column; } header { padding: 12px 16px; font-weight: 700; background: #18212b; color: white; } .harness-note { margin: 0; padding: 8px 16px; background: #fff8d6; font-size: 13px; } main > div { min-height: 0; flex: 1; background: var(--background); } button, textarea, select { font: inherit; } iframe { background: white; } 
  </style></head><body data-bb-plugin="noted"><div id="root"></div><script src="/isolated-ui.js"></script></body></html>`);
});

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
let browser;
let context;
let popupVideo;
try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } } });
  const page = await context.newPage();
  await page.goto(baseUrl);
  const popupOpened = context.waitForEvent("page");
  await page.getByRole("button", { name: "New window" }).click();
  const popup = await popupOpened;
  popupVideo = popup.video();
  await popup.waitForLoadState();
  await popup.getByText("Isolated Noted UI harness").waitFor();
  await popup.frameLocator('iframe[title="Noted: plan.md"]').getByRole("heading", { name: "Original plan" }).waitFor();
  await popup.waitForTimeout(250);
  await page.getByRole("button", { name: "Edit Markdown" }).click();
  await page.getByLabel("Markdown source").fill("# Updated plan\n\nSaved from the isolated user edit.");
  await page.screenshot({ path: editorScreenshotPath });
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Save" }).click();
  await page.frameLocator('iframe[title="Noted: plan.md"]').getByRole("heading", { name: "Updated plan" }).waitFor();
  await popup.frameLocator('iframe[title="Noted: plan.md"]').getByRole("heading", { name: "Updated plan" }).waitFor();
  await popup.waitForTimeout(350);
  await popup.screenshot({ path: screenshotPath });
  const htmlPage = await context.newPage();
  await htmlPage.goto(`${baseUrl}/html`);
  await htmlPage.getByRole("button", { name: "New window" }).waitFor();
  if (await htmlPage.getByRole("button", { name: "Edit Markdown" }).count() !== 0) throw new Error("HTML review exposed Markdown editing");
  console.log(JSON.stringify({
    isolated: true,
    popup: "opened and rendered the real ReviewTab route",
    markdownSave: "updated preview in opener and popup through fixture realtime",
    htmlEditing: "absent",
    editorScreenshot: editorScreenshotPath,
    screenshot: screenshotPath,
  }));
  await htmlPage.close();

  const diffPage = await context.newPage();
  await diffPage.goto(`${baseUrl}/diff`);
  const diffFrame = diffPage.frameLocator('iframe[title="Noted: review/change.diff"]');
  await diffFrame.getByRole("heading", { name: "change.diff" }).waitFor();
  const annotations = [
    ['tr[data-kind="add"][data-new-line="2"] td.nd-code', "Keep the original casing here."],
    ['section[data-path="deleted.txt"] tr[data-kind="delete"] td.nd-code', "Why delete this file?"],
    ['section[data-path="new name.txt"] tr[data-kind="context"][data-new-line="3"] td.nd-code', "Add a test for this rename."],
  ];
  for (const [selector, feedback] of annotations) {
    await diffFrame.locator(selector).click();
    const textarea = diffFrame.locator(".lavish-annotation-card textarea");
    await textarea.waitFor({ timeout: 20_000 });
    await textarea.fill(feedback);
    await diffFrame.locator(".lavish-annotation-card .lavish-send").click();
    await diffPage.getByText(feedback, { exact: true }).waitFor({ timeout: 10_000 });
  }
  await diffFrame.locator('tr[data-kind="add"][data-new-line="2"] td.nd-code').hover();
  await diffPage.waitForTimeout(250);
  await diffPage.screenshot({ path: diffScreenshotPath });
  await diffPage.getByRole("button", { name: "Send to agent", exact: true }).click();
  await diffPage.getByText("Noted: feedback on review/change.diff", { exact: false }).waitFor({ timeout: 10_000 });
  const diffMessage = diffBatches.at(-1)?.messageText ?? "";
  for (const expected of [
    "diff `a.txt` line 2, new side (added)",
    "diff `deleted.txt` line 1, old side (removed)",
    "diff `new name.txt` line 3, new side (context; old line 3)",
  ]) {
    if (!diffMessage.includes(expected)) throw new Error(`Diff feedback is missing ${expected}:\n${diffMessage}`);
  }
  await diffPage.screenshot({ path: diffSentScreenshotPath });
  console.log(JSON.stringify({ diffReview: "real Lavish SDK queued three diff-line notes", diffScreenshot: diffScreenshotPath, diffSentScreenshot: diffSentScreenshotPath, diffMessage }));
  await diffPage.close();

  const documentPage = await context.newPage();
  await documentPage.setViewportSize({ width: 960, height: 720 });
  await documentPage.setContent(diffDocument.srcdoc);
  await documentPage.getByRole("heading", { name: "change.diff" }).waitFor();
  await documentPage.screenshot({ path: diffDocumentScreenshotPath, fullPage: true });
  console.log(JSON.stringify({ diffDocumentScreenshot: diffDocumentScreenshotPath }));
  await documentPage.close();
  await popup.close();
  await page.close();
} finally {
  await context?.close();
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

const webm = popupVideo ? await popupVideo.path() : readdirSync(videoDir).map((entry) => join(videoDir, entry)).find((entry) => entry.endsWith(".webm"));
if (webm) {
  execFileSync(ffmpeg, ["-y", "-i", webm, "-movflags", "+faststart", mp4Path], { stdio: "ignore" });
  execFileSync(ffmpeg, ["-y", "-i", mp4Path, "-vf", "fps=4,scale=480:-1,tile=2x2", "-frames:v", "1", contactSheetPath], { stdio: "ignore" });
  if (statSync(mp4Path).size > 5 * 1024 * 1024) throw new Error(`Evidence video exceeds 5 MiB: ${statSync(mp4Path).size} bytes`);
  console.log(JSON.stringify({ video: mp4Path, bytes: statSync(mp4Path).size, source: basename(webm), contactSheet: contactSheetPath }));
}
