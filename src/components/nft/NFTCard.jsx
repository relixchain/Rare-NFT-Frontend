// src/components/nft/NFTCard.jsx
import { Link } from "react-router-dom";
import { Card } from "../ui/Card";
import { cn } from "../../lib/cn";
import { formatPrice } from "../../lib/format";

const FALLBACK_IMAGE = "/nft-test/nft-test.png";

function shortAddress(addr) {
  const a = String(addr || "").trim();
  if (!a) return "—";
  if (a.length <= 10) return a;
  return `${a.slice(0, 4)}...${a.slice(-4)}`;
}

function safeText(v, fallback = "") {
  const s = String(v ?? "").trim();
  return s || fallback;
}

function buildDefaultItemUrl(item) {
  const collection = safeText(item?.collection, "");
  const tokenId = safeText(item?.tokenId, "");
  // Keep current app routing, but avoid crashing on missing fields
  if (!collection || !tokenId) return "/marketplace";
  return `/item/${collection}/${tokenId}`;
}

function getDisplayPrice(item) {
  // Prefer explicit UI-ready fields first
  const pd = safeText(item?.priceDisplay, "");
  if (pd) return pd;

  const pt = safeText(item?.priceText, "");
  if (pt) return pt;

  // Fallback: format numeric price + symbol
  const symbol = safeText(item?.currency || item?.paySymbol, "");
  try {
    const p = item?.price;
    const formatted = formatPrice(p);
    return `${formatted} ${symbol}`.trim() || "—";
  } catch {
    return symbol ? symbol : "—";
  }
}

export function NFTCard({
  item,
  className = "",

  // Open-source friendly: allow host app to override route building
  buildItemUrl = buildDefaultItemUrl,

  // Optional overrides
  fallbackImage = FALLBACK_IMAGE,
}) {
  const chainLabel = safeText(item?.chain, "Relix Testnet");
  const glow = Boolean(item?.glow);
  const compact = Boolean(item?.compact);
  const isTrending = Boolean(item?.isTrending);

  const name = safeText(item?.name, "Untitled NFT");
  const collectionName = safeText(item?.collectionName, "Collection");

  const to = buildItemUrl(item);

  return (
    <Link to={to} className="block" aria-label={`Open ${name}`}>
      {/* Gradient border wrapper (optional) */}
      <div
        className={cn(
          "rounded-3xl shadow-sm hover:shadow-md transition",
          glow ? "p-[2px] bg-gradient-to-r from-cyan-400 via-blue-500 to-fuchsia-500" : "p-0",
          className
        )}
      >
        <Card
          className={cn(
            "overflow-hidden rounded-3xl bg-white",
            "hover:-translate-y-[1px] transition",
            glow ? "border border-transparent" : "border border-slate-200",
            "shadow-none"
          )}
        >
          {/* Image */}
          <div className="relative aspect-square bg-slate-50">
            <img
              src={safeText(item?.image, fallbackImage)}
              alt={name}
              className="h-full w-full object-cover select-none"
              draggable={false}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                // Fallback if remote image fails
                if (e?.currentTarget?.src && e.currentTarget.src.includes(fallbackImage)) return;
                e.currentTarget.src = fallbackImage;
              }}
            />

            {/* Chain badge */}
            <div className="absolute left-3 top-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-700 backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500" />
                {chainLabel}
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className={cn(compact ? "p-3" : "p-4")}>
            <div
              className={cn(
                "font-extrabold text-slate-900 truncate",
                compact ? "text-[13px]" : "text-sm"
              )}
              title={name}
            >
              {name}
            </div>

            <div className="mt-1 text-xs text-slate-500 truncate" title={collectionName}>
              {collectionName}
            </div>

            {/* Trending label */}
            {isTrending ? (
              <div className="mt-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-extrabold tracking-[0.18em] uppercase text-slate-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-fuchsia-500" />
                  Trending
                </span>
              </div>
            ) : null}

            {/* Description (only when not trending) */}
            {!isTrending && item?.description ? (
              <div className="mt-2 text-xs text-slate-600 line-clamp-2">
                {safeText(item.description, "")}
              </div>
            ) : null}

            {/* Owner + Price (default behavior) */}
            {!item?.hideMeta ? (
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-500">Owner</div>
                  <div className="text-xs font-semibold text-slate-800 truncate">
                    {shortAddress(item?.owner)}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[11px] text-slate-500">Price</div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {getDisplayPrice(item)}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Trending-only seller (when hideMeta=true) */}
            {item?.hideMeta && item?.seller ? (
              <div className="mt-3">
                <div className="text-[11px] text-slate-500">Seller</div>
                <div className="text-xs font-semibold text-slate-800 truncate">
                  {shortAddress(item?.seller)}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </Link>
  );
}
