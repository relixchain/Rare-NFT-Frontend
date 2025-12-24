import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "../ui/Card";
import { cn } from "../../lib/cn";

const DEFAULT_CHAIN_IDS = [4127, 56];

function getDefaultApiBase() {
  if (typeof window === "undefined") return "YOUR_API_URL";
  return window.__RELIXSCAN_API__ || "YOUR_API_URL";
}

function formatNumber(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x ?? "0");
  return n.toLocaleString("en-US");
}

function useDotLoader(enabled, intervalMs = 450) {
  const [dots, setDots] = useState("");
  useEffect(() => {
    if (!enabled) {
      setDots("");
      return;
    }
    const t = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, intervalMs);
    return () => clearInterval(t);
  }, [enabled, intervalMs]);
  return dots;
}

export function StatsBar({
  stats = {
    totalVolume: "0",
    totalSales: "0",
    collections: "0",
    activeWallets: "0",
  },
  deltas = {
    totalVolume: "+0",
    totalSales: "+0",
    collections: "+0",
    activeWallets: "+0",
  },
  showDeltas = true,

  realtimeStats = true,
  apiBaseUrl = getDefaultApiBase(),
  chainIds = DEFAULT_CHAIN_IDS,
  pollMs = 10_000,

  listedCachePath = "/data/listed-multi.json",
}) {
  // ✅ chainIdsParam harus stabil (string)
  const chainIdsParam = useMemo(() => {
    const arr = Array.isArray(chainIds) ? chainIds : [Number(chainIds)];
    return arr
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0)
      .join(",");
  }, [chainIds]);

  // ✅ chainSet dibuat dari string param, biar stabil
  const chainSet = useMemo(() => {
    return new Set(
      String(chainIdsParam || "")
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((x) => Number.isFinite(x) && x > 0)
    );
  }, [chainIdsParam]);

  const [live, setLive] = useState({
    marketItems: null,
    collections: null,
    activeWallets: null,
  });

  const prevRef = useRef({
    marketItems: null,
    collections: null,
    activeWallets: null,
  });

  const [liveDelta, setLiveDelta] = useState({
    marketItems: null,
    collections: null,
    activeWallets: null,
  });

  useEffect(() => {
    if (!realtimeStats) return;

    let alive = true;
    const controller = new AbortController();

    const base = String(apiBaseUrl || "").replace(/\/$/, "");
    const statsUrl = `${base}/scan/stats?chainIds=${encodeURIComponent(chainIdsParam)}`;
    const listedUrl = `${base}${listedCachePath.startsWith("/") ? "" : "/"}${listedCachePath}`;

    async function refresh() {
      try {
        if (!base || !chainIdsParam) return;

        const [statsRes, listedRes] = await Promise.all([
          fetch(statsUrl, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch(listedUrl, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);

        if (!alive) return;

        const [statsJson, listedJson] = await Promise.all([
          statsRes.ok ? statsRes.json() : Promise.resolve(null),
          listedRes.ok ? listedRes.json() : Promise.resolve(null),
        ]);

        if (!alive) return;

        // from /scan/stats
        let activeWalletsSum = null;
        let collectionsSum = null;

        if (statsJson?.ok && Array.isArray(statsJson?.chains)) {
          activeWalletsSum = statsJson.chains.reduce(
            (acc, c) => acc + Number(c?.activeWallets || 0),
            0
          );

          collectionsSum = statsJson.chains.reduce(
            (acc, c) => acc + Number(c?.collectionsTotal || 0),
            0
          );
        }

        // from /data/listed-multi.json
        let marketItems = null;
        if (listedJson?.ok && Array.isArray(listedJson?.items)) {
          const filtered = listedJson.items.filter((it) =>
            chainSet.has(Number(it?.chainId))
          );
          // (optional) kalau mau strict:
          // const filtered = listedJson.items.filter((it) => it?.ok === true && it?.status === "Listed" && chainSet.has(Number(it?.chainId)));
          marketItems = filtered.length;
        }

        const prev = prevRef.current;

        const dMarket =
          prev.marketItems == null || marketItems == null ? null : marketItems - prev.marketItems;
        const dCollections =
          prev.collections == null || collectionsSum == null ? null : collectionsSum - prev.collections;
        const dActive =
          prev.activeWallets == null || activeWalletsSum == null ? null : activeWalletsSum - prev.activeWallets;

        prevRef.current = {
          marketItems: marketItems ?? prev.marketItems,
          collections: collectionsSum ?? prev.collections,
          activeWallets: activeWalletsSum ?? prev.activeWallets,
        };

        setLive({
          marketItems,
          collections: collectionsSum,
          activeWallets: activeWalletsSum,
        });

        setLiveDelta({
          marketItems: dMarket == null ? null : `${dMarket >= 0 ? "+" : ""}${dMarket}`,
          collections: dCollections == null ? null : `${dCollections >= 0 ? "+" : ""}${dCollections}`,
          activeWallets: dActive == null ? null : `${dActive >= 0 ? "+" : ""}${dActive}`,
        });
      } catch {
        // ignore
      }
    }

    refresh();
    const t = setInterval(refresh, Math.max(3000, Number(pollMs || 10000)));

    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onFocus = () => refresh();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);

    return () => {
      alive = false;
      controller.abort();
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [realtimeStats, apiBaseUrl, chainIdsParam, pollMs, listedCachePath, chainSet]);

  const loadingMarket = realtimeStats && live.marketItems === null;
  const loadingCollections = realtimeStats && live.collections === null;
  const loadingActive = realtimeStats && live.activeWallets === null;

  const dots = useDotLoader(loadingMarket || loadingCollections || loadingActive);
  const loadingText = `Loading${dots}`;

  const displayMarketItems = loadingMarket
    ? loadingText
    : realtimeStats
    ? formatNumber(live.marketItems)
    : String(stats.totalVolume ?? "0");

  const displayCollections = loadingCollections
    ? loadingText
    : realtimeStats
    ? formatNumber(live.collections)
    : String(stats.collections ?? "0");

  const displayActiveWallets = loadingActive
    ? loadingText
    : realtimeStats
    ? formatNumber(live.activeWallets)
    : String(stats.activeWallets ?? "0");

  const displayDeltas = useMemo(() => {
    if (!showDeltas) return deltas;
    const out = { ...deltas };

    out.totalVolume = loadingMarket ? "—" : liveDelta.marketItems ?? out.totalVolume;
    out.collections = loadingCollections ? "—" : liveDelta.collections ?? out.collections;
    out.activeWallets = loadingActive ? "—" : liveDelta.activeWallets ?? out.activeWallets;

    return out;
  }, [showDeltas, deltas, loadingMarket, loadingCollections, loadingActive, liveDelta]);

  const items = [
    {
      key: "totalVolume",
      label: "NFTs on Market",
      value: displayMarketItems,
      hint: "Number of NFTs currently listed for sale (across networks).",
      isLoading: loadingMarket,
    },
    {
      key: "totalSales",
      label: "Total Sales",
      value: stats.totalSales,
      hint: "All-time completed purchases.",
      isLoading: false,
    },
    {
      key: "collections",
      label: "Collections",
      value: displayCollections,
      hint: "Total NFT collections created across supported networks.",
      isLoading: loadingCollections,
    },
    {
      key: "activeWallets",
      label: "Active Wallets",
      value: displayActiveWallets,
      hint: "Unique wallets that have minted or currently hold NFTs.",
      isLoading: loadingActive,
    },
  ];

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((it, idx) => (
        <Card
          key={it.key}
          className={cn(
            "relative overflow-hidden p-4 md:p-5",
            "hover:shadow-md transition-shadow"
          )}
        >
          <div
            className={cn(
              "absolute inset-x-0 top-0 h-[3px]",
              idx === 0 && "bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500",
              idx === 1 && "bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500",
              idx === 2 && "bg-gradient-to-r from-violet-400 via-fuchsia-500 to-pink-500",
              idx === 3 && "bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500"
            )}
          />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold tracking-[0.22em] text-slate-500 uppercase">
                {it.label}
              </div>

              <div
                className={cn(
                  "mt-2 text-xl md:text-2xl font-extrabold tracking-tight",
                  it.isLoading ? "text-slate-700" : "text-slate-900"
                )}
              >
                {it.value}
              </div>
            </div>

            {showDeltas && (
              <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {displayDeltas[it.key] ?? "—"}
              </span>
            )}
          </div>

          <div className="mt-2 text-xs text-slate-500 leading-relaxed">
            {it.hint}
          </div>

          <div className="pointer-events-none absolute -right-10 -bottom-10 h-24 w-24 rounded-full bg-sky-500/10 blur-2xl" />
        </Card>
      ))}
    </section>
  );
}
