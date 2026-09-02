import { createHash } from "node:crypto";
import { dirname, extname, isAbsolute, join, relative } from "node:path";
import type { BbPluginApi, PluginCliContext, PluginCliResult, PluginRpcHandlers } from "@get-bb/plugin-sdk";
import { transformForExport, transformForReview } from "./lib/html-transform";
import { buildCompanionNote } from "./lib/kb-note";
import { buildFeedbackMessage } from "./lib/message";
import { resolveArtifact, resolveRole } from "./lib/resolve";
import { rpcContract, type OpenSessionInput } from "./lib/rpc";
import { buildSdkScript } from "./lib/sdk-script";
import { openStore, type Revision, type Session, type Store } from "./lib/store";

type Runtime = {
  bb: BbPluginApi;
  store: Store;
  dataDir: string;
};

type ChangeReason = "revision" | "queue" | "batch" | "reply" | "ended" | "roles";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function decodeText(content: string, encoding: "base64" | "utf8"): string {
  return encoding === "base64" ? Buffer.from(content, "base64").toString("utf8") : content;
}

function requireSession(store: Store, sessionId: string): Session {
  const session = store.getSession(sessionId);
  if (session === null) throw new Error(`session ${sessionId} not found`);
  return session;
}

function requireRevision(store: Store, sessionId: string): Revision {
  const revision = store.latestRevision(sessionId);
  if (revision === null) throw new Error(`session ${sessionId} has no revision`);
  return revision;
}

function publish(runtime: Runtime, sessionId: string, revisionId: string, reason: ChangeReason): void {
  runtime.bb.realtime.publish("noted:session-changed", { sessionId, revisionId, reason });
}

async function displayPathFor(runtime: Runtime, session: Session): Promise<string> {
  if (session.sourceKind === "thread-storage") {
    return relative(join(runtime.dataDir, "thread-storage", session.producerThreadId), session.absolutePath);
  }
  if (session.sourceKind === "workspace") {
    const thread = await runtime.bb.sdk.threads.get({ threadId: session.producerThreadId });
    if (thread.environmentId !== null) {
      const environment = await runtime.bb.sdk.environments.get({ environmentId: thread.environmentId });
      if (typeof environment.path === "string") return relative(environment.path, session.absolutePath);
    }
  }
  return session.absolutePath;
}

async function captureRevision(
  runtime: Runtime,
  session: Session,
  trigger: Revision["trigger"],
): Promise<{ html: string; revision: Revision; changed: boolean }> {
  const file = await runtime.bb.sdk.files.read({
    hostId: session.hostId ?? undefined,
    path: session.absolutePath,
  });
  const html = decodeText(file.content, file.contentEncoding);
  const sha256 = createHash("sha256").update(html).digest("hex");
  const latest = runtime.store.latestRevision(session.id);
  if (latest?.sha256 === sha256) return { html, revision: latest, changed: false };
  const revision = runtime.store.addRevision(
    session.id,
    sha256,
    Buffer.byteLength(html, "utf8"),
    trigger,
  );
  return { html, revision, changed: true };
}
function assetReaderFor(runtime: Runtime, hostId: string | undefined, rootPath: string) {
  return async (assetPath: string) => {
    try {
      const file = await runtime.bb.sdk.files.read({
        hostId,
        path: join(rootPath, assetPath),
      });
      return {
        bytes: Buffer.from(file.content, file.contentEncoding),
        mime: MIME_TYPES[extname(assetPath).toLowerCase()] ?? "application/octet-stream",
      };
    } catch {
      return null;
    }
  };
}


async function readAndTransform(runtime: Runtime, session: Session, trigger: Revision["trigger"]) {
  const captured = await captureRevision(runtime, session, trigger);
  const rootPath = dirname(session.absolutePath);
  const preview = await runtime.bb.sdk.files.createPreview({
    hostId: session.hostId ?? undefined,
    rootPath,
    ttlMs: 600_000,
  });
  const document = await transformForReview(captured.html, {
    sdkScript: buildSdkScript({
      key: session.id,
      revision: runtime.store.listRevisions(session.id).length,
      loadToken: captured.revision.id,
    }),
    previewBaseUrl: preview.baseUrl,
    readAsset: assetReaderFor(runtime, session.hostId ?? undefined, rootPath),
  });
  return { ...captured, document };
}

