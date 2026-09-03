import { definePluginApp } from "@get-bb/plugin-sdk/app";
import HtmlOpener from "./components/HtmlOpener";
import ReviewBanner from "./components/ReviewBanner";

import ReviewTab from "./components/review/ReviewTab";

export default definePluginApp((app) => {
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
    extensions: ["html", "htm"],
    component: HtmlOpener,
  });
});
