import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("noted loaded");
  bb.onDispose(() => bb.log.info("noted disposed"));
}
