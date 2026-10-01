import type { RefObject } from "react";

export function ArtifactFrame({
  srcdoc,
  title,
  frameRef,
  onLoad,
}: {
  srcdoc: string;
  title: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
  onLoad?: () => void;
}) {
  return (
    <div className="flex-1 min-h-0">
      <iframe
        ref={frameRef}
        title={title}
        sandbox="allow-scripts allow-popups"
        srcDoc={srcdoc}
        onLoad={onLoad}
        className="block h-full w-full border-0 bg-background"
      />
    </div>
  );
}
