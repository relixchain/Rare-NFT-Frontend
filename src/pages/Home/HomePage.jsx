// src/pages/Home/HomePage.jsx
/* cspell:ignore RELIX Relix tRLX RARE wagmi Multichain */

/**
 * OSS NOTE:
 * - This file uses ONLY these env keys (must match your .env.example):
 *   - VITE_SCAN_API_BASE
 *   - VITE_BANNER_API
 *
 * Optional runtime overrides (no rebuild needed):
 * - window.__RELIX_SCAN_API__  (e.g. "http://localhost:5055")
 * - window.__BANNER_API__      (e.g. "http://localhost:5055")
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { setPageMeta } from "../../lib/meta";

import { HeroSlider } from "../../components/ui/HeroSlider";
import { StatsBar } from "../../components/home/StatsBar";
import { NFTCarousel } from "../../components/nft/NFTCarousel";
import { RecentlyListed } from "../../components/home/RecentlyListed";
import { NewMinting } from "../../components/home/NewMinting";
import { NftHeroSection } from "../../components/home/NftHeroSection";
import { HowItWorksSection } from "../../components/home/HowItWorksSection";
import { FAQSection } from "../../components/home/FAQSection";

/* ---------------------------------------------
  PUBLIC CONFIG (safe for open-source)
---------------------------------------------- */
const APP_CONFIG = Object.freeze({
  // API base for scan services (expected to be public)
  // Priority: window override -> env -> local dev fallback
  get SCAN_API_BASE() {
    return (
      (typeof window !== "undefined" && window.__RELIX_SCAN_API__) ||
      import.meta?.env?.VITE_SCAN_API_BASE ||
      "http://localhost:5055"
    );
  },

  // API base for banner (expected to be public)
  // Priority: window override -> env -> empty (disabled)
  get BANNER_API_BASE() {
    return (
      (typeof window !== "undefined" && window.__BANNER_API__) ||
      import.meta?.env?.VITE_BANNER_API ||
      ""
    );
  },

  TRENDING_CHAIN_IDS: "4127,56",
  TRENDING_MAX: 5,
  TRENDING_POLL_MS: 5 * 60_000,

  CHAIN_LABELS: Object.freeze({
    4127: "Relix Testnet",
    56: "BNB Chain",
  }),

  // Demo image path must exist in public/ for OSS forks
  DEMO_IMAGE: "/nft-test/nft-test.png",
});

function chainLabel(chainId) {
  const id = Number(chainId);
  return APP_CONFIG.CHAIN_LABELS[id] || `Chain ${id}`;
}

/* ---------------------------------------------
  DEMO FALLBACK (Trending only, used on error)
---------------------------------------------- */
const demoTrending = Array.from({ length: 8 }).map((_, i) => ({
  collection: "0x0000000000000000000000000000000000000000",
  collectionName: "Demo Collection",
  tokenId: String(i + 1),
  name: `Demo NFT #${i + 1}`,
  chain: "Demo",
  image: APP_CONFIG.DEMO_IMAGE,

  // trending flags (handled by NFTCarousel)
  hideMeta: true,
  glow: true,
  compact: true,
  isTrending: true,
}));

function pickErr(e) {
  return e?.message || (typeof e === "string" ? e : "") || "Unknown error";
}

