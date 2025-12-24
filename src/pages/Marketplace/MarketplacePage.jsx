import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId } from "wagmi";

import { Input } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { NFTGrid } from "../../components/nft/NFTGrid";
import { setPageMeta } from "../../lib/meta";

/* ===================== Config ===================== */
/**
 * Scan / indexer base URL
 * - Primary: VITE_SCAN_API_BASE (lihat .env.example)
 * - Optional override: window.__RELIX_SCAN_API__ / window.__SCAN_API__
 * - Fallback: public endpoint (demo / default)
 */
const SCAN_API_BASE =
  (typeof window !== "undefined" &&
    (window.__RELIX_SCAN_API__ || window.__SCAN_API__)) ||
  import.meta?.env?.VITE_SCAN_API_BASE ||
  "YOUR_API_URL";

/* ===================== Poll Tune ===================== */
const FAST_POLL_MS = 3500; // optimistic snapshot
const FULL_POLL_MS = 9000; // full snapshot
const FULL_KICKOFF_MS = 1200;

// anti blink: remove only after missing several rounds OR stale enough
const MISS_FAST_DROP = 4;
const MISS_FULL_DROP = 3;
const STALE_DROP_MS = 30_000;

/* ===================== Utils ===================== */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function shortAddress(addr) {
  const a = String(addr || "");
  if (!a) return "";
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

function safeNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function normalizeAddr(v) {
  return String(v || "").trim().toLowerCase();
}

function looksLikeAddressQuery(q) {
  const s = normalizeAddr(q);
  return s.startsWith("0x") && s.length >= 6;
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

const SUPPORTED_CHAIN_IDS = [56, 4127];

function isSupportedChain(chainId) {
  const id = Number(chainId);
  return SUPPORTED_CHAIN_IDS.includes(id);
}

/* ===================== Tiny Loading Indicator (No Layout Shift) ===================== */
function TinyPulseDots({ active }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 align-middle",
        active ? "opacity-100" : "opacity-0",
      ].join(" ")}
      aria-hidden={!active}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
      <span
        className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse"
        style={{ animationDelay: "120ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse"
        style={{ animationDelay: "240ms" }}
      />
    </span>
  );
}

/* ===================== Skeleton UI ===================== */
function SkeletonLine({ className = "" }) {
  return <div className={`rounded bg-slate-200/80 animate-pulse ${className}`} />;
}

function SkeletonCard() {
  return (
    <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-square bg-slate-100 animate-pulse">
        <div className="absolute left-3 top-3 h-6 w-24 rounded-full bg-slate-200" />
      </div>

      <div className="p-4 space-y-3">
        <SkeletonLine className="h-4 w-3/4" />
        <SkeletonLine className="h-3 w-1/2" />

        <div className="pt-2 flex items-end justify-between gap-3">
          <div className="space-y-2 w-1/2">
            <SkeletonLine className="h-3 w-10" />
            <SkeletonLine className="h-3 w-24" />
          </div>
          <div className="space-y-2 w-1/3 text-right">
            <SkeletonLine className="h-3 w-10 ml-auto" />
            <SkeletonLine className="h-4 w-20 ml-auto" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function SkeletonGrid({ count = 10, className = "" }) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/* ===================== Mapping & Stable Merge ===================== */
function itemKey(x) {
  return `${Number(x?.chainId || 0)}:${String(x?.listingId || "")}`;
}

function mapItem(x) {
  const seller = String(x?.seller ?? "");
  const chainId = Number(x?.chainId ?? 0);

  return {
    _key: itemKey(x),
    chainId,
    listingId: String(x?.listingId ?? ""),
    collection: String(x?.collection ?? ""),
    tokenId: String(x?.tokenId ?? ""),

    collectionName: String(x?.collectionName ?? "Collection"),
    name: String(x?.name ?? `NFT #${String(x?.tokenId ?? "")}`),
    image: String(x?.image ?? "/nft-test/nft-test.png"),

    price: String(x?.priceFormatted ?? ""),
    priceDisplay: String(x?.priceDisplay ?? "-"),

    owner: shortAddress(seller),
    seller,
    sellerLower: normalizeAddr(seller),
    sellerShortLower: normalizeAddr(shortAddress(seller)),
    chain: chainLabel(chainId),

    listedAgo: String(x?.listedAgo ?? ""),
    listedAtMs: safeNum(x?.listedAtMs, 0),

    _isFast: Boolean(x?._isFast),

    // anti blink bookkeeping
    _missFast: safeNum(x?._missFast, 0),
    _missFull: safeNum(x?._missFull, 0),
    _lastFastAt: safeNum(x?._lastFastAt, 0),
    _lastFullAt: safeNum(x?._lastFullAt, 0),
  };
}

function sortItemsDesc(items) {
  const out = [...items];
  out.sort((a, b) => {
    const ta = safeNum(a?.listedAtMs, 0);
    const tb = safeNum(b?.listedAtMs, 0);
    if (tb !== ta) return tb - ta;

    const la = safeNum(a?.listingId, 0);
    const lb = safeNum(b?.listingId, 0);
    return lb - la;
  });
  return out;
}

// FAST: optimistic add/update, never hard drop
function mergeFast(prev, incoming, now = Date.now()) {
  const m = new Map(prev.map((it) => [it._key, it]));
  const incomingKeys = new Set(incoming.map((it) => it._key));

  for (const it of incoming) {
    const old = m.get(it._key);
    if (!old) {
      m.set(it._key, {
        ...it,
        _isFast: true,
        _missFast: 0,
        _lastFastAt: now,
      });
      continue;
    }

    m.set(it._key, {
      ...old,
      ...it,
      image: it.image || old.image,
      name: it.name || old.name,
      collectionName: it.collectionName || old.collectionName,
      listedAtMs: it.listedAtMs || old.listedAtMs,
      listedAgo: it.listedAgo || old.listedAgo,
      _isFast: true,
      _missFast: 0,
      _lastFastAt: now,
    });
  }

  // mark missing in this snapshot (do not drop yet)
  for (const [k, old] of m.entries()) {
    if (!incomingKeys.has(k)) {
      m.set(k, { ...old, _missFast: safeNum(old._missFast, 0) + 1 });
    }
  }

  return sortItemsDesc(Array.from(m.values()));
}

// FULL: enrich + controlled pruning with grace period (no blink)
function mergeFull(prev, incoming, now = Date.now()) {
  const m = new Map(prev.map((it) => [it._key, it]));
  const incomingKeys = new Set(incoming.map((it) => it._key));

  for (const it of incoming) {
    const old = m.get(it._key);
    if (!old) {
      m.set(it._key, {
        ...it,
        _isFast: false,
        _missFull: 0,
        _lastFullAt: now,
      });
      continue;
    }

    m.set(it._key, {
      ...old,
      ...it,
      image: it.image || old.image,
      name: it.name || old.name,
      collectionName: it.collectionName || old.collectionName,
      listedAtMs: it.listedAtMs || old.listedAtMs,
      listedAgo: it.listedAgo || old.listedAgo,
      _isFast: false,
      _missFull: 0,
      _lastFullAt: now,
    });
  }

  // mark missing in this full snapshot
  for (const [k, old] of m.entries()) {
    if (!incomingKeys.has(k)) {
      m.set(k, { ...old, _missFull: safeNum(old._missFull, 0) + 1 });
    }
  }

  // prune only when really gone (both sources missed enough) OR stale too long
  const out = [];
  for (const it of m.values()) {
    const missFast = safeNum(it._missFast, 0);
    const missFull = safeNum(it._missFull, 0);
    const lastSeen = Math.max(safeNum(it._lastFastAt, 0), safeNum(it._lastFullAt, 0));
    const stale = lastSeen > 0 && now - lastSeen > STALE_DROP_MS;
    const gone = missFast >= MISS_FAST_DROP && missFull >= MISS_FULL_DROP;

    if (stale || gone) continue;
    out.push(it);
  }

  return sortItemsDesc(out);
}

// hash: DO NOT include _isFast to avoid jitter
function computeListHash(items) {
  const s = items
    .slice(0, 250)
    .map((x) => `${x._key}:${x.listedAtMs}:${x.image}:${x.priceDisplay}`)
    .join("|");

  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return String(h >>> 0);
}

async function safeFetchJson(url, signal) {
  const r = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ===================== Page ===================== */
export function MarketplacePage() {
  useEffect(() => {
    setPageMeta({
      title: "Marketplace",
      description:
        "Explore multichain NFT listings on BSC & Relix Smart Chain. Buy, sell, and trade NFTs on Rare NFT.",
    });
  }, []);

  const { isConnected } = useAccount();
  const walletChainId = useChainId();
  const activeChainId = isConnected ? Number(walletChainId || 0) : 4127;

  // UI state
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const [loadingFast, setLoadingFast] = useState(true);
  const [loadingFull, setLoadingFull] = useState(false);
  const [err, setErr] = useState(null);

  const [allItems, setAllItems] = useState([]);
  const [hasEverLoaded, setHasEverLoaded] = useState(false);

  const perPage = 10;

  // life/async guards
  const aliveRef = useRef(true);
  const currentChainRef = useRef(activeChainId);

  // ignore late/outdated responses
  const fastReqRef = useRef(0);
  const fullReqRef = useRef(0);

  // per-chain cache
  const cacheRef = useRef(new Map());

  function getCache(chainId) {
    const id = Number(chainId || 0);
    let st = cacheRef.current.get(id);
    if (!st) {
      st = {
        items: [],
        hash: "",
        hasEverLoaded: false,
        query: "",
        page: 1,
        fastEmptyStreak: 0,
        fullEmptyStreak: 0,
      };
      cacheRef.current.set(id, st);
    }
    return st;
  }

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    currentChainRef.current = activeChainId;
  }, [activeChainId]);

  // restore per-chain query/page when chain changes
  useEffect(() => {
    const st = getCache(activeChainId);
    setAllItems(st.items);
    setHasEverLoaded(st.hasEverLoaded);
    setQuery(st.query || "");
    setPage(st.page || 1);
  }, [activeChainId]);

  // persist query/page to cache
  useEffect(() => {
    const st = getCache(activeChainId);
    st.query = query;
  }, [query, activeChainId]);

  useEffect(() => {
    const st = getCache(activeChainId);
    st.page = page;
  }, [page, activeChainId]);

  useEffect(() => {
    let acFast = null;
    let acFull = null;

    setErr(null);
    setLoadingFast(true);
    setLoadingFull(false);

    const st0 = getCache(activeChainId);
    st0.fastEmptyStreak = 0;
    st0.fullEmptyStreak = 0;

    async function fetchFast() {
      const rid = ++fastReqRef.current;

      if (!isSupportedChain(activeChainId)) {
        setAllItems([]);
        setHasEverLoaded(false);
        setLoadingFast(false);
        setLoadingFull(false);
        return;
      }

      try {
        setErr(null);
        setLoadingFast(true);

        try {
          acFast?.abort?.();
        } catch (e) {
          void e;
        }
        acFast = new AbortController();

        const url =
          joinUrl(SCAN_API_BASE, "data/listed-fast.json") + `?ts=${Date.now()}`;

        const j = await safeFetchJson(url, acFast.signal);

        if (!aliveRef.current || rid !== fastReqRef.current) return;
        if (currentChainRef.current !== activeChainId) return;

        const arr = Array.isArray(j?.items) ? j.items : [];

        const incoming = sortItemsDesc(
          arr
            .filter((x) => Number(x?.chainId) === Number(activeChainId))
            .map((x) => mapItem({ ...x, _isFast: true }))
        );

        const st = getCache(activeChainId);

        // guard against transient empty
        if (incoming.length === 0 && st.items.length > 0) {
          st.fastEmptyStreak += 1;
          if (st.fastEmptyStreak < 3) return;
        } else {
          st.fastEmptyStreak = 0;
        }

        const now = Date.now();
        const next = mergeFast(st.items, incoming, now);
        const nextHash = computeListHash(next);

        if (nextHash !== st.hash) {
          st.items = next;
          st.hash = nextHash;
          st.hasEverLoaded = true;
          setAllItems(next);
          setHasEverLoaded(true);
        } else {
          if (!st.hasEverLoaded) {
            st.hasEverLoaded = true;
            setHasEverLoaded(true);
          }
        }
      } catch (e) {
        if (!aliveRef.current || rid !== fastReqRef.current) return;
        const msg = e?.name === "AbortError" ? null : e?.message || "fetch failed";
        if (msg) setErr(msg);
      } finally {
        const ok =
          aliveRef.current &&
          rid === fastReqRef.current &&
          currentChainRef.current === activeChainId;
        if (ok) setLoadingFast(false);
      }
    }

    async function fetchFull() {
      const rid = ++fullReqRef.current;
      if (!isSupportedChain(activeChainId)) return;

      try {
        setErr(null);
        setLoadingFull(true);

        try {
          acFull?.abort?.();
        } catch (e) {
          void e;
        }
        acFull = new AbortController();

        const url =
          joinUrl(SCAN_API_BASE, "data/listed-multi.json") + `?ts=${Date.now()}`;

        const j = await safeFetchJson(url, acFull.signal);

        if (!aliveRef.current || rid !== fullReqRef.current) return;
        if (currentChainRef.current !== activeChainId) return;

        const arr = Array.isArray(j?.items) ? j.items : [];

        const incoming = sortItemsDesc(
          arr
            .filter((x) => Number(x?.chainId) === Number(activeChainId))
            .map((x) => mapItem({ ...x, _isFast: false }))
        );

        const st = getCache(activeChainId);

        // guard against transient empty
        if (incoming.length === 0 && st.items.length > 0) {
          st.fullEmptyStreak += 1;
          if (st.fullEmptyStreak < 3) return;
        } else {
          st.fullEmptyStreak = 0;
        }

        const now = Date.now();
        const next = mergeFull(st.items, incoming, now);
        const nextHash = computeListHash(next);

        if (nextHash !== st.hash) {
          st.items = next;
          st.hash = nextHash;
          st.hasEverLoaded = true;
          setAllItems(next);
          setHasEverLoaded(true);
        } else {
          if (!st.hasEverLoaded) {
            st.hasEverLoaded = true;
            setHasEverLoaded(true);
          }
        }
      } catch (e) {
        if (!aliveRef.current || rid !== fullReqRef.current) return;
        const msg = e?.name === "AbortError" ? null : e?.message || "fetch failed";
        if (msg) setErr(msg);
      } finally {
        const ok =
          aliveRef.current &&
          rid === fullReqRef.current &&
          currentChainRef.current === activeChainId;
        if (ok) setLoadingFull(false);
      }
    }

    // kickoff
    fetchFast();
    const kickoffFull = setTimeout(fetchFull, FULL_KICKOFF_MS);

    // intervals (staggered)
    const tFast = setInterval(fetchFast, FAST_POLL_MS);
    const tFull = setInterval(fetchFull, FULL_POLL_MS);

    return () => {
      clearTimeout(kickoffFull);
      clearInterval(tFast);
      clearInterval(tFull);
      try {
        acFast?.abort?.();
      } catch (e) {
        void e;
      }
      try {
        acFull?.abort?.();
      } catch (e) {
        void e;
      }
    };
  }, [activeChainId]);

  // search
  const filtered = useMemo(() => {
    const qRaw = query.trim();
    const q = qRaw.toLowerCase();
    if (!q) return allItems;

    const addrMode = looksLikeAddressQuery(qRaw);

    return allItems.filter((it) => {
      if (addrMode) {
        return (
          it.sellerLower.includes(q) ||
          it.sellerShortLower.includes(q) ||
          normalizeAddr(it.owner).includes(q)
        );
      }

      const hay = [
        it.name,
        it.collectionName,
        it.tokenId,
        it.collection,
        it.listingId,
        it.owner,
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [allItems, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = clamp(page, 1, totalPages);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, perPage, safePage]);

  const unsupported = isConnected && !isSupportedChain(activeChainId);

  const showBusyIndicator = !unsupported && !err && (loadingFast || loadingFull);

  const statusText = unsupported
    ? "Unsupported chain. Switch to Relix (4127) or BNB (56)."
    : err
    ? `Listings fetch error: ${err}`
    : null;

  const showSkeleton =
    (!hasEverLoaded && (loadingFast || loadingFull)) ||
    (loadingFast && allItems.length === 0);

  return (
    <div className="space-y-6">
      <Card className="p-5 md:p-7">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.25em] text-sky-600 uppercase">
                Marketplace
              </div>

              <h1 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight">
                Explore NFTs
              </h1>

              <p className="mt-2 text-sm text-slate-600 max-w-2xl">
                Listings follow your{" "}
                <span className="font-semibold text-slate-900">connected chain</span>:{" "}
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 font-semibold text-slate-900">
                  {chainLabel(activeChainId)}
                </span>
              </p>

              <div
                className={[
                  "mt-2 min-h-[18px] text-xs flex items-center gap-2",
                  unsupported || err ? "text-rose-600" : "text-slate-600",
                ].join(" ")}
              >
                <TinyPulseDots active={showBusyIndicator} />
                {statusText ? <span>{statusText}</span> : null}
              </div>
            </div>

            <div className="w-full md:w-[420px]">
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, collection, token ID, listing ID, or owner address..."
                disabled={unsupported}
              />
              <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between gap-2">
                <span>Tip: paste an address (0x...) to filter owner/seller.</span>
                {query.trim() ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setPage(1);
                    }}
                    className="text-slate-700 font-semibold hover:underline"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{filtered.length}</span>{" "}
              items
              {query.trim() ? (
                <>
                  {" "}
                  matching{" "}
                  <span className="font-semibold text-slate-900">“{query.trim()}”</span>
                </>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">
                Page {safePage} / {totalPages} • 10 per page
              </span>
            </div>
          </div>
        </div>
      </Card>

      <section className="space-y-3">
        {showSkeleton ? (
          <SkeletonGrid
            count={10}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
          />
        ) : (
          <>
            <NFTGrid
              items={pageItems}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
            />

            {!loadingFast && hasEverLoaded && filtered.length === 0 ? (
              <Card className="p-6">
                <div className="text-sm text-slate-600">
                  No listings found
                  {query.trim() ? " for this search." : " on this chain yet."}
                </div>
              </Card>
            ) : null}

            <div className="min-h-[16px]">
              {(loadingFast || loadingFull) && hasEverLoaded ? (
                <div className="text-xs text-slate-500">
                  Updating… you can keep browsing while we refresh.
                </div>
              ) : null}
            </div>
          </>
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
            of{" "}
            <span className="font-semibold text-slate-900">{filtered.length}</span>{" "}
            items
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
            <Button
              variant="outline"
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
            >
              Last
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
