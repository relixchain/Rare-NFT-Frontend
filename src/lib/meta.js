const DEFAULTS = {
  siteName: "Rare NFT",
  // ✅ OSS-safe: no hardcoded private domain
  baseUrl:
    (typeof window !== "undefined" && window.__SITE_URL__) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SITE_URL) ||
    (typeof window !== "undefined" ? window.location.origin : ""),
  description: "Create, buy, sell, and trade NFTs on BSC & Relix Smart Chain.",
  // ✅ OSS-safe: relative path (works on any domain)
  ogImage:
    (typeof window !== "undefined" && window.__OG_IMAGE__) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_OG_IMAGE) ||
    "/og-image.png",
  twitterCard: "summary_large_image",
};

function upsertMeta(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
}

function upsertLink(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("link");
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
}

function normalizeBaseUrl(s) {
  return String(s || "").replace(/\/+$/, "");
}

function ensureAbsoluteUrl(baseUrl, maybeRelative) {
  const v = String(maybeRelative || "");
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const b = normalizeBaseUrl(baseUrl);
  return b ? `${b}${v.startsWith("/") ? "" : "/"}${v}` : v;
}

export function setPageMeta({ title, description, url, image, noIndex = false } = {}) {
  if (typeof document === "undefined") return;

  const base = normalizeBaseUrl(DEFAULTS.baseUrl);
  const t = title ? `${title} — ${DEFAULTS.siteName}` : DEFAULTS.siteName;
  const d = description || DEFAULTS.description;

  // ✅ canonical URL: if caller doesn't provide, derive from current origin
  const u =
    url ||
    (base ? `${base}${window.location?.pathname || "/"}` : window.location?.href || "");

  // ✅ og image: allow relative path but convert to absolute for crawlers
  const img = ensureAbsoluteUrl(base || window.location.origin, image || DEFAULTS.ogImage);

  document.title = t;

  upsertMeta('meta[name="description"]', { name: "description", content: d });
  if (u) upsertLink('link[rel="canonical"]', { rel: "canonical", href: u });

  upsertMeta('meta[property="og:title"]', { property: "og:title", content: t });
  upsertMeta('meta[property="og:description"]', { property: "og:description", content: d });
  if (u) upsertMeta('meta[property="og:url"]', { property: "og:url", content: u });
  upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
  if (img) upsertMeta('meta[property="og:image"]', { property: "og:image", content: img });

  upsertMeta('meta[name="twitter:card"]', {
    name: "twitter:card",
    content: DEFAULTS.twitterCard,
  });
  upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: t });
  upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: d });
  if (img) upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: img });

  upsertMeta('meta[name="robots"]', {
    name: "robots",
    content: noIndex ? "noindex,nofollow" : "index,follow",
  });
}
