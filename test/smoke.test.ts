import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../server";

describe("noted plugin", () => {
  it("loads and disposes cleanly", async () => {
    const { bb, harness } = createFakePluginHost({ pluginId: "noted" });
    await plugin(bb);
    expect(JSON.stringify(harness.logEntries)).toContain("noted loaded");
    await harness.lifecycle.dispose();
    expect(JSON.stringify(harness.logEntries)).toContain("noted disposed");
  });
});
