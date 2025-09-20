import { DashboardState } from "./state.js";
import { clear, el, showToast } from "./ui.js";
import { renderHome } from "./pages/home.js";
import { renderWelcome } from "./pages/welcome.js";
import { renderGuideline } from "./pages/guideline.js";
import { renderVerify } from "./pages/verify.js";
import { renderRoles } from "./pages/roles.js";
import { renderIntroduce } from "./pages/introduce.js";
import { renderScrims } from "./pages/scrims.js";
import { renderAudit } from "./pages/audit.js";
import { renderSettings } from "./pages/settings.js";

const state = new DashboardState();

const routes = [
  { path: "#/home", label: "接続", render: renderHome },
  { path: "#/welcome", label: "Welcome", render: renderWelcome },
  { path: "#/guideline", label: "ガイドラインDM", render: renderGuideline },
  { path: "#/verify", label: "Verify", render: renderVerify },
  { path: "#/roles", label: "ロール配布", render: renderRoles },
  { path: "#/introduce", label: "自己紹介", render: renderIntroduce },
  { path: "#/scrims", label: "スクリム", render: renderScrims },
  { path: "#/audit", label: "監査ログ", render: renderAudit },
  { path: "#/settings", label: "共通設定", render: renderSettings },
];

const routeMap = new Map(routes.map((route) => [route.path, route]));

function ensureHash() {
  if (!window.location.hash) {
    window.location.hash = "#/home";
  }
}

function renderNav() {
  const nav = document.getElementById("nav");
  clear(nav);
  routes.forEach((route) => {
    const link = el(
      "a",
      {
        href: route.path,
        className: "nav-link",
      },
      route.label,
    );
    nav.appendChild(link);
  });
}

function highlightNav(hash) {
  const nav = document.getElementById("nav");
  nav.querySelectorAll("a").forEach((anchor) => {
    if (anchor.getAttribute("href") === hash) {
      anchor.classList.add("active");
    } else {
      anchor.classList.remove("active");
    }
  });
}

async function renderRoute() {
  ensureHash();
  const hash = window.location.hash;
  const route = routeMap.get(hash) || routes[0];
  highlightNav(route.path);

  const root = document.getElementById("app");
  clear(root);

  try {
    await route.render({ state, root, showToast });
  } catch (error) {
    console.error(error);
    const panel = el("section", { className: "panel error" });
    panel.appendChild(el("h2", { textContent: "エラー" }));
    panel.appendChild(el("p", { textContent: error.message || "処理中に問題が発生しました。" }));
    root.appendChild(panel);
  }
}

window.addEventListener("hashchange", () => {
  renderRoute().catch((error) => console.error("render failed", error));
});

document.addEventListener("DOMContentLoaded", () => {
  renderNav();
  renderRoute().catch((error) => console.error("render failed", error));
});
