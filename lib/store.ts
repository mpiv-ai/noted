import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export const MIGRATIONS: string[] = [
  `CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    producer_thread_id TEXT NOT NULL,
    view_thread_id TEXT NOT NULL,
    reply_thread_id TEXT NOT NULL,
    project_id TEXT,
    host_id TEXT,
    absolute_path TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    status TEXT NOT NULL,
    ended_by TEXT,
    delivery_mode TEXT NOT NULL DEFAULT 'default',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX sessions_open ON sessions(producer_thread_id, absolute_path) WHERE status = 'open';
  CREATE INDEX sessions_view_thread ON sessions(view_thread_id);
  CREATE INDEX sessions_reply_thread ON sessions(reply_thread_id);`,
  `CREATE TABLE revisions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    recorded_at INTEGER NOT NULL,
    trigger TEXT NOT NULL
  );`,
  `CREATE TABLE queued_prompts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    uid TEXT NOT NULL,
    prompt TEXT NOT NULL,
    selector TEXT NOT NULL,
    tag TEXT NOT NULL,
    text TEXT NOT NULL,
    target_json TEXT,
    created_at INTEGER NOT NULL
  );`,
  `CREATE TABLE feedback_batches (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    items_json TEXT NOT NULL,
    message_text TEXT NOT NULL,
    mode TEXT NOT NULL,
    delivery TEXT NOT NULL,
    error TEXT,
    sent_at INTEGER NOT NULL
  );`,
  `CREATE TABLE agent_replies (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );`,
];

export type SourceKind = "workspace" | "thread-storage" | "host";
export type DeliveryMode = "default" | "queue" | "steer";

export type Session = {
  id: string;
  producerThreadId: string;
  viewThreadId: string;
  replyThreadId: string;
  projectId: string | null;
  hostId: string | null;
  absolutePath: string;
  sourceKind: SourceKind;
  status: "open" | "ended";
  endedBy: "user" | "agent" | null;
  deliveryMode: DeliveryMode;
  createdAt: number;
  updatedAt: number;
};

export type Revision = {
  id: string;
  sessionId: string;
  sha256: string;
  sizeBytes: number;
  recordedAt: number;
  trigger: "open" | "idle" | "manual";
};

export type QueuedPrompt = {
  id: string;
  sessionId: string;
  revisionId: string;
  uid: string;
  prompt: string;
  selector: string;
  tag: string;
  text: string;
  target: unknown | null;
  createdAt: number;
};

export type Batch = {
  id: string;
  sessionId: string;
  revisionId: string;
  items: QueuedPrompt[];
  messageText: string;
  mode: string;
  delivery: "sent" | "queued" | "deferred" | "failed";
  error: string | null;
  sentAt: number;
};

export type Reply = {
  id: string;
  sessionId: string;
  text: string;
  createdAt: number;
};

export type Store = {
  createSession(input: {
    producerThreadId: string;
    viewThreadId: string;
    replyThreadId: string;
    projectId: string | null;
    hostId: string | null;
    absolutePath: string;
    sourceKind: SourceKind;
  }): Session;
  findOpenSession(producerThreadId: string, absolutePath: string): Session | null;
  getSession(id: string): Session | null;
  listSessionsForThread(threadId: string): Session[];
  endSession(id: string, by: "user" | "agent"): void;
  setDeliveryMode(id: string, mode: DeliveryMode): void;
  updateRoles(id: string, roles: { viewThreadId: string; replyThreadId: string }): void;
  addRevision(sessionId: string, sha256: string, sizeBytes: number, trigger: Revision["trigger"]): Revision;
  latestRevision(sessionId: string): Revision | null;
  listRevisions(sessionId: string): Revision[];
  queuePrompt(input: {
    sessionId: string;
    revisionId: string;
    uid: string;
    prompt: string;
    selector: string;
    tag: string;
    text: string;
    target: unknown | null;
  }): QueuedPrompt;
  updatePrompt(id: string, prompt: string): void;
  removePrompt(id: string): void;
  listQueued(sessionId: string): QueuedPrompt[];
  clearQueue(sessionId: string): void;
  recordBatch(input: {
    sessionId: string;
    revisionId: string;
    items: QueuedPrompt[];
    messageText: string;
    mode: string;
    delivery: Batch["delivery"];
    error: string | null;
  }): Batch;
  listBatches(sessionId: string): Batch[];
  addReply(sessionId: string, text: string): Reply;
  listReplies(sessionId: string): Reply[];
};

type SessionRow = {
  id: string;
  producer_thread_id: string;
  view_thread_id: string;
  reply_thread_id: string;
  project_id: string | null;
  host_id: string | null;
  absolute_path: string;
  source_kind: SourceKind;
  status: Session["status"];
  ended_by: Session["endedBy"];
  delivery_mode: DeliveryMode;
  created_at: number;
  updated_at: number;
};

type RevisionRow = {
  id: string;
  session_id: string;
  sha256: string;
  size_bytes: number;
  recorded_at: number;
  trigger: Revision["trigger"];
};

