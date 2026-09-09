import { definePluginApp } from "@get-bb/plugin-sdk/app";
import HtmlOpener from "./components/HtmlOpener";
import ReviewBanner from "./components/ReviewBanner";

import ReviewWindow from "./components/review/ReviewWindow";
import ReviewTab from "./components/review/ReviewTab";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "review-window", title: "Noted", icon: "MessageSquare", path: "review", component: ReviewWindow,
  });

  app.slots.threadPanelAction({
    id: "review",
    title: "Noted review",
    layout: "flush",
    component: ReviewTab,
  });

  app.composer.customize({
    id: "review-requested",
    banners: [
      {
        id: "review-requested",
        chrome: "bare",
        component: ReviewBanner,
      },
    ],
  });

  app.slots.fileOpener({
    id: "html",
    title: "Noted",
    extensions: ["html", "htm", "md", "markdown"],
    component: HtmlOpener,
  });
});
