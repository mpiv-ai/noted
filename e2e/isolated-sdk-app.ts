import { createElement, useEffect, type ComponentPropsWithoutRef } from "react";

type RpcInput = Record<string, unknown>;

// The isolated harness cannot reproduce BB's native file context menu.
export function experimental_FileLink({ target: _target, ...props }: Omit<ComponentPropsWithoutRef<"a">, "target"> & { target: unknown }) {
  return createElement("a", { ...props, href: "#" });
}

declare global {
  interface Window {
    __notedIsolatedRpc: {
      call: (method: string, input: RpcInput) => Promise<unknown>;
    };
  }
}

/** Minimal browser-only stand-in for the Plugin SDK app hooks. */
export function useRpc<T>() {
  void (undefined as T | undefined);
  return window.__notedIsolatedRpc;
}

/** BroadcastChannel models the session-changed signal between isolated windows. */
export function useRealtime(channel: string, callback: (payload: unknown) => void) {
  useEffect(() => {
    const broadcast = new BroadcastChannel("noted-isolated-realtime");
    const onMessage = (event: MessageEvent<{ channel?: string; payload?: unknown }>) => {
      if (event.data?.channel === channel) callback(event.data.payload);
    };
    broadcast.addEventListener("message", onMessage);
    return () => {
      broadcast.removeEventListener("message", onMessage);
      broadcast.close();
    };
  }, [channel, callback]);
}
