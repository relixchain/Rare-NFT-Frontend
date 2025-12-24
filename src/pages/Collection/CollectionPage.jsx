/* cspell:ignore wagmi Relix RELIXSCAN lookback */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAccount, useChainId } from "wagmi";
import { isAddress } from "viem";

import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { NFTGrid } from "../../components/nft/NFTGrid";
import { cn } from "../../lib/cn";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function safeNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function normalizeAddr(v) {
  return String(v || "").trim().toLowerCase();
}

function shortAddress(addr) {
  const a = String(addr || "");
  if (!a) return "";
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function chainLabel(chainId) {
  const id = Number(chainId);
  if (id === 56) return "BNB Chain";
  if (id === 4127) return "Relix Testnet";
  return `Chain ${id}`;
}

function isSupportedChain(chainId) {
  const id = Number(chainId);
  return id === 56 || id === 4127;
}

function explorerBase(chainId) {
  const id = Number(chainId);
  if (id === 56) return "https://bscscan.com";
  if (id === 4127) return "https://testnet.relixchain.com";
  return "";
}

function normalizeBaseUrl(s) {
  return String(s || "").trim().replace(/\/+$/, "");
}

function joinUrl(base, path) {
  const b = normalizeBaseUrl(base);
  const p = String(path || "").replace(/^\//, "");
  return b ? `${b}/${p}` : `/${p}`;
}

function getApiBase() {
  // Runtime override (optional)
  if (typeof window !== "undefined") {
    // support both (typo-safe)
    if (window.__RELIX_SCAN_API__) return String(window.__RELIX_SCAN_API__);
    if (window.__RELIXSCAN_API__) return String(window.__RELIXSCAN_API__);
  }

  // Vite env
  try {
    if (typeof import.meta !== "undefined") {
      if (import.meta.env?.VITE_SCAN_API_BASE) return String(import.meta.env.VITE_SCAN_API_BASE);
      // backward compatibility if you ever used this old key
      if (import.meta.env?.VITE_SCAN_API) return String(import.meta.env.VITE_SCAN_API);
    }
  } catch {
    /* ignore */
  }

  // Default fallback (project default)
  return "https://api-nft.rarecore.net";
}

/**
 * Loading label with animated dots.
 */
function useLoadingDots(active, baseText = "Fetching") {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setTick((v) => (v + 1) % 4), 450);
    return () => clearInterval(timer);
  }, [active]);

  const dots = active ? ".".repeat(tick) : "";
  return `${baseText}${dots}`;
}

async function fetchJson(url, { signal } = {}) {
  const res = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const extra = text ? `\n${text.slice(0, 300)}` : "";
    throw new Error(`HTTP ${res.status} (${url})${extra}`);
  }
  return res.json();
}

