import { createHash } from "node:crypto";
import { dirname, extname, join, relative } from "node:path";
import type { BbPluginApi, PluginRpcHandlers } from "@get-bb/plugin-sdk";
import { transformForReview } from "./lib/html-transform";
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

type ChangeReason = "revision" | "queue" | "batch" | "reply" | "ended";

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
    readAsset: async (assetPath) => {
      try {
        const file = await runtime.bb.sdk.files.read({
          hostId: session.hostId ?? undefined,
          path: join(rootPath, assetPath),
        });
        return {
          bytes: Buffer.from(file.content, file.contentEncoding),
          mime: MIME_TYPES[extname(assetPath).toLowerCase()] ?? "application/octet-stream",
        };
      } catch {
        return null;
      }
    },
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
  const artifact = await resolveArtifact(
    runtime.bb.sdk,
    input.threadId,
    input.path,
    undefined,
    runtime.dataDir,
  );
  let session = runtime.store.findOpenSession(input.threadId, artifact.absolutePath);
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
  }

  const { payload } = await sessionPayload(runtime, session.id, "open");
  if (session.viewThreadId === input.threadId && session.sourceKind !== "host") {
    await runtime.bb.sdk.threads.open({
      threadId: session.viewThreadId,
      file: { path: payload.displayPath, source: session.sourceKind, lineNumber: null },
    });
  }
  publish(runtime, session.id, payload.revision.id, "queue");
  return payload;
}

export default async function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  const store = openStore(db, (database, statements) => bb.storage.migrate(database, statements));
  const runtime: Runtime = { bb, store, dataDir: bb.server.experimental_dataDir };

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
