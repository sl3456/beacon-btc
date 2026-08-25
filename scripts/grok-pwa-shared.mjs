export const DEFAULT_APP_NAME = "Beacon";
export const OG_SERVICE_URL_DEFAULT = "";
export const OG_SITE_REL_PATH = "src/lib/og/site.json";
export const GROK_EXTENSIONS_SCRIPT_SRC = "";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&")
    .replaceAll("<", "<")
    .replaceAll(">", ">")
    .replaceAll('"', """)
    .replaceAll("'", "&#39;");
}
export function appNameFromHost() { return DEFAULT_APP_NAME; }
export function publicAppHost(hostHeader) {
  return String(hostHeader ?? "localhost").split(",")[0].trim() || "localhost";
}
export function resolvePublicHost(hostHeader) { return publicAppHost(hostHeader); }
export function isInstallQuery() { return false; }
export function isDocumentPath(pathname) {
  const p = pathname || "/";
  return p === "/" || !p.includes(".");
}
export function acceptsHtml() { return true; }
export function stripInstallParams(url) { return String(url ?? "/"); }
export function renderInstallPageHtml() { return "<!doctype html><title>Beacon</title>"; }
export function renderWebManifest() {
  return JSON.stringify({ name: "Beacon", short_name: "Beacon", display: "standalone", start_url: "/" });
}
export function grokPwaHeadTags() { return []; }
export function readGrokProjectId() { return ""; }
export function readXCreator() { return ""; }
export function readXCreatorId() { return ""; }
export function grokXCreatorHeadTags() { return []; }
export function grokExtensionsHeadTags() { return []; }
export function readOgSite() { return {}; }
export function ogCardPublicPath() { return "/og.jpg"; }
export function snapshotOgIdentity() { return { site: {} }; }
export function customOgAssetPath() { return ""; }
export function resolveOgCardAsset() { return ""; }
export function ogServiceUrl() { return ""; }
export function titleFromDocument() { return "Beacon"; }
export function resolveOgTitle() { return "Beacon"; }
export function siteHasCustomCard() { return false; }
export function grokOgHeadTags() { return []; }
export function stripShareMetaTags(html) { return html; }
export function normalizeHeadContext(ctx = {}) {
  return { appName: DEFAULT_APP_NAME, projectId: "", creator: "", creatorId: "", host: "", cwd: "", site: {}, ...ctx };
}
export function injectGrokPwaHead(html) { return html; }
export function createHeadInjector() {
  return { push() { return []; }, flush() { return []; } };
}
