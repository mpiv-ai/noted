import type { PluginNavPanelProps } from "@get-bb/plugin-sdk/app";
import ReviewTab from "./ReviewTab";

export default function ReviewWindow({ subPath }: PluginNavPanelProps) {
  if (!subPath || subPath.includes("/")) {
    return <p className="p-4">Open a review from a thread, then choose New window.</p>;
  }
  let sessionId: string;
  try {
    sessionId = decodeURIComponent(subPath);
  } catch {
    return <p role="alert" className="p-4">This review link is invalid.</p>;
  }
  return <ReviewTab threadId="" params={{ sessionId }} standalone />;
}
