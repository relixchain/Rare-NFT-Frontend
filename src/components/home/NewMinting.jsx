// src/components/home/NewMinting.jsx
// All-in component (cached + polling):
// - Uses server-side cached endpoint
// - Polls every POLL_MS
// - Throttles requests (can be force-bypassed)
// - Avoids nuking the list when API returns empty (prevents sudden "No mints yet")

/* cspell:ignore RELIXSCAN strictmode */

import { Link, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Card } from "../ui/Card";
import { cn } from "../../lib/cn";

const API_BASE =
  (typeof window !== "undefined" && window.__RELIXSCAN_API__) ||
  "https://api-nft.rarecore.net";

const TAKE = 5;
const POLL_MS = 15_000;
const MIN_FETCH_INTERVAL_MS = 1200;

function timeAgo(ms) {
  if (!ms) return "Just now";
  const diff = Date.now() - Number(ms);
  if (diff < 5000) return "Just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function shortAddr(addr) {
  if (!addr) return "0x00...00";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function uniqByKey(arr, getKey) {
  const seen = new Set();
  const out = [];
  for (const it of arr) {
    const k = getKey(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export function NewMinting({ items: initialItems = [] }) {
  const location = useLocation();

  const [items, setItems] = useState(
    Array.isArray(initialItems) ? initialItems.slice(0, TAKE) : []
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const hasLoadedOnceRef = useRef(false);
  const abortRef = useRef(null);
  const lastFetchAtRef = useRef(0);

  const cacheUrl = useMemo(() => `${API_BASE}/data/mints-cache.json`, []);

  const fetchLatest = useCallback(
    async ({ soft = false, force = false } = {}) => {
      const now = Date.now();

      // Throttle (unless forced)
      if (!force && now - lastFetchAtRef.current < MIN_FETCH_INTERVAL_MS) return;
      lastFetchAtRef.current = now;

      // Abort previous request
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setError("");
      if (soft) setRefreshing(true);
      else setLoading(true);

      try {
        const url = `${cacheUrl}?v=${Math.floor(Date.now() / 5000)}`;

        const res = await fetch(url, {
          method: "GET",
          signal: ac.signal,
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        const raw = Array.isArray(json?.items) ? json.items : [];

        const deduped = uniqByKey(raw, (x) => `${x.chainId}:${x.txHash}:${x.tokenId}`);

        const normalized = deduped
          .slice()
          .sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0))
          .slice(0, TAKE)
          .map((x) => ({
            ...x,
            mintedAgo: timeAgo(x.timestamp),
            minterShort: shortAddr(x.minter),
          }));

        // Do not nuke the list when response is empty (prevents sudden "No mints yet")
        if (normalized.length > 0 || !hasLoadedOnceRef.current) {
          setItems(normalized);
        }

        hasLoadedOnceRef.current = true;
      } catch (e) {
        // If AbortError: reset throttle so React StrictMode's 2nd run can fetch normally
        if (e?.name === "AbortError") {
          lastFetchAtRef.current = 0;
          return;
        }
        setError(e?.message || "Fetch failed");
        hasLoadedOnceRef.current = true;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cacheUrl]
  );

  // Mount + route change => always force fetch (bypass throttle)
  useEffect(() => {
    fetchLatest({ soft: hasLoadedOnceRef.current, force: true });

    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [location.pathname, fetchLatest]);

  // Polling
  useEffect(() => {
    const t = setInterval(() => {
      fetchLatest({ soft: true });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [fetchLatest]);

  return (
    <Card className="p-5 md:p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-linear-to-r from-violet-400 via-fuchsia-500 to-sky-500" />
            <span className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-700">
              Live Mint
            </span>
            {refreshing && (
              <span className="ml-2 text-[10px] font-semibold text-slate-500">
                Refreshing...
              </span>
            )}
          </div>

          <h3 className="mt-3 text-lg md:text-xl font-extrabold tracking-tight">
            New Minting NFTs
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Latest 5 mints (cached server-side, auto-updated).
          </p>
        </div>

        <Link to="/activity" className="text-sm font-semibold text-sky-700 hover:text-sky-900">
          View all
        </Link>
      </div>

      <div className="mt-5 space-y-3">
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-center justify-between gap-3">
            <span className="truncate">{error}</span>
            <button
              onClick={() => fetchLatest({ soft: true, force: true })}
              className="shrink-0 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-rose-100"
            >
              Retry
            </button>
          </div>
        )}

        {loading && !hasLoadedOnceRef.current ? (
          <div className="space-y-3">
            {Array.from({ length: TAKE }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white/75 p-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-slate-200" />
                  <div className="flex-1">
                    <div className="h-3 w-40 bg-slate-200 rounded mb-2" />
                    <div className="h-3 w-56 bg-slate-200 rounded" />
                  </div>
                  <div className="h-6 w-14 bg-slate-200 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {items.slice(0, TAKE).map((it, idx) => (
              <Link
                key={`${it.chainId}-${it.txHash}-${it.tokenId}-${idx}`}
                to={`/item/${it.collection}/${it.tokenId}?chainId=${it.chainId}`}
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
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-violet-400/60 via-fuchsia-500/60 to-sky-500/60 opacity-0 group-hover:opacity-100 transition" />

                  <div className="flex items-center gap-3 p-3">
                    <div className="relative h-12 w-12 rounded-2xl overflow-hidden bg-slate-100 shrink-0">
                      <img
                        src={it.image || "/placeholder.png"}
                        alt={it.name || "NFT"}
                        className="h-full w-full object-cover select-none"
                        draggable={false}
                        loading="lazy"
                      />
                      <div className="pointer-events-none absolute inset-0 ring-1 ring-white/40" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-extrabold text-slate-900">
                            {it.name || `Token #${it.tokenId}`}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-slate-500">
                            {it.collectionName || it.collection} • Chain {it.chainId}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                            Mint
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {it.mintedAgo || "Just now"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="text-xs text-slate-500 truncate">
                          Minter {it.minterShort || shortAddr(it.minter)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pointer-events-none absolute -right-16 -bottom-16 h-40 w-40 rounded-full bg-violet-500/10 blur-2xl opacity-0 group-hover:opacity-100 transition" />
                </div>
              </Link>
            ))}

            {!loading && items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-600">
                No mints yet.
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
