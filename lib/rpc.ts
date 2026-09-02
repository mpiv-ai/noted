import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const sessionSchema = z.object({
  id: z.string(),
  producerThreadId: z.string(),
  viewThreadId: z.string(),
  replyThreadId: z.string(),
  projectId: z.string().nullable(),
  hostId: z.string().nullable(),
  absolutePath: z.string(),
  sourceKind: z.enum(["workspace", "thread-storage", "host"]),
  status: z.enum(["open", "ended"]),
  endedBy: z.enum(["user", "agent"]).nullable(),
  deliveryMode: z.enum(["default", "queue", "steer"]),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const revisionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  sha256: z.string(),
  sizeBytes: z.number(),
  recordedAt: z.number(),
  trigger: z.enum(["open", "idle", "manual"]),
});

const queuedPromptSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  revisionId: z.string(),
  uid: z.string(),
  prompt: z.string(),
  selector: z.string(),
  tag: z.string(),
  text: z.string(),
  target: z.unknown().nullable(),
  createdAt: z.number(),
});

const batchSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  revisionId: z.string(),
  items: z.array(queuedPromptSchema),
  messageText: z.string(),
  mode: z.string(),
  delivery: z.enum(["sent", "queued", "deferred", "failed"]),
  error: z.string().nullable(),
  sentAt: z.number(),
});

const replySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  text: z.string(),
  createdAt: z.number(),
});

const sessionPayloadSchema = z.object({
  session: sessionSchema,
  revision: revisionSchema,
  revisionNumber: z.number(),
  displayPath: z.string(),
  document: z.object({
    srcdoc: z.string(),
    inlined: z.array(z.string()),
    linked: z.array(z.string()),
    skipped: z.array(z.object({ path: z.string(), reason: z.string() })),
  }),
  queued: z.array(queuedPromptSchema),
  batches: z.array(batchSchema),
  replies: z.array(replySchema),
});

const okSchema = z.object({ ok: z.literal(true) });
const sendModeSchema = z.enum(["queue-if-active", "steer-if-active", "steer", "start", "auto"]);

export const rpcContract = defineRpcContract({
  openSession: {
    input: z.object({
      threadId: z.string(),
      path: z.string(),
      view: z.string().optional(),
      replyTo: z.string().optional(),
      reopen: z.boolean().optional(),
    }).strict(),
    output: sessionPayloadSchema,
  },
  getSession: {
    input: z.object({ sessionId: z.string() }).strict(),
    output: sessionPayloadSchema,
  },
  listSessions: {
    input: z.object({ threadId: z.string() }).strict(),
    output: z.object({ sessions: z.array(sessionSchema) }),
  },
  queuePrompt: {
    input: z.object({
      sessionId: z.string(),
      uid: z.string(),
      prompt: z.string(),
      selector: z.string(),
      tag: z.string(),
      text: z.string(),
      target: z.unknown().nullable().optional(),
    }).strict(),
    output: queuedPromptSchema,
  },
  updatePrompt: {
    input: z.object({ id: z.string(), prompt: z.string() }).strict(),
    output: okSchema,
  },
  removePrompt: {
    input: z.object({ id: z.string() }).strict(),
    output: okSchema,
  },
  clearQueue: {
    input: z.object({ sessionId: z.string() }).strict(),
    output: okSchema,
  },
  endSession: {
    input: z.object({ sessionId: z.string(), by: z.enum(["user", "agent"]) }).strict(),
    output: okSchema,
  },
  setDeliveryMode: {
    input: z.object({ sessionId: z.string(), mode: z.enum(["default", "queue", "steer"]) }).strict(),
    output: okSchema,
  },
  send: {
    input: z.object({
      sessionId: z.string(),
      freeform: z.string().optional(),
      mode: sendModeSchema.optional(),
      endSession: z.boolean(),
    }).strict(),
    output: z.object({ batch: batchSchema }),
  },
});

export type OpenSessionInput = z.infer<typeof rpcContract.openSession.input>;
