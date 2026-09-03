import { isAbsolute, join, normalize, relative, resolve as resolvePath, sep } from "node:path";

export type ResolveSdk = {
  threads: {
    get(args: { threadId: string }): Promise<{
      id: string;
      parentThreadId: string | null;
      environmentId: string | null;
    }>;
    storageLocation(args: { threadId: string }): Promise<{
      hostId: string;
      storageRootPath: string;
    }>;
  };
  environments: {
    get(args: { environmentId: string }): Promise<{
      id: string;
      hostId: string;
      path: string | null;
    }>;
  };
};

export type SourceKind = "workspace" | "thread-storage" | "host";

export type ResolvedArtifact = {
  hostId: string | undefined;
  absolutePath: string;
  sourceKind: SourceKind;
  displayPath: string;
};

export function relativePathWithinRoot(rootPath: string, absolutePath: string): string {
  const displayPath = relative(rootPath, absolutePath);
  if (
    displayPath === ""
    || displayPath === ".."
    || displayPath.startsWith(`..${sep}`)
    || isAbsolute(displayPath)
  ) {
    throw new Error("artifact path is outside thread storage");
  }
  return displayPath;
}

export async function resolveRole(
  sdk: ResolveSdk,
  callerThreadId: string,
  spec: string | undefined,
): Promise<string> {
  if (spec === undefined || spec === "self") {
    return callerThreadId;
  }

  if (spec === "parent") {
    const thread = await sdk.threads.get({ threadId: callerThreadId });
    if (thread.parentThreadId === null) {
      throw new Error(`thread ${callerThreadId} has no parent`);
    }
    return thread.parentThreadId;
  }

  await sdk.threads.get({ threadId: spec });
  return spec;
}

export async function resolveArtifact(
  sdk: ResolveSdk,
  threadId: string,
  file: string,
  cwd: string | undefined,
  dataDir: string,
  source?: SourceKind,
): Promise<ResolvedArtifact> {
  const thread = await sdk.threads.get({ threadId });
  const env = thread.environmentId
    ? await sdk.environments.get({ environmentId: thread.environmentId })
    : null;
  const hostId = env?.hostId;

  if (source === "thread-storage") {
    const storage = await sdk.threads.storageLocation({ threadId });
    const absolutePath = isAbsolute(file)
      ? normalize(file)
      : resolvePath(storage.storageRootPath, file);
    const displayPath = relativePathWithinRoot(storage.storageRootPath, absolutePath);
    return {
      hostId: storage.hostId,
      absolutePath,
      sourceKind: "thread-storage",
      displayPath,
    };
  }

  if (isAbsolute(file)) {
    const threadStorageRoot = join(dataDir, "thread-storage", threadId);
    if (file.startsWith(`${threadStorageRoot}${sep}`)) {
      return {
        hostId: undefined,
        absolutePath: file,
        sourceKind: "thread-storage",
        displayPath: relative(threadStorageRoot, file),
      };
    }

    return {
      hostId,
      absolutePath: file,
      sourceKind: "host",
      displayPath: file,
    };
  }

  if (typeof env?.path === "string") {
    return {
      hostId,
      absolutePath: join(env.path, file),
      sourceKind: "workspace",
      displayPath: normalize(file),
    };
  }

  if (typeof cwd === "string") {
    const absolutePath = join(cwd, file);
    return {
      hostId,
      absolutePath,
      sourceKind: "host",
      displayPath: absolutePath,
    };
  }

  throw new Error("cannot resolve a relative path without a workspace or cwd");
}
