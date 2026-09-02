import { useCallback, useEffect, useState } from "react";
import type { RefObject } from "react";

export type BridgeEvent = {
  at: number;
  data: {
    type: string;
    artifact_load_token?: string;
    [key: string]: unknown;
  };
};

type BridgeMessage = BridgeEvent["data"];

function isBridgeMessage(value: unknown): value is BridgeMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    value.type.startsWith("lavish:") &&
    (!("artifact_load_token" in value) ||
      typeof value.artifact_load_token === "string")
  );
}

export function useArtifactBridge(
  frameRef: RefObject<HTMLIFrameElement | null>,
  loadToken: string | null,
): {
  events: BridgeEvent[];
  post: (message: { type: string; [key: string]: unknown }) => void;
  clear: () => void;
} {
  const [events, setEvents] = useState<BridgeEvent[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      const frameWindow = frameRef.current?.contentWindow;
      const data = event.data;
      if (
        frameWindow === null ||
        frameWindow === undefined ||
        event.source !== frameWindow ||
        !isBridgeMessage(data) ||
        data.artifact_load_token !== loadToken
      ) {
        return;
      }

      setEvents((current) => [...current, { at: Date.now(), data }]);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [frameRef, loadToken]);

  const post = useCallback(
    (message: { type: string; [key: string]: unknown }) => {
      frameRef.current?.contentWindow?.postMessage(message, "*");
    },
    [frameRef],
  );

  const clear = useCallback(() => setEvents([]), []);

  return { events, post, clear };
}
