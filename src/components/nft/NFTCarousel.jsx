// src/components/nft/NFTCarousel.jsx
import { useMemo, useState } from "react";
import { cn } from "../../lib/cn";
import { NFTCard } from "./NFTCard";

/* ===================== Skeleton Card ===================== */
function SkeletonLine({ className = "" }) {
  return <div className={cn("rounded bg-slate-200/80 animate-pulse", className)} />;
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-square bg-slate-100 animate-pulse">
        <div className="absolute left-3 top-3 h-6 w-20 rounded-full bg-slate-200/80" />
        <div className="absolute right-3 top-3 h-6 w-16 rounded-full bg-slate-200/70" />
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
    </div>
  );
}

function getGridColsClass(perView) {
  const n = Math.max(1, Number(perView) || 1);

  if (n >= 5) return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";
  if (n === 4) return "grid-cols-2 sm:grid-cols-2 md:grid-cols-4";
  if (n === 3) return "grid-cols-2 md:grid-cols-3";
  if (n === 2) return "grid-cols-2";
  return "grid-cols-1";
}

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(x, max));
}

/**
 * Sliding window pagination:
 * - startIndex = page * step
 * - visible = [startIndex .. startIndex + perView)
 */
function calcPages(len, perView, step) {
  const pv = Math.max(1, Number(perView) || 1);
  const st = Math.max(1, Number(step) || pv);

  if (len <= 0) return 1;
  if (len <= pv) return 1;

  const lastStart = Math.max(0, len - pv);
  return Math.floor(lastStart / st) + 1;
}

function getStableItemKey(item, idx, prefix = "") {
  const explicit = item?._key;
  if (explicit) return `${prefix}${explicit}`;

  const chainId = item?.chainId != null ? String(item.chainId) : "";
  const collection = String(item?.collection || "0x");
  const tokenId = item?.tokenId != null ? String(item.tokenId) : "0";

  return `${prefix}${chainId}:${collection}:${tokenId}:${idx}`;
}

export function NFTCarousel({
  items = [],
  maxItems = 10,
  perView = 5,
  step = 5,
  className = "",
  hideControls = false,

  /**
   * When true:
   * - Uses a horizontal scroll list on small screens when controls are hidden
   * - Keeps a grid on larger screens
   */
  enableMobileSwipe = true,

  /**
   * If provided, renders exactly this many skeleton cards when items is empty.
   * Set to 0 to disable skeletons.
   */
  skeletonCount = 0,
}) {
  const data = useMemo(() => {
    const sliced = Array.isArray(items) ? items.slice(0, maxItems) : [];
    if (sliced.length) return sliced;

    const n = Math.max(0, Number(skeletonCount) || 0);
    if (!n) return [];
    return Array.from({ length: n }).map((_, i) => ({ isSkeleton: true, _key: `sk-${i}` }));
  }, [items, maxItems, skeletonCount]);

  const pages = useMemo(() => calcPages(data.length, perView, step), [data.length, perView, step]);
  const [page, setPage] = useState(0);

  const safePage = useMemo(() => clamp(page, 0, pages - 1), [page, pages]);
  const canPrev = safePage > 0;
  const canNext = safePage < pages - 1;

  const start = safePage * Math.max(1, Number(step) || 1);

  const view = useMemo(() => {
    const pv = Math.max(1, Number(perView) || 1);
    return data.slice(start, start + pv);
  }, [data, start, perView]);

  const gridCols = useMemo(() => getGridColsClass(perView), [perView]);

  const useMobileSwipe =
    Boolean(enableMobileSwipe) && Boolean(hideControls) && Number(perView) >= 4 && data.length > 0;

  const renderCard = (item, idx, keyPrefix = "") => {
    const isSkeleton = Boolean(item?.isSkeleton);
    const key = isSkeleton ? `${keyPrefix}${item?._key || `skeleton-${idx}`}` : getStableItemKey(item, idx, keyPrefix);
    return isSkeleton ? <SkeletonCard key={key} /> : <NFTCard key={key} item={item} />;
  };

  return (
    <div className={cn("space-y-3", className)}>
      {!hideControls && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => clamp(p - 1, 0, pages - 1))}
              disabled={!canPrev}
              className={cn(
                "rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm transition",
                canPrev ? "hover:bg-slate-50" : "opacity-40 cursor-not-allowed"
              )}
              aria-label="Previous page"
            >
              Prev
            </button>

            <button
              type="button"
              onClick={() => setPage((p) => clamp(p + 1, 0, pages - 1))}
              disabled={!canNext}
              className={cn(
                "rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm transition",
                canNext ? "hover:bg-slate-50" : "opacity-40 cursor-not-allowed"
              )}
              aria-label="Next page"
            >
              Next
            </button>
          </div>

          <div className="text-xs text-slate-500">
            Page {safePage + 1} of {pages}
          </div>
        </div>
      )}

      {useMobileSwipe ? (
        <>
          {/* Mobile: horizontal swipe list */}
          <div className="sm:hidden -mx-2 px-2">
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth">
              {data.map((item, idx) => (
                <div
                  key={`mwrap-${getStableItemKey(item, idx, "mwrap-")}`}
                  className="flex-none w-[160px] snap-start"
                >
                  {renderCard(item, idx, "m-")}
                </div>
              ))}
            </div>
          </div>

          {/* Tablet/Desktop: grid */}
          <div className={cn("hidden sm:grid gap-4", gridCols)}>
            {data.map((item, idx) => renderCard(item, idx, "d-"))}
          </div>
        </>
      ) : (
        <div className={cn("grid gap-4", gridCols)}>
          {view.map((item, idx) => renderCard(item, idx, "g-"))}
        </div>
      )}
    </div>
  );
}
