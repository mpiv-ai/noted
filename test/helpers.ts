import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";

export const html = `<html><body><p id="a">Hi</p></body></html>`;

export function host(sendImpl: (args: unknown) => Promise<unknown> = async () => ({ ok: true, delivery: "sent" })) {
  let content = html;
  const h = createFakePluginHost({
    pluginId: "noted",
    dataDir: "/tmp/noted-test-data",
    sdk: {
      threads: {
        get: async ({ threadId }: { threadId: string }) => ({ id: threadId, parentThreadId: threadId === "thr_loops" ? "thr_michael" : null, environmentId: "env_1", projectId: "proj_1" }),
        send: sendImpl,
        open: async () => ({ delivered: 1 }),
      },
      environments: { get: async () => ({ id: "env_1", hostId: "host_1", path: "/repo" }) },
      files: {
        read: async () => ({ content, contentEncoding: "utf8", sha256: String(content.length), sizeBytes: content.length }),
        createPreview: async () => ({ baseUrl: "/api/v1/file-previews/x", expiresAtMs: 0 }),
      },
    },
  });
  return { ...h, setContent: (c: string) => { content = c; } };
}
