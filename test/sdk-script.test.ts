import { describe, expect, it } from "vitest";
import { buildSdkScript } from "../lib/sdk-script";

describe("buildSdkScript", () => {
  it("embeds the session key, revision, and load token and parses as JS", () => {
    const script = buildSdkScript({ key: "abc123", revision: 3, loadToken: "tok-1" });
    expect(script.startsWith("<script>")).toBe(true);
    expect(script.endsWith("</script>")).toBe(true);
    const body = script.slice("<script>".length, -"</script>".length);
    expect(body).toContain('"abc123"');
    expect(body).toContain("artifactRevision=3");
    expect(body).toContain('"tok-1"');
    expect(() => new Function(body)).not.toThrow();
  });

  it("refuses a load token longer than 200 chars", () => {
    expect(() => buildSdkScript({ key: "k", revision: 0, loadToken: "x".repeat(201) })).toThrow(/load token/);
  });
});
