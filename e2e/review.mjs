import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const workDir = join(root, ".noted-e2e");
const artifactPath = ".noted-e2e/plan.html";
const producerShot = join(root, "e2e/producer.png");
const viewerShot = join(root, "e2e/viewer.png");
const serverUrl = requiredEnv("BB_SERVER_URL").replace(/\/$/, "");
const projectId = requiredEnv("BB_PROJECT_ID");
const environmentId = requiredEnv("BB_ENVIRONMENT_ID");
const spawnedThreads = [];
const openedSessionIds = [];
const bbOptions = { encoding: "utf8", env: process.env };

let browser;
let producerPage;
let viewerPage;
let producerId;
let viewerId;
let sessionId;
let crossAssistantCount;
let failedStep;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function quote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function bb(args) {
  return execSync(args.map(quote).join(" "), bbOptions);
}

function report(step, ok, detail) {
  console.log(JSON.stringify({ step, ok, detail }));
}

function errorDetail(error) {
  return String(error instanceof Error ? error.message : error).split("\n")[0];
}

async function step(name, action) {
  try {
    const detail = await action();
    report(name, true, detail);
  } catch (error) {
    const page = viewerPage ?? producerPage;
    let detail = errorDetail(error);
    if (page) {
      const screenshotPath = viewerPage ? viewerShot : producerShot;
      await page.screenshot({ path: screenshotPath }).catch(() => {});
      const pageText = await page.locator("body").innerText().catch(() => "");
      if (pageText) {
        detail += ` Page text: ${pageText.replace(/\s+/g, " ").slice(0, 500)}`;
      }
    }
    report(name, false, detail);
    failedStep = name;
    throw error;
  }
}

function threadRoute(threadId) {
  return `${serverUrl}/projects/${projectId}/threads/${threadId}`;
}

function waitForIdle(threadId) {
  return bb(["bb", "thread", "wait", threadId, "--status", "idle", "--timeout", "180"]);
}

function threadLog(threadId) {
  return bb(["bb", "thread", "log", threadId]);
}
function assistantBlocks(log) {
  return log
    .split(/^── Assistant .*$/m)
    .slice(1)
    .map((section) => section.split(/^── (?:User|Assistant) .*$/m)[0].trim());
}

function lastTranscriptRole(log) {
  return [...log.matchAll(/^── (User|Assistant) .*$/gm)].at(-1)?.[1] ?? null;
}

async function waitForIdleAssistant(threadId) {
  const deadline = Date.now() + 180_000;
  let log = "";
  while (true) {
    const state = JSON.parse(bb(["bb", "thread", "show", threadId, "--json"]));
    log = threadLog(threadId);
    if (state.thread?.status === "idle" && lastTranscriptRole(log) === "Assistant") {
      return log;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(3_000, remaining)));
  }
  throw new Error(`thread ${threadId} did not become idle after an Assistant block: ${log.slice(-500)}`);
}

async function waitForNewAssistant(threadId, previousCount, predicate, description) {
  const deadline = Date.now() + 180_000;
  let log = "";
  while (true) {
    log = threadLog(threadId);
    const newBlocks = assistantBlocks(log).slice(previousCount);
    if (newBlocks.some(predicate)) {
      return log;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(3_000, remaining)));
  }
  throw new Error(`thread ${threadId} did not produce ${description}: ${log.slice(-500)}`);
}

async function waitForReply(threadId, marker, startAt = 0) {
  const deadline = Date.now() + 180_000;
  let log = "";
  while (true) {
    log = threadLog(threadId);
    const markerAt = log.indexOf(marker, startAt);
    if (markerAt >= 0 && /\bAssistant\b/.test(log.slice(markerAt + marker.length))) {
      return log;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(3_000, remaining)));
  }
  throw new Error(`thread ${threadId} did not reply after ${marker}: ${log.slice(-500)}`);
}


async function spawnThread(role) {
  const output = bb([
    "bb",
    "thread",
    "spawn",
    "--project",
    projectId,
    "--environment",
    environmentId,
    "--provider",
    "codex",
    "--model",
    "gpt-5.6-luna",
    "--reasoning-level",
    "low",
    "--permission-mode",
    "full",
    "--visibility",
    "hidden",
    "--title",
    `noted e2e ${role}`,
    "--prompt",
    "Reply with exactly READY",
    "--json",
  ]);
  const parsed = JSON.parse(output);
  const threadId = parsed.id ?? parsed.thread?.id;
  if (!threadId) {
    throw new Error(`spawn did not return a thread id: ${output.trim()}`);
  }
  spawnedThreads.push(threadId);
  waitForIdle(threadId);
  const log = threadLog(threadId);
  if (!log.includes("READY")) {
    throw new Error(`${threadId} did not reply READY`);
  }
  return threadId;
}