async function fetchJsonFallback(urls, { signal } = {}) {
  let lastErr = null;
  for (const u of urls) {
    try {
      return await fetchJson(u, { signal });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Fetch failed");
}

/* ---------------- Skeleton UI ---------------- */
function SkeletonCard() {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm",
        "animate-pulse"
      )}
    >
      <div className="relative aspect-square bg-slate-100">
        <div className="absolute left-3 top-3 h-6 w-24 rounded-full bg-slate-200" />
      </div>

      <div className="p-4 space-y-3">
        <div className="h-4 w-3/4 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-200" />

        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-5/6 rounded bg-slate-100" />
        </div>

        <div className="pt-2 flex items-end justify-between gap-3">
          <div className="space-y-2 w-1/2">
            <div className="h-3 w-10 rounded bg-slate-200" />
            <div className="h-3 w-24 rounded bg-slate-200" />
          </div>
          <div className="space-y-2 w-1/3 text-right">
            <div className="h-3 w-10 ml-auto rounded bg-slate-200" />
            <div className="h-4 w-20 ml-auto rounded bg-slate-200" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function SkeletonGrid({ count = 10, className = "" }) {
  return (
    <div className={cn("grid gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/* ---------------- Page ---------------- */
export function CollectionPage() {
  const { address } = useParams();
  const { search } = useLocation();

  const collectionAddr = normalizeAddr(address);

  const { isConnected } = useAccount();
  const walletChainId = useChainId();

  // ✅ allow browsing without wallet: ?chainId=56 or ?chainId=4127
  const queryChainId = useMemo(() => {
    try {
      const sp = new URLSearchParams(search || "");
      const v = sp.get("chainId");
      const id = Number(v || 0);
      return Number.isFinite(id) ? id : 0;
    } catch {
      return 0;
    }
  }, [search]);

  const activeChainId = useMemo(() => {
    if (isConnected) return Number(walletChainId || 0);
    if (isSupportedChain(queryChainId)) return queryChainId;
    return 4127; // default
  }, [isConnected, walletChainId, queryChainId]);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // Merged: listed + unlisted
  const [items, setItems] = useState([]);

  // Keep latest items in ref to avoid stale closure during polling
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [err, setErr] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Mode filter: all | listed | unlisted
  const [mode, setMode] = useState("all");

  const perPage = 10;

  const initialLoading = loading && items.length === 0;
  const dots = useLoadingDots(initialLoading || refreshing, "Fetching collection");

  const unsupported = isConnected && !isSupportedChain(activeChainId);

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    let ac = null;

    // Reset to page 1 when context changes (async)
    Promise.resolve().then(() => {
      if (alive) setPage(1);
    });

    async function fetchCollectionMerged() {
      if (inFlight) return;
      inFlight = true;

      const hasOld = (itemsRef.current?.length || 0) > 0;
      if (hasOld) setRefreshing(true);
      else setLoading(true);

      try {
        setErr(null);

        // ✅ strict address check
        if (!collectionAddr || !isAddress(collectionAddr)) {
          if (alive) setItems([]);
          return;
        }

        if (!isSupportedChain(activeChainId)) {
          if (alive) setItems([]);
          return;
        }

        try {
          ac?.abort?.();
        } catch {
          /* ignore */
        }

        ac = new AbortController();
        const API_BASE = getApiBase();

        // 1) LISTED (market)
        const listedUrl = joinUrl(API_BASE, "data/listed-multi.json") + `?ts=${Date.now()}`;

        // 2) MINTS (baseline all NFTs)
        const lookback = 800000;
        const limit = 1000;

        const mintsUrls = [
          joinUrl(API_BASE, "scan/mints") +
            `?chainId=${encodeURIComponent(activeChainId)}&limit=${limit}&lookback=${lookback}&ts=${Date.now()}`,
          joinUrl(API_BASE, "scan/mints") +
            `?chainIds=${encodeURIComponent(activeChainId)}&perChainLimit=${limit}&limit=${limit}&lookback=${lookback}&ts=${Date.now()}`,
        ];

        const [listedJson, mintsJson] = await Promise.allSettled([
          fetchJson(listedUrl, { signal: ac.signal }),
          fetchJsonFallback(mintsUrls, { signal: ac.signal }),
        ]);

        let listedArr = [];
        if (listedJson.status === "fulfilled") {
          listedArr = Array.isArray(listedJson.value?.items) ? listedJson.value.items : [];
        }

        let mintsArr = [];
        if (mintsJson.status === "fulfilled") {
          mintsArr = Array.isArray(mintsJson.value?.items) ? mintsJson.value.items : [];
        }

        const listedFiltered = listedArr
          .filter((x) => Number(x?.chainId) === Number(activeChainId))
          .filter((x) => normalizeAddr(x?.collection) === collectionAddr);

        const mintsFiltered = mintsArr
          .filter((x) => Number(x?.chainId) === Number(activeChainId))
          .filter((x) => normalizeAddr(x?.collection) === collectionAddr);

        const mintedMapped = mintsFiltered.map((x) => {
          const tokenId = String(x?.tokenId ?? "");
          const collection = String(x?.collection ?? "");
          const collectionName = String(x?.collectionName ?? "Collection");
          const name = String(x?.name ?? `NFT #${tokenId}`);
          const image = String(x?.image ?? "/nft-test/nft-test.png");

          const ownerAddr =
            String(
              x?.owner ??
                x?.to ??
                x?.recipient ??
                x?.minter ??
                x?.mintTo ??
                x?.receiver ??
                x?.buyer ??
                ""
            ) || "";

          const ts =
            safeNum(x?.mintedAtMs, 0) ||
            safeNum(x?.timeMs, 0) ||
            safeNum(x?.blockTimeMs, 0) ||
            safeNum(x?.fetchedAtMs, 0) ||
            0;

          return {
            collection,
            collectionName,
            tokenId,
            name,
            image,

            isListed: false,

            price: "",
            priceDisplay: "Not listed",

            listingId: "",
            seller: "",
            owner: ownerAddr,

            chainId: Number(activeChainId),
            chain: chainLabel(Number(activeChainId)),

            mintedAtMs: ts,
            listedAtMs: 0,
          };
        });

        const listedMapped = listedFiltered.map((x) => {
          const tokenId = String(x?.tokenId ?? "");
          const collection = String(x?.collection ?? "");
          const collectionName = String(x?.collectionName ?? "Collection");
          const sellerAddr = String(x?.seller ?? "");

          return {
            collection,
            collectionName,
            tokenId,
            name: String(x?.name ?? `NFT #${tokenId}`),
            image: String(x?.image ?? "/nft-test/nft-test.png"),

            isListed: true,

            price: String(x?.priceFormatted ?? x?.priceDisplay ?? ""),
            priceDisplay: String(x?.priceDisplay ?? ""),

            listingId: String(x?.listingId ?? ""),
            seller: sellerAddr,
            owner: sellerAddr,

            chainId: Number(x?.chainId ?? activeChainId),
            chain: chainLabel(Number(x?.chainId ?? activeChainId)),

            listedAgo: String(x?.listedAgo ?? ""),
            listedAtMs: safeNum(x?.listedAtMs, 0),

            mintedAtMs: 0,
          };
        });

        // MERGE by (chainId + collection + tokenId)
        const map = new Map();

        for (const it of mintedMapped) {
          const key = `${it.chainId}:${normalizeAddr(it.collection)}:${String(it.tokenId)}`;
          map.set(key, it);
        }

        for (const it of listedMapped) {
          const key = `${it.chainId}:${normalizeAddr(it.collection)}:${String(it.tokenId)}`;
          const prev = map.get(key);

          map.set(key, {
            ...(prev || {}),
            ...it,
            name: it.name || prev?.name || `NFT #${it.tokenId}`,
            image: it.image || prev?.image || "/nft-test/nft-test.png",
          });
        }

        // If mints empty: still show listed
        if (mintedMapped.length === 0) {
          for (const it of listedMapped) {
            const key = `${it.chainId}:${normalizeAddr(it.collection)}:${String(it.tokenId)}`;
            map.set(key, it);
          }
        }

        const merged = Array.from(map.values());

        merged.sort((a, b) => {
          const ta = safeNum(a?.listedAtMs, 0);
          const tb = safeNum(b?.listedAtMs, 0);
          if (tb !== ta) return tb - ta;

          const ma = safeNum(a?.mintedAtMs, 0);
          const mb = safeNum(b?.mintedAtMs, 0);
          if (mb !== ma) return mb - ma;

          const ia = safeNum(a?.tokenId, 0);
          const ib = safeNum(b?.tokenId, 0);
          return ib - ia;
        });

        if (alive) setItems(merged);
      } catch (e) {
        if (!alive) return;

        const msg = e?.name === "AbortError" ? null : e?.message || "Fetch failed";
        if (msg) setErr(msg);

        // Preserve old behavior: keep existing items if polling refresh
        if ((itemsRef.current?.length || 0) === 0) setItems([]);
      } finally {
        if (alive) {
          setLoading(false);
          setRefreshing(false);
        }
        inFlight = false;
      }
    }

    fetchCollectionMerged();
    const timer = setInterval(fetchCollectionMerged, 15_000);

    return () => {
      alive = false;
      clearInterval(timer);
      try {
        ac?.abort?.();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChainId, collectionAddr, refreshTick]);

  const collectionName = useMemo(() => items?.[0]?.collectionName || "Collection", [items]);

  const counts = useMemo(() => {
    let listed = 0;
    for (const it of items) if (it?.isListed) listed += 1;
    return { total: items.length, listed, unlisted: Math.max(0, items.length - listed) };
  }, [items]);

  const modeItems = useMemo(() => {
    if (mode === "listed") return items.filter((x) => !!x?.isListed);
    if (mode === "unlisted") return items.filter((x) => !x?.isListed);
    return items;
  }, [items, mode]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return modeItems;

    return modeItems.filter((it) => {
      const hay = [
        it.name,
        it.collectionName,
        it.tokenId,
        it.collection,
        it.listingId,
        it.seller,
        it.owner,
        it.isListed ? "listed" : "unlisted",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [modeItems, query]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / perPage));
  const safePage = useMemo(() => clamp(page, 1, totalPages), [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * perPage;
    return filteredItems.slice(start, start + perPage);
  }, [filteredItems, safePage]);

  const exp = explorerBase(activeChainId);
  const explorerUrl = exp && collectionAddr ? `${exp}/address/${collectionAddr}` : "";

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(collectionAddr || "");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5 md:p-7 relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[11px] font-semibold tracking-[0.25em] text-sky-600 uppercase">
                Collection
              </div>

              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[12px] font-semibold text-slate-900">
                {chainLabel(activeChainId)}
              </span>

              {initialLoading || refreshing ? (
                <span className="text-[12px] text-slate-500">{dots}</span>
              ) : (
                <span className="text-[12px] text-slate-500">
                  {counts.total} total • {counts.listed} listed • {counts.unlisted} unlisted
                </span>
              )}
            </div>

            <h1 className="mt-2 text-xl md:text-2xl font-extrabold tracking-tight truncate">
              {collectionName}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="font-mono text-slate-700">{shortAddress(collectionAddr)}</span>

              <Button variant="outline" onClick={copyAddress} disabled={initialLoading}>
                Copy
              </Button>

              {explorerUrl ? (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-700 hover:text-sky-900 font-semibold"
                >
                  View on Explorer
                </a>
              ) : null}

              <Button
                variant="outline"
                onClick={() => setRefreshTick((x) => x + 1)}
                disabled={initialLoading}
              >
                Refresh
              </Button>

              <Link to="/marketplace" className="text-sky-700 hover:text-sky-900 font-semibold">
                Back to Marketplace
              </Link>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant={mode === "all" ? "default" : "outline"}
                onClick={() => {
                  setMode("all");
                  setPage(1);
                }}
              >
                All
              </Button>
              <Button
                variant={mode === "listed" ? "default" : "outline"}
                onClick={() => {
                  setMode("listed");
                  setPage(1);
                }}
              >
                Listed
              </Button>
              <Button
                variant={mode === "unlisted" ? "default" : "outline"}
                onClick={() => {
                  setMode("unlisted");
                  setPage(1);
                }}
              >
                Unlisted
              </Button>
            </div>

            {unsupported ? (
              <div className="mt-3 text-xs text-rose-600">
                This chain is not supported. Please switch to Relix (4127) or BNB (56).
              </div>
            ) : null}

            {err ? (
              <div className="mt-3 text-xs text-rose-600">Collection fetch error: {err}</div>
            ) : null}
          </div>

          <div className="w-full md:w-105">
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search items… (name, token ID, listing ID, seller, listed/unlisted)"
            />
            <div className="mt-2 text-[11px] text-slate-500">
              Tip: search “unlisted” or “listed” to filter quickly.
            </div>
          </div>
        </div>
      </Card>

      <section className="space-y-3">
        {initialLoading ? (
          <SkeletonGrid count={10} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4" />
        ) : !pageItems.length ? (
          <Card className="p-5 md:p-6">
            <div className="text-sm text-slate-600">
              No items found for this collection on{" "}
              <span className="font-semibold text-slate-900">{chainLabel(activeChainId)}</span>.
            </div>
          </Card>
        ) : (
          <NFTGrid items={pageItems} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4" />
        )}
      </section>

      <Card className="p-4 md:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-slate-500">
            Showing{" "}
            <span className="font-semibold text-slate-900">
              {(safePage - 1) * perPage + (pageItems.length ? 1 : 0)}
            </span>{" "}
            –{" "}
            <span className="font-semibold text-slate-900">
              {(safePage - 1) * perPage + pageItems.length}
            </span>{" "}
            of <span className="font-semibold text-slate-900">{filteredItems.length}</span> items •{" "}
            {perPage} per page • Page 1 is newest
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setPage(1)} disabled={safePage === 1}>
              First
            </Button>

            <Button
              variant="outline"
              onClick={() => setPage((p) => clamp(p - 1, 1, totalPages))}
              disabled={safePage === 1}
            >
              Prev
            </Button>

            <div className="px-3 py-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-900">
              {safePage}
            </div>

            <Button
              variant="outline"
              onClick={() => setPage((p) => clamp(p + 1, 1, totalPages))}
              disabled={safePage === totalPages}
            >
              Next
            </Button>

            <Button variant="outline" onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>
              Last
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