async function sessionPayload(runtime: Runtime, sessionId: string, trigger: Revision["trigger"]) {
  const session = requireSession(runtime.store, sessionId);
  const transformed = await readAndTransform(runtime, session, trigger);
  const revisions = runtime.store.listRevisions(session.id);
  return {
    payload: {
      session,
      revision: transformed.revision,
      revisionNumber: revisions.length,
      displayPath: await displayPathFor(runtime, session),
      document: transformed.document,
      queued: runtime.store.listQueued(session.id),
      batches: runtime.store.listBatches(session.id),
      replies: runtime.store.listReplies(session.id),
    },
    changed: transformed.changed,
  };
}

export async function openSessionCore(runtime: Runtime, input: OpenSessionInput) {
  const viewThreadId = await resolveRole(runtime.bb.sdk, input.threadId, input.view);
  const replyThreadId = await resolveRole(runtime.bb.sdk, input.threadId, input.replyTo);
  const path = input.source === "thread-storage" && !isAbsolute(input.path)
    ? join(runtime.dataDir, "thread-storage", input.threadId, input.path)
    : input.path;
  const artifact = await resolveArtifact(
    runtime.bb.sdk,
    input.threadId,
    path,
    undefined,
    runtime.dataDir,
  );
  let session = runtime.store.findOpenSession(input.threadId, artifact.absolutePath);
  let rolesChanged = false;
  if (session === null) {
    const ended = runtime.store.listSessionsForThread(input.threadId).find((candidate) =>
      candidate.producerThreadId === input.threadId
      && candidate.absolutePath === artifact.absolutePath
      && candidate.status === "ended"
    );
    if (ended !== undefined && input.reopen !== true) {
      throw new Error("session ended; pass reopen to open it again");
    }
    const producerThread = await runtime.bb.sdk.threads.get({ threadId: input.threadId });
    session = runtime.store.createSession({
      producerThreadId: input.threadId,
      viewThreadId,
      replyThreadId,
      projectId: producerThread.projectId ?? null,
      hostId: artifact.hostId ?? null,
      absolutePath: artifact.absolutePath,
      sourceKind: artifact.sourceKind,
    });
  } else if (input.view !== undefined || input.replyTo !== undefined) {
    const roles = {
      viewThreadId: input.view !== undefined ? viewThreadId : session.viewThreadId,
      replyThreadId: input.replyTo !== undefined ? replyThreadId : session.replyThreadId,
    };
    if (
      roles.viewThreadId !== session.viewThreadId
      || roles.replyThreadId !== session.replyThreadId
    ) {
      runtime.store.updateRoles(session.id, roles);
      session = requireSession(runtime.store, session.id);
      rolesChanged = true;
    }
  }

  const { payload } = await sessionPayload(runtime, session.id, "open");
  if (rolesChanged) {
    publish(runtime, session.id, payload.revision.id, "roles");
  }
  if (session.viewThreadId === input.threadId && session.sourceKind !== "host") {
    await runtime.bb.sdk.threads.open({
      threadId: session.viewThreadId,
      file: { path: payload.displayPath, source: session.sourceKind, lineNumber: null },
    });
  }
  publish(runtime, session.id, payload.revision.id, "queue");
  return payload;
}

const CLI_USAGES = {
  open: "Usage: bb noted open <file> [--view <thread>] [--reply-to <thread>] [--reopen] [--json]",
  reply: "Usage: bb noted reply <text...> [--json]",
  status: "Usage: bb noted status [<file>] [--json]",
  end: "Usage: bb noted end <file>",
  file: "Usage: bb noted file <file> --to <folder> --title <title> --summary <text> [--profile <name>] [--json]",
} as const;

type ParsedCliArgs = {
  json: boolean;
  reopen: boolean;
  view?: string;
  replyTo?: string;
  to?: string;
  title?: string;
  summary?: string;
  profile?: string;
  positionals: string[];
};

function parseCliArgs(argv: string[]): ParsedCliArgs | null {
  const parsed: ParsedCliArgs = { json: false, reopen: false, positionals: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--json") {
      parsed.json = true;
      continue;
    }
    if (token === "--reopen") {
      parsed.reopen = true;
      continue;
    }
    if (
      token === "--view"
      || token === "--reply-to"
      || token === "--to"
      || token === "--title"
      || token === "--summary"
      || token === "--profile"
    ) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) return null;
      index += 1;
      if (token === "--view") parsed.view = value;
      else if (token === "--reply-to") parsed.replyTo = value;
      else if (token === "--to") parsed.to = value;
      else if (token === "--title") parsed.title = value;
      else if (token === "--summary") parsed.summary = value;
      else parsed.profile = value;
      continue;
    }
    if (token.startsWith("--")) return null;
    parsed.positionals.push(token);
  }
  return parsed;
}

