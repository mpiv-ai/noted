import { definePluginApp } from "@get-bb/plugin-sdk/app";

import ReviewTab from "./components/review/ReviewTab";

export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: "review",
    title: "Noted review",
    icon: "MessageSquare",
    layout: "flush",
    component: ReviewTab,
  });
});
