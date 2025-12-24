// src/components/home/RecentlyListed.jsx
/* cspell:ignore Relix */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../ui/Card";
import { cn } from "../../lib/cn";

/* ===================== Forced API Base ===================== */
const API_BASE_FORCED = "YOUR_API_URL";

/**
 * Animated loading label without calling setState synchronously inside useEffect.
 * ESLint-friendly for react-hooks/set-state-in-effect.
 */
function useLoadingDots(active, baseText = "Fetching") {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return undefined;

    const timer = setInterval(() => {
      setTick((v) => (v + 1) % 4);
    }, 450);

    return () => clearInterval(timer);
  }, [active]);

  const dots = active ? ".".repeat(tick) : "";
  return `${baseText}${dots}`;
}

function safeNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function joinUrl(base, path) {
  const b = String(base || "").replace(/\/$/, "");
  const p = String(path || "").replace(/^\//, "");
  return b ? `${b}/${p}` : `/${p}`;
}

function chainLabel(chainId) {
  const id = Number(chainId);
  if (id === 56) return "BNB Chain";
  if (id === 4127) return "Relix Testnet";
  return `Chain ${id}`;
}

function shortTime(tsMs) {
  const n = safeNum(tsMs, 0);
  if (!n) return "";
  try {
    return new Date(n).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function RecentlyListed() {
  const [items, setItems] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [err, setErr] = useState(null);

  const loadingLabel = useLoadingDots(initialLoading, "Fetching listings");

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    let ac = null;

    async function fetchListed() {
      if (inFlight) return;
      inFlight = true;

      try {
        setErr(null);

        try {
          ac?.abort?.();
        } catch {
          // ignore
        }

        ac = new AbortController();

        const url = joinUrl(API_BASE_FORCED, "data/listed-multi.json") + `?ts=${Date.now()}`;

        const res = await fetch(url, {
          signal: ac.signal,
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          cache: "no-store",
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        const arr = Array.isArray(json?.items) ? json.items : [];

        // Newest first (global), with stable fallbacks.
        arr.sort((a, b) => {
          const ta = safeNum(a?.listedAtMs, 0);
          const tb = safeNum(b?.listedAtMs, 0);
          if (tb !== ta) return tb - ta;

          const ca = safeNum(a?.chainId, 0);
          const cb = safeNum(b?.chainId, 0);
          if (cb !== ca) return cb - ca;

          const la = safeNum(a?.listingId, 0);
          const lb = safeNum(b?.listingId, 0);
          return lb - la;
        });

        const top = arr.slice(0, 6).map((x) => {
          const listedAtMs = safeNum(x?.listedAtMs, 0);
          const listedAgo = String(x?.listedAgo ?? "").trim();
          const timeStr = shortTime(listedAtMs);

          const timeLabel = listedAgo
            ? listedAgo
            : timeStr
              ? timeStr
              : `Listing #${String(x?.listingId ?? "")}`;

          return {
            chainId: Number(x?.chainId ?? 0),
            listingId: String(x?.listingId ?? ""),
            collection: String(x?.collection ?? ""),
            collectionName: String(x?.collectionName ?? "Collection"),
            tokenId: String(x?.tokenId ?? ""),
            name: String(x?.name ?? `NFT #${String(x?.tokenId ?? "")}`),
            image: String(x?.image ?? "/nft-test/nft-test.png"),
            priceDisplay: String(x?.priceDisplay ?? "-"),
            listedAgo,
            listedAtMs,
            timeLabel,
          };
        });

        if (!alive) return;
        setItems(top);
      } catch (e) {
        if (!alive) return;

        const msg = e?.name === "AbortError" ? null : e?.message || "Fetch failed";
        if (msg) setErr(msg);

        setItems([]);
      } finally {
        // Avoid "return" inside finally (eslint no-unsafe-finally)
        if (alive) setInitialLoading(false);
        inFlight = false;
      }
    }

    fetchListed();
    const timer = setInterval(fetchListed, 15_000);

    return () => {
      alive = false;
      clearInterval(timer);
      try {
        ac?.abort?.();
      } catch {
        // ignore
      }
    };
  }, []);

  const hasItems = useMemo(() => items.length > 0, [items.length]);

  return (
    <Card className="h-full p-5 md:p-6 relative overflow-hidden flex flex-col">
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-linear-to-r from-sky-400 via-blue-500 to-indigo-500" />
            <span className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-700">
              Fresh Listings
            </span>
          </div>

          <h3 className="mt-3 text-lg md:text-xl font-extrabold tracking-tight">
            Recently Listed
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Latest listings across supported chains.
          </p>

          {err ? (
            <div className="mt-2 text-xs text-rose-600">Listing fetch error: {err}</div>
          ) : null}
        </div>

        <Link to="/marketplace" className="text-sm font-semibold text-sky-700 hover:text-sky-900">
          View all
        </Link>
      </div>

      <div className="mt-5 space-y-3 flex-1">
        {initialLoading ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
            {loadingLabel}
          </div>
        ) : null}

        {!initialLoading &&
          items.map((item) => (
            <Link
              key={`${item.chainId}-${item.collection}-${item.tokenId}-${item.listingId}`}
              to={`/item/${item.collection}/${item.tokenId}`}
              className="block"
            >
              <div
                className={cn(
                  "group relative overflow-hidden rounded-2xl border border-slate-200",
                  "bg-white/75 backdrop-blur",
                  "shadow-sm transition",
                  "hover:-translate-y-px hover:shadow-md hover:border-slate-300"
                )}
              >
                <div className="absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-sky-400/60 via-blue-500/60 to-indigo-500/60 opacity-0 group-hover:opacity-100 transition" />

                <div className="flex items-center gap-3 p-3">
                  <div className="relative h-12 w-12 rounded-2xl overflow-hidden bg-slate-100 shrink-0">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-full w-full object-cover select-none"
                      draggable={false}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = "/nft-test/nft-test.png";
                      }}
                    />
                    <div className="pointer-events-none absolute inset-0 ring-1 ring-white/40" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold text-slate-900">
                          {item.name}
                        </div>

                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {item.collectionName}
                        </div>

                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 font-semibold">
                            {chainLabel(item.chainId)}
                          </span>
                          <span>•</span>
                          <span className="truncate">{item.timeLabel}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-extrabold text-slate-900">
                          {item.priceDisplay}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          Listing #{item.listingId}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pointer-events-none absolute -right-16 -bottom-16 h-40 w-40 rounded-full bg-sky-500/10 blur-2xl opacity-0 group-hover:opacity-100 transition" />
              </div>
            </Link>
          ))}

        {!initialLoading && !hasItems ? (
          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
            No listings yet.
          </div>
        ) : null}
      </div>
    </Card>
  );
}