async function runNotedCli(
  runtime: Runtime,
  argv: string[],
  ctx: PluginCliContext,
): Promise<PluginCliResult> {
  const command = argv[0];
  if (
    command !== "open"
    && command !== "reply"
    && command !== "status"
    && command !== "end"
    && command !== "file"
  ) {
    return { exitCode: 1, stderr: "Usage: bb noted <open|reply|status|end|file>" };
  }
  if (ctx.threadId === undefined) {
    return { exitCode: 1, stderr: `bb noted ${command} must run inside a bb thread` };
  }

  const parsed = parseCliArgs(argv.slice(1));
  if (parsed === null) return { exitCode: 1, stderr: CLI_USAGES[command] };
  const threadId = ctx.threadId;
  const openSessions = () => runtime.store.listSessionsForThread(threadId)
    .filter((session) =>
      session.status === "open"
      && (session.replyThreadId === threadId || session.producerThreadId === threadId)
    )
    .sort((left, right) => right.updatedAt - left.updatedAt);

  try {
    if (command === "open") {
      const file = parsed.positionals[0];
      if (file === undefined) return { exitCode: 1, stderr: CLI_USAGES.open };
      const payload = await openSessionCore(runtime, {
        threadId,
        path: file,
        ...(parsed.view === undefined ? {} : { view: parsed.view }),
        ...(parsed.replyTo === undefined ? {} : { replyTo: parsed.replyTo }),
        ...(parsed.reopen ? { reopen: true } : {}),
      });
      const result = {
        session_id: payload.session.id,
        path: payload.displayPath,
        view_thread: payload.session.viewThreadId,
        reply_thread: payload.session.replyThreadId,
        revision: payload.revisionNumber,
        next_step: `Opened in thread ${payload.session.viewThreadId}. End your turn now with one short line; the reviewer's feedback will arrive as a message that starts with "Noted:". Do not poll and do not reopen an ended session.`,
      };
      return {
        exitCode: 0,
        stdout: parsed.json
          ? JSON.stringify(result)
          : `Opened ${result.path} (session ${result.session_id}, revision ${result.revision}) in thread ${result.view_thread}; feedback returns to ${result.reply_thread}.\n${result.next_step}`,
      };
    }

    if (command === "reply") {
      const text = parsed.positionals.join(" ");
      if (text.length === 0) return { exitCode: 1, stderr: CLI_USAGES.reply };
      const session = openSessions()[0];
      if (session === undefined) {
        return { exitCode: 1, stderr: "no open Noted session for this thread" };
      }
      runtime.store.addReply(session.id, text);
      publish(runtime, session.id, requireRevision(runtime.store, session.id).id, "reply");
      return {
        exitCode: 0,
        stdout: parsed.json
          ? JSON.stringify({ ok: true, session_id: session.id })
          : `Reply added to ${await displayPathFor(runtime, session)}`,
      };
    }

    if (command === "status") {
      let sessions = openSessions();
      const file = parsed.positionals[0];
      if (file !== undefined) {
        const artifact = await resolveArtifact(
          runtime.bb.sdk,
          threadId,
          file,
          ctx.cwd,
          runtime.dataDir,
        );
        sessions = sessions.filter((session) => session.absolutePath === artifact.absolutePath);
      }
      const rows = await Promise.all(sessions.map(async (session) => {
        const batches = runtime.store.listBatches(session.id);
        const lastBatch = batches.at(-1);
        return {
          session_id: session.id,
          path: await displayPathFor(runtime, session),
          view_thread: session.viewThreadId,
          reply_thread: session.replyThreadId,
          revision: runtime.store.listRevisions(session.id).length,
          queued: runtime.store.listQueued(session.id).length,
          replies: runtime.store.listReplies(session.id).length,
          last_batch: lastBatch === undefined
            ? null
            : { delivery: lastBatch.delivery, sent_at: lastBatch.sentAt },
        };
      }));
      return {
        exitCode: 0,
        stdout: parsed.json
          ? JSON.stringify(rows)
          : rows.length === 0
            ? "No open Noted sessions."
            : rows.map((row) =>
              `${row.path}  session ${row.session_id}  rev ${row.revision}  queued ${row.queued}  replies ${row.replies}`
            ).join("\n"),
      };
    }

    if (command === "end") {
      const file = parsed.positionals[0];
      if (file === undefined) return { exitCode: 1, stderr: CLI_USAGES.end };
      const artifact = await resolveArtifact(
        runtime.bb.sdk,
        threadId,
        file,
        ctx.cwd,
        runtime.dataDir,
      );
      const session = runtime.store.findOpenSession(threadId, artifact.absolutePath);
      if (session === null) {
        return { exitCode: 1, stderr: `no open Noted session for ${file}` };
      }
      const revision = requireRevision(runtime.store, session.id);
      runtime.store.endSession(session.id, "agent");
      publish(runtime, session.id, revision.id, "ended");
      return { exitCode: 0, stdout: JSON.stringify({ ok: true }) };
    }

    const file = parsed.positionals[0];
    if (
      file === undefined
      || parsed.to === undefined
      || parsed.title === undefined
      || parsed.summary === undefined
    ) {
      return { exitCode: 1, stderr: CLI_USAGES.file };
    }
    const artifact = await resolveArtifact(
      runtime.bb.sdk,
      threadId,
      file,
      ctx.cwd,
      runtime.dataDir,
    );
    const source = await runtime.bb.sdk.files.read({
      hostId: artifact.hostId,
      path: artifact.absolutePath,
    });
    const html = decodeText(source.content, source.contentEncoding);
    const exported = await transformForExport(html, {
      readAsset: assetReaderFor(runtime, artifact.hostId, dirname(artifact.absolutePath)),
    });
    const now = new Date();
    const created = [
      String(now.getFullYear()).padStart(4, "0"),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
    ].join("");
    const slug = parsed.title.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "");
    const htmlName = `${created}_${slug}.html`;
    const noteName = `${created}_${slug}.md`;
    const htmlPath = join(parsed.to, htmlName);
    const notePath = join(parsed.to, noteName);
    await runtime.bb.sdk.files.write({
      hostId: artifact.hostId,
      path: htmlPath,
      rootPath: parsed.to,
      content: exported.html,
      expectedSha256: null,
    });
    await runtime.bb.sdk.files.write({
      hostId: artifact.hostId,
      path: notePath,
      rootPath: parsed.to,
      content: buildCompanionNote({
        title: parsed.title,
        created,
        summary: parsed.summary,
        htmlFileName: htmlName,
        threadId,
        profile: parsed.profile ?? "durable_research",
      }),
      expectedSha256: null,
    });
    const result = { html: htmlPath, note: notePath };
    return {
      exitCode: 0,
      stdout: parsed.json
        ? JSON.stringify(result)
        : `Filed ${result.html}\nNote ${result.note}`,
    };
  } catch (error) {
    return {
      exitCode: 1,
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

export default async function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  const store = openStore(db, (database, statements) => bb.storage.migrate(database, statements));
  const runtime: Runtime = { bb, store, dataDir: bb.server.experimental_dataDir };
  bb.cli.register({
    name: "noted",
    summary: "Review HTML artifacts with the user in the side panel (built on Lavish)",
    commands: [
      { name: "open", summary: "Open an HTML artifact for review", usage: CLI_USAGES.open },
      { name: "reply", summary: "Add a note to the current review", usage: CLI_USAGES.reply },
      { name: "status", summary: "List open review sessions", usage: CLI_USAGES.status },
      { name: "end", summary: "End an open review session", usage: CLI_USAGES.end },
      { name: "file", summary: "Export an artifact and companion note", usage: CLI_USAGES.file },
    ],
    run: (argv, ctx) => runNotedCli(runtime, argv, ctx),
  });


  const handlers = {
    openSession: (input) => openSessionCore(runtime, input),
    async getSession({ sessionId }) {
      const result = await sessionPayload(runtime, sessionId, "manual");
      if (result.changed) publish(runtime, sessionId, result.payload.revision.id, "revision");
      return result.payload;
    },
    listSessions({ threadId }) {
      return { sessions: store.listSessionsForThread(threadId) };
    },
    queuePrompt(input) {
      requireSession(store, input.sessionId);
      const revision = requireRevision(store, input.sessionId);
      const prompt = store.queuePrompt({
        ...input,
        revisionId: revision.id,
        target: input.target ?? null,
      });
      publish(runtime, input.sessionId, revision.id, "queue");
      return prompt;
    },
    updatePrompt({ id, prompt }) {
      store.updatePrompt(id, prompt);
      return { ok: true };
    },
    removePrompt({ id }) {
      store.removePrompt(id);
      return { ok: true };
    },
    clearQueue({ sessionId }) {
      requireSession(store, sessionId);
      const revision = requireRevision(store, sessionId);
      store.clearQueue(sessionId);
      publish(runtime, sessionId, revision.id, "queue");
      return { ok: true };
    },
    endSession({ sessionId, by }) {
      requireSession(store, sessionId);
      const revision = requireRevision(store, sessionId);
      store.endSession(sessionId, by);
      publish(runtime, sessionId, revision.id, "ended");
      return { ok: true };
    },
    setDeliveryMode({ sessionId, mode }) {
      requireSession(store, sessionId);
      const revision = requireRevision(store, sessionId);
      store.setDeliveryMode(sessionId, mode);
      publish(runtime, sessionId, revision.id, "queue");
      return { ok: true };
    },
    async send(input) {
      const session = requireSession(store, input.sessionId);
      const revision = requireRevision(store, session.id);
      const items = store.listQueued(session.id);
      const mode = input.mode
        ?? (session.deliveryMode === "steer" ? "steer-if-active" : "queue-if-active");
      const messageText = buildFeedbackMessage({
        displayPath: await displayPathFor(runtime, session),
        revisionNumber: store.listRevisions(session.id).length,
        items,
        freeform: input.freeform ?? null,
        endSession: input.endSession,
        reviewedInThreadId: session.viewThreadId === session.replyThreadId
          ? null
          : session.viewThreadId,
        replyThreadId: session.replyThreadId,
      });
      let batch;
      try {
        const result = await bb.sdk.threads.send({
          threadId: session.replyThreadId,
          mode,
          input: [{ type: "text", text: messageText, mentions: [] }],
        });
        batch = store.recordBatch({
          sessionId: session.id,
          revisionId: revision.id,
          items,
          messageText,
          mode,
          delivery: result.delivery,
          error: null,
        });
        store.clearQueue(session.id);
      } catch (error) {
        batch = store.recordBatch({
          sessionId: session.id,
          revisionId: revision.id,
          items,
          messageText,
          mode,
          delivery: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (input.endSession) store.endSession(session.id, "user");
      publish(runtime, session.id, revision.id, input.endSession ? "ended" : "batch");
      return { batch };
    },
  } satisfies PluginRpcHandlers<typeof rpcContract>;

  bb.rpc.register(rpcContract, handlers);
  bb.agents.contributeInstructions(({ threadId }) => {
    const sessions = store.listSessionsForThread(threadId).filter((session) =>
      session.status === "open" && session.replyThreadId === threadId
    );
    if (sessions.length === 0) return null;
    const details = sessions.map((session) =>
      `${session.absolutePath} (${store.listQueued(session.id).length} queued)`
    ).join("; ");
    return `Noted: ${sessions.length} open review session(s): ${details}.`;
  });


  bb.events.on("thread.idle", async ({ thread }) => {
    const sessions = store.listSessionsForThread(thread.id).filter((session) =>
      session.status === "open"
      && (session.producerThreadId === thread.id || session.replyThreadId === thread.id)
    );
    for (const session of sessions) {
      const captured = await captureRevision(runtime, session, "idle");
      if (captured.changed) publish(runtime, session.id, captured.revision.id, "revision");
    }
  });

  const endReplyThreadSessions = ({ thread }: { thread: { id: string } }) => {
    const sessions = store.listSessionsForThread(thread.id).filter((session) =>
      session.status === "open" && session.replyThreadId === thread.id
    );
    for (const session of sessions) {
      const revision = requireRevision(store, session.id);
      store.endSession(session.id, "agent");
      publish(runtime, session.id, revision.id, "ended");
    }
  };
  bb.events.on("thread.deleted", endReplyThreadSessions);
  bb.events.on("thread.archived", endReplyThreadSessions);

  bb.log.info("noted loaded");
  bb.onDispose(() => bb.log.info("noted disposed"));
}