async function callRpc(method, input) {
  const response = await fetch(`${serverUrl}/api/v1/plugins/noted/rpc/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json();
  if (!response.ok || payload.ok !== true) {
    throw new Error(`${method} failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload.result;
}

async function openSession(input) {
  const result = await callRpc("openSession", input);
  if (!result?.session?.id) {
    throw new Error(`openSession did not return a session: ${JSON.stringify(result)}`);
  }
  if (!openedSessionIds.includes(result.session.id)) {
    openedSessionIds.push(result.session.id);
  }
  return result.session.id;
}

async function queueAndSend(page, selector, feedback) {
  const frame = page.frameLocator(`iframe[title="Noted: ${artifactPath}"]`);
  await frame.locator(selector).click();
  const textarea = frame.locator(".lavish-annotation-card textarea");
  await textarea.waitFor({ timeout: 20_000 });
  await textarea.fill(feedback);
  await frame.locator(".lavish-annotation-card .lavish-send").click();
  await page.getByText(feedback, { exact: true }).waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "Send to agent", exact: true }).click();
}
function rewriteRevisedPlan() {
  const planPath = join(workDir, "plan.html");
  const current = readFileSync(planPath, "utf8");
  const revised = current.replace(
    /(<p id="para-a">).*?(<\/p>)/,
    "$1Option A (revised)$2",
  );
  if (revised !== current) {
    writeFileSync(planPath, revised);
  }
}



async function cleanup() {
  const failures = [];
  await browser?.close().catch((error) => failures.push(`browser: ${errorDetail(error)}`));
  for (const openedSessionId of openedSessionIds) {
    try {
      await callRpc("endSession", { sessionId: openedSessionId, by: "user" });
    } catch (error) {
      let alreadyEnded = false;
      for (const threadId of spawnedThreads) {
        try {
          const result = await callRpc("listSessions", { threadId });
          alreadyEnded ||= result.sessions.some(
            (session) => session.id === openedSessionId && session.status === "ended",
          );
        } catch {
        }
      }
      if (!alreadyEnded) {
        failures.push(`end session ${openedSessionId}: ${errorDetail(error)}`);
      }
    }
  }
  for (const threadId of spawnedThreads) {
    try {
      bb(["bb", "thread", "stop", threadId]);
    } catch (error) {
      failures.push(`stop ${threadId}: ${errorDetail(error)}`);
    }
    try {
      bb(["bb", "thread", "archive", threadId]);
    } catch (error) {
      failures.push(`archive ${threadId}: ${errorDetail(error)}`);
    }
  }
  let openSessionCount = 0;
  for (const threadId of spawnedThreads) {
    try {
      const result = await callRpc("listSessions", { threadId });
      openSessionCount += result.sessions.filter((session) => session.status === "open").length;
    } catch (error) {
      failures.push(`list sessions ${threadId}: ${errorDetail(error)}`);
    }
  }
  if (openSessionCount > 0) {
    failures.push(`${openSessionCount} sessions remain open`);
  }
  rmSync(workDir, { recursive: true, force: true });
  if (failures.length > 0) {
    throw new Error(failures.join("; "));
  }
  return `${openedSessionIds.length} sessions ended, ${openSessionCount} open`;
}