async function safeJson(res) {
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text), raw: text };
  } catch {
    return { ok: res.ok, status: res.status, json: null, raw: text };
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 25_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const signal = options.signal;

  const onAbort = () => ac.abort();
  try {
    if (signal) signal.addEventListener("abort", onAbort);
    const r = await fetch(url, { ...options, signal: ac.signal });
    return r;
  } finally {
    clearTimeout(t);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

export function HomePage() {
  const { pathname } = useLocation();

  // Start empty to avoid showing demo data before the first request completes.
  const [trendingItems, setTrendingItems] = useState([]);
  const [trendingMeta, setTrendingMeta] = useState({ loading: true, error: "" });

  const aliveRef = useRef(true);
  const timerRef = useRef(null);
  const abortRef = useRef(null);

  // Expose banner API base globally (used by HeroSlider when `useApi` is enabled).
  useEffect(() => {
    if (typeof window !== "undefined" && APP_CONFIG.BANNER_API_BASE) {
      window.__BANNER_API__ = APP_CONFIG.BANNER_API_BASE;
    }
  }, []);

  useEffect(() => {
    if (!pathname || pathname !== "/") return;

    const prevTitle = document.title;

    setPageMeta({
      title: "RARE NFT Explore",
      description: "Discover trending NFTs, new mints, and recently listed items across Relix and BNB Chain.",
    });

    document.title = "RARE NFT — Home";

    return () => {
      document.title = prevTitle;
    };
  }, [pathname]);

  const showTrendingLoading = useMemo(
    () => trendingMeta.loading && trendingItems.length === 0,
    [trendingMeta.loading, trendingItems.length]
  );

  // Always pad to 5 items so the carousel layout never "jumps".
  const trendingPadded = useMemo(() => {
    const real = Array.isArray(trendingItems)
      ? trendingItems.slice(0, APP_CONFIG.TRENDING_MAX)
      : [];
    const need = Math.max(0, APP_CONFIG.TRENDING_MAX - real.length);

    const skeletons = Array.from({ length: need }).map((_, i) => ({
      collection: "0x0000000000000000000000000000000000000000",
      collectionName: "Loading…",
      tokenId: "0",
      name: "Loading…",
      chain: "",
      image: "",

      isSkeleton: true,

      hideMeta: true,
      glow: true,
      compact: true,
      isTrending: true,

      _key: `trend-skeleton-${i}`,
    }));

    return [...real, ...skeletons].slice(0, APP_CONFIG.TRENDING_MAX);
  }, [trendingItems]);

  useEffect(() => {
    aliveRef.current = true;

    async function loadTrending() {
      try {
        abortRef.current?.abort?.();
      } catch {
        /* noop */
      }

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        setTrendingMeta((p) => ({ ...p, loading: true, error: "" }));

        const base = APP_CONFIG.SCAN_API_BASE;
        const url =
          `${base}/scan/trending?chainIds=${encodeURIComponent(APP_CONFIG.TRENDING_CHAIN_IDS)}` +
          `&_ts=${Date.now()}`;

        const r = await fetchWithTimeout(
          url,
          { headers: { "Cache-Control": "no-cache" }, signal: ac.signal },
          25_000
        );

        const out = await safeJson(r);
        if (!aliveRef.current) return;

        if (!out.ok) {
          const msg = out.json?.error || out.json?.message || out.raw || "Trending fetch failed";
          throw new Error(`Trending error (${out.status}): ${msg}`);
        }

        const j = out.json;
        if (!j?.ok || !Array.isArray(j?.items)) {
          throw new Error(j?.error || "Invalid trending response");
        }

        const mapped = j.items.slice(0, APP_CONFIG.TRENDING_MAX).map((it) => {
          const chainId = Number(it.chainId);

          return {
            collection: it.nft,
            collectionName: it.collectionName || "Collection",
            tokenId: String(it.tokenId),
            name: it.name || `NFT #${it.tokenId}`,
            chain: chainLabel(chainId),
            image: it.image || APP_CONFIG.DEMO_IMAGE,
            seller: it.seller || "",

            hideMeta: true,
            glow: true,
            compact: true,
            isTrending: true,
          };
        });

        setTrendingItems(mapped);
        setTrendingMeta({ loading: false, error: "" });
      } catch (e) {
        if (!aliveRef.current) return;
        if (e?.name === "AbortError") return;

        setTrendingItems(demoTrending.slice(0, APP_CONFIG.TRENDING_MAX));
        setTrendingMeta({ loading: false, error: pickErr(e) || "Failed to load trending" });
      }
    }

    loadTrending();
    timerRef.current = setInterval(loadTrending, APP_CONFIG.TRENDING_POLL_MS);

    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      try {
        abortRef.current?.abort?.();
      } catch {
        /* noop */
      }
    };
  }, []);

  const heroUseApi = Boolean(APP_CONFIG.BANNER_API_BASE);

  return (
    <div className="space-y-6 overflow-x-hidden min-w-0">
      {/* Hero */}
      <div className="min-w-0 overflow-hidden">
        <HeroSlider
          useApi={heroUseApi}
          fitMode="contain"
          className="aspect-3/1 w-full"
          heightClass=""
          backgroundClass="bg-white"
        />
      </div>

      <div className="min-w-0">
        <NftHeroSection />
      </div>

      <div className="min-w-0">
        <StatsBar
          currencySymbol="tRLX"
          stats={{ totalVolume: "0", totalSales: "0", collections: "0", activeWallets: "0" }}
        />
      </div>

      {/* Top card */}
      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm p-5 md:p-7 min-w-0 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 -right-24 h-56 w-56 bg-linear-to-tr from-sky-400/25 via-blue-500/10 to-indigo-500/5 blur-3xl opacity-70" />
          <div className="absolute -bottom-24 -left-24 h-56 w-56 bg-linear-to-tr from-cyan-400/20 via-sky-500/10 to-blue-500/5 blur-3xl opacity-70" />
        </div>

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6 min-w-0">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-linear-to-r from-sky-400 via-blue-500 to-indigo-500" />
              <span className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-700">
                Trending
              </span>
            </div>

            <h2 className="mt-3 text-xl md:text-2xl font-extrabold tracking-tight text-slate-900">
              Trending Spotlight
              <span className="block mt-2 h-0.75 w-20 rounded-full bg-linear-to-r from-sky-400 via-blue-500 to-indigo-500" />
            </h2>

            <p className="mt-2 text-sm text-slate-600 max-w-2xl">
              A quick view of what’s heating up in the RARE ecosystem right now.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-linear-to-r from-sky-400 via-blue-500 to-indigo-500" />
                Supported: Relix Testnet
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-linear-to-r from-sky-400 via-blue-500 to-indigo-500" />
                Supported: BNB Chain
              </span>

              {trendingMeta.error ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800 shadow-sm">
                  Using fallback
                </span>
              ) : trendingMeta.loading ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
                  Updating…
                </span>
              ) : null}
            </div>
          </div>

          <div className="shrink-0">
            <Link
              to="/marketplace"
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition"
            >
              GO TO MARKETPLACE
            </Link>
          </div>
        </div>
      </section>

      {/* Trending carousel */}
      <section className="min-w-0">
        <div className="min-w-0 overflow-hidden">
          {showTrendingLoading ? (
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 text-sm text-slate-600">
              Loading trending…
            </div>
          ) : (
            <NFTCarousel
              items={trendingPadded} // always 5 items
              maxItems={APP_CONFIG.TRENDING_MAX}
              perView={5}
              step={5}
              hideControls
            />
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
        <RecentlyListed />
        <NewMinting />
      </section>

      <div className="min-w-0">
        <HowItWorksSection />
      </div>
      <div className="min-w-0">
        <FAQSection />
      </div>
    </div>
  );
}