type QueuedPromptRow = {
  id: string;
  session_id: string;
  revision_id: string;
  uid: string;
  prompt: string;
  selector: string;
  tag: string;
  text: string;
  target_json: string | null;
  created_at: number;
};

type BatchRow = {
  id: string;
  session_id: string;
  revision_id: string;
  items_json: string;
  message_text: string;
  mode: string;
  delivery: Batch["delivery"];
  error: string | null;
  sent_at: number;
};

type ReplyRow = {
  id: string;
  session_id: string;
  text: string;
  created_at: number;
};

function mapSession(row: SessionRow): Session {
  return {
    id: row.id,
    producerThreadId: row.producer_thread_id,
    viewThreadId: row.view_thread_id,
    replyThreadId: row.reply_thread_id,
    projectId: row.project_id,
    hostId: row.host_id,
    absolutePath: row.absolute_path,
    sourceKind: row.source_kind,
    status: row.status,
    endedBy: row.ended_by,
    deliveryMode: row.delivery_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRevision(row: RevisionRow): Revision {
  return {
    id: row.id,
    sessionId: row.session_id,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    recordedAt: row.recorded_at,
    trigger: row.trigger,
  };
}

function mapQueuedPrompt(row: QueuedPromptRow): QueuedPrompt {
  return {
    id: row.id,
    sessionId: row.session_id,
    revisionId: row.revision_id,
    uid: row.uid,
    prompt: row.prompt,
    selector: row.selector,
    tag: row.tag,
    text: row.text,
    target: row.target_json === null ? null : JSON.parse(row.target_json),
    createdAt: row.created_at,
  };
}

function mapBatch(row: BatchRow): Batch {
  return {
    id: row.id,
    sessionId: row.session_id,
    revisionId: row.revision_id,
    items: JSON.parse(row.items_json),
    messageText: row.message_text,
    mode: row.mode,
    delivery: row.delivery,
    error: row.error,
    sentAt: row.sent_at,
  };
}

function mapReply(row: ReplyRow): Reply {
  return {
    id: row.id,
    sessionId: row.session_id,
    text: row.text,
    createdAt: row.created_at,
  };
}

export function openStore(
  db: Database.Database,
  migrate: (db: Database.Database, statements: string[]) => void,
): Store {
  migrate(db, MIGRATIONS);

  const insertSession = db.prepare<[
    string,
    string,
    string,
    string,
    string | null,
    string | null,
    string,
    SourceKind,
    number,
    number,
  ]>(`INSERT INTO sessions (
    id, producer_thread_id, view_thread_id, reply_thread_id, project_id, host_id,
    absolute_path, source_kind, status, ended_by, delivery_mode, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, 'default', ?, ?)`);
  const findOpenSession = db.prepare<[string, string], SessionRow>(
    "SELECT * FROM sessions WHERE producer_thread_id = ? AND absolute_path = ? AND status = 'open'",
  );
  const getSession = db.prepare<[string], SessionRow>("SELECT * FROM sessions WHERE id = ?");
  const listSessionsForThread = db.prepare<[string, string, string], SessionRow>(
    `SELECT * FROM sessions
     WHERE producer_thread_id = ? OR view_thread_id = ? OR reply_thread_id = ?
     ORDER BY rowid ASC`,
  );
  const endSession = db.prepare<["user" | "agent", number, string]>(
    "UPDATE sessions SET status = 'ended', ended_by = ?, updated_at = ? WHERE id = ?",
  );
  const setDeliveryMode = db.prepare<[DeliveryMode, number, string]>(
    "UPDATE sessions SET delivery_mode = ?, updated_at = ? WHERE id = ?",
  );
  const updateRoles = db.prepare<[string, string, number, string]>(
    "UPDATE sessions SET view_thread_id = ?, reply_thread_id = ?, updated_at = ? WHERE id = ?",
  );

  const insertRevision = db.prepare<[string, string, string, number, number, Revision["trigger"]]>(
    `INSERT INTO revisions (id, session_id, sha256, size_bytes, recorded_at, trigger)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const latestRevision = db.prepare<[string], RevisionRow>(
    "SELECT * FROM revisions WHERE session_id = ? ORDER BY rowid DESC LIMIT 1",
  );
  const listRevisions = db.prepare<[string], RevisionRow>(
    "SELECT * FROM revisions WHERE session_id = ? ORDER BY rowid ASC",
  );

  const insertPrompt = db.prepare<[
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string | null,
    number,
  ]>(`INSERT INTO queued_prompts (
    id, session_id, revision_id, uid, prompt, selector, tag, text, target_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const updatePrompt = db.prepare<[string, string]>("UPDATE queued_prompts SET prompt = ? WHERE id = ?");
  const removePrompt = db.prepare<[string]>("DELETE FROM queued_prompts WHERE id = ?");
  const listQueued = db.prepare<[string], QueuedPromptRow>(
    "SELECT * FROM queued_prompts WHERE session_id = ? ORDER BY rowid ASC",
  );
  const clearQueue = db.prepare<[string]>("DELETE FROM queued_prompts WHERE session_id = ?");

  const insertBatch = db.prepare<[
    string,
    string,
    string,
    string,
    string,
    string,
    Batch["delivery"],
    string | null,
    number,
  ]>(`INSERT INTO feedback_batches (
    id, session_id, revision_id, items_json, message_text, mode, delivery, error, sent_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const listBatches = db.prepare<[string], BatchRow>(
    "SELECT * FROM feedback_batches WHERE session_id = ? ORDER BY rowid ASC",
  );

  const insertReply = db.prepare<[string, string, string, number]>(
    "INSERT INTO agent_replies (id, session_id, text, created_at) VALUES (?, ?, ?, ?)",
  );
  const listReplies = db.prepare<[string], ReplyRow>(
    "SELECT * FROM agent_replies WHERE session_id = ? ORDER BY rowid ASC",
  );

  return {
    createSession(input) {
      const now = Date.now();
      const session: Session = {
        id: randomUUID().slice(0, 12),
        ...input,
        status: "open",
        endedBy: null,
        deliveryMode: "default",
        createdAt: now,
        updatedAt: now,
      };
      try {
        insertSession.run(
          session.id,
          session.producerThreadId,
          session.viewThreadId,
          session.replyThreadId,
          session.projectId,
          session.hostId,
          session.absolutePath,
          session.sourceKind,
          session.createdAt,
          session.updatedAt,
        );
      } catch (error) {
        if (
          error instanceof Error
          && error.message.includes("UNIQUE constraint failed: sessions.producer_thread_id, sessions.absolute_path")
        ) {
          throw new Error("session already open for this path");
        }
        throw error;
      }
      return session;
    },
    findOpenSession(producerThreadId, absolutePath) {
      const row = findOpenSession.get(producerThreadId, absolutePath);
      return row === undefined ? null : mapSession(row);
    },
    getSession(id) {
      const row = getSession.get(id);
      return row === undefined ? null : mapSession(row);
    },
    listSessionsForThread(threadId) {
      return listSessionsForThread.all(threadId, threadId, threadId).map(mapSession);
    },
    endSession(id, by) {
      endSession.run(by, Date.now(), id);
    },
    setDeliveryMode(id, mode) {
      setDeliveryMode.run(mode, Date.now(), id);
    },
    updateRoles(id, roles) {
      updateRoles.run(roles.viewThreadId, roles.replyThreadId, Date.now(), id);
    },
    addRevision(sessionId, sha256, sizeBytes, trigger) {
      const revision: Revision = {
        id: randomUUID().slice(0, 12),
        sessionId,
        sha256,
        sizeBytes,
        recordedAt: Date.now(),
        trigger,
      };
      insertRevision.run(
        revision.id,
        revision.sessionId,
        revision.sha256,
        revision.sizeBytes,
        revision.recordedAt,
        revision.trigger,
      );
      return revision;
    },
    latestRevision(sessionId) {
      const row = latestRevision.get(sessionId);
      return row === undefined ? null : mapRevision(row);
    },
    listRevisions(sessionId) {
      return listRevisions.all(sessionId).map(mapRevision);
    },
    queuePrompt(input) {
      const queuedPrompt: QueuedPrompt = {
        id: randomUUID().slice(0, 12),
        ...input,
        createdAt: Date.now(),
      };
      insertPrompt.run(
        queuedPrompt.id,
        queuedPrompt.sessionId,
        queuedPrompt.revisionId,
        queuedPrompt.uid,
        queuedPrompt.prompt,
        queuedPrompt.selector,
        queuedPrompt.tag,
        queuedPrompt.text,
        queuedPrompt.target === null ? null : JSON.stringify(queuedPrompt.target),
        queuedPrompt.createdAt,
      );
      return queuedPrompt;
    },
    updatePrompt(id, prompt) {
      updatePrompt.run(prompt, id);
    },
    removePrompt(id) {
      removePrompt.run(id);
    },
    listQueued(sessionId) {
      return listQueued.all(sessionId).map(mapQueuedPrompt);
    },
    clearQueue(sessionId) {
      clearQueue.run(sessionId);
    },
    recordBatch(input) {
      const batch: Batch = {
        id: randomUUID().slice(0, 12),
        ...input,
        sentAt: Date.now(),
      };
      insertBatch.run(
        batch.id,
        batch.sessionId,
        batch.revisionId,
        JSON.stringify(batch.items),
        batch.messageText,
        batch.mode,
        batch.delivery,
        batch.error,
        batch.sentAt,
      );
      return batch;
    },
    listBatches(sessionId) {
      return listBatches.all(sessionId).map(mapBatch);
    },
    addReply(sessionId, text) {
      const reply: Reply = {
        id: randomUUID().slice(0, 12),
        sessionId,
        text,
        createdAt: Date.now(),
      };
      insertReply.run(reply.id, reply.sessionId, reply.text, reply.createdAt);
      return reply;
    },
    listReplies(sessionId) {
      return listReplies.all(sessionId).map(mapReply);
    },
  };
}
