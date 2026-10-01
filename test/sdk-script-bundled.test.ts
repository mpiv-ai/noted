import { execFileSync } from "node:child_process";

import { build } from "esbuild";
import { JSDOM, VirtualConsole } from "jsdom";
import { describe, expect, it } from "vitest";

import { buildSdkScript } from "../lib/sdk-script";

// BB compiles server.ts itself, minified and with keepNames. Under keepNames,
// esbuild wraps every function in a module-level `__name` helper, so anything
// built from Function.prototype.toString() references a helper that does not
// exist inside the review iframe.
async function bundledBuildSdkScript(): Promise<typeof buildSdkScript> {
  const result = await build({
    entryPoints: [new URL("../lib/sdk-script.ts", import.meta.url).pathname],
    bundle: true,
    format: "esm",
    platform: "node",
    minify: true,
    keepNames: true,
    write: false,
  });
  const source = result.outputFiles[0]!.text;
  const url = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return ((await import(/* @vite-ignore */ url)) as { buildSdkScript: typeof buildSdkScript }).buildSdkScript;
}

function runInArtifact(script: string): { errors: string[]; annotating: boolean } {
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM(`<!doctype html><html><head></head><body><p id="p">Text</p>${script}</body></html>`, {
    runScripts: "dangerously",
    virtualConsole,
  });
  const annotating = dom.window.document.getElementById("lavish-cursor-style") !== null;
  dom.window.close();
  return { errors, annotating };
}

describe("buildSdkScript under BB's server bundler", () => {
  it("ships an SDK generated from the current vendor/lavish sources", () => {
    const script = new URL("../scripts/generate-lavish-sdk.mjs", import.meta.url).pathname;
    expect(() => execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("produces the same script as the unbundled module", async () => {
    const input = { key: "k", revision: 2, loadToken: "tok" };
    const bundled = await bundledBuildSdkScript();
    expect(bundled(input)).toBe(buildSdkScript(input));
  });

  it("initializes the SDK in annotation mode inside the artifact", async () => {
    const bundled = await bundledBuildSdkScript();
    const result = runInArtifact(bundled({ key: "k", revision: 2, loadToken: "tok" }));
    expect(result.errors).toEqual([]);
    expect(result.annotating).toBe(true);
  });
});