try {
  await step("spawn-producer", async () => {
    producerId = await spawnThread("producer");
    return producerId;
  });

  await step("fixture", async () => {
    mkdirSync(workDir, { recursive: true });
    copyFileSync(join(root, "e2e/fixture/plan.html"), join(workDir, "plan.html"));
    copyFileSync(join(root, "e2e/fixture/style.css"), join(workDir, "style.css"));
    return artifactPath;
  });

  await step("open-producer-page", async () => {
    browser = await chromium.launch({ headless: true });
    producerPage = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    await producerPage.goto(threadRoute(producerId));
    return threadRoute(producerId);
  });

  await step("open-session", async () => {
    sessionId = await openSession({ threadId: producerId, path: artifactPath });
    return sessionId;
  });

  await step("review-tab", async () => {
    const reviewButton = producerPage.getByRole("button", {
      name: "Review with Noted",
      exact: true,
    });
    try {
      await reviewButton.waitFor({ state: "visible", timeout: 30_000 });
    } catch {
      sessionId = await openSession({ threadId: producerId, path: artifactPath });
      await reviewButton.waitFor({ state: "visible", timeout: 30_000 });
    }
    await reviewButton.click();
    const artifactFrame = producerPage.locator(`iframe[title="Noted: ${artifactPath}"]`);
    await artifactFrame.waitFor({ state: "attached", timeout: 30_000 });
    await producerPage
      .frameLocator(`iframe[title="Noted: ${artifactPath}"]`)
      .locator("#para-a")
      .waitFor({ state: "visible", timeout: 30_000 });
    return `Noted: ${artifactPath}`;
  });

  await step("annotate", async () => {
    await queueAndSend(producerPage, "#para-a", "Make this the recommended option.");
    return "#para-a queued and sent";
  });

  await step("delivered", async () => {
    const marker = `Noted: feedback on ${artifactPath} (revision 1, 1 items)`;
    await waitForReply(producerId, marker);
    return marker;
  });

  await step("revision-2", async () => {
    const idleLog = await waitForIdleAssistant(producerId);
    const revisionHeader = producerPage.getByText(/^revision \d+$/).first();
    await revisionHeader.waitFor({ state: "visible", timeout: 30_000 });
    const revisionText = await revisionHeader.textContent();
    const revisionMatch = revisionText?.match(/revision (\d+)/);
    if (!revisionMatch) {
      throw new Error(`revision header is invalid: ${revisionText}`);
    }
    const previousRevision = Number(revisionMatch[1]);
    const nextRevision = previousRevision + 1;
    const previousAssistantCount = assistantBlocks(idleLog).length;
    rewriteRevisedPlan();
    bb(["bb", "thread", "tell", producerId, "Reply with exactly DONE"]);
    await waitForNewAssistant(
      producerId,
      previousAssistantCount,
      (block) => block.includes("DONE"),
      "a new Assistant block containing DONE",
    );
    await producerPage
      .getByText(`revision ${nextRevision}`, { exact: true })
      .waitFor({ state: "visible", timeout: 30_000 });
    await producerPage.screenshot({ path: producerShot });
    return `revision ${previousRevision} -> ${nextRevision}`;
  });

  await step("spawn-viewer", async () => {
    viewerId = await spawnThread("viewer");
    return viewerId;
  });

  await step("open-cross-thread", async () => {
    const originalSessionId = sessionId;
    const result = await callRpc("openSession", {
      threadId: producerId,
      path: artifactPath,
      view: viewerId,
    });
    if (result?.session?.id !== originalSessionId) {
      throw new Error(`openSession replaced ${originalSessionId} with ${result?.session?.id}`);
    }
    if (result.session.viewThreadId !== viewerId) {
      throw new Error(`openSession kept viewer ${result.session.viewThreadId}`);
    }
    sessionId = result.session.id;
    if (!openedSessionIds.includes(sessionId)) {
      openedSessionIds.push(sessionId);
    }
    viewerPage = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    await viewerPage.goto(threadRoute(viewerId));
    const banner = `Review requested: plan.html from ${producerId}`;
    const requestBanner = viewerPage.getByText(banner, { exact: true });
    await requestBanner.waitFor({ state: "visible", timeout: 30_000 });
    const openButton = viewerPage.getByRole("button", { name: "Open", exact: true });
    await openButton.waitFor({ state: "visible", timeout: 30_000 });
    await openButton.click();
    const artifactFrame = viewerPage.locator(`iframe[title="Noted: ${artifactPath}"]`);
    await artifactFrame.waitFor({ state: "attached", timeout: 30_000 });
    await viewerPage
      .frameLocator(`iframe[title="Noted: ${artifactPath}"]`)
      .locator("#para-b")
      .waitFor({ state: "visible", timeout: 30_000 });
    const idleLog = await waitForIdleAssistant(producerId);
    crossAssistantCount = assistantBlocks(idleLog).length;
    await queueAndSend(viewerPage, "#para-b", "Drop this option.");
    await viewerPage.screenshot({ path: viewerShot });
    return `${viewerId} reviewed ${artifactPath}`;
  });

  await step("cross-delivered", async () => {
    const marker = `Reviewed in thread ${viewerId} by Michael.`;
    const producerLog = await waitForNewAssistant(
      producerId,
      crossAssistantCount,
      () => true,
      "a new Assistant block after cross-thread feedback",
    );
    if (!producerLog.includes(marker)) {
      throw new Error(`producer log lacks cross-thread attribution: ${producerLog.slice(-500)}`);
    }
    const viewerLog = threadLog(viewerId);
    if (viewerLog.includes("Noted: feedback")) {
      throw new Error(`viewer received feedback: ${viewerLog.slice(-500)}`);
    }
    return marker;
  });
} catch {
} finally {
  try {
    const detail = await cleanup();
    report("cleanup", true, detail);
  } catch (error) {
    report("cleanup", false, errorDetail(error));
    failedStep ??= "cleanup";
  }
}

if (failedStep) {
  console.log(JSON.stringify({ ok: false, failed: failedStep }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true }));
}
