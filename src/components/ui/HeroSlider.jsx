// src/components/ui/HeroSlider.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { cn } from "../../lib/cn";

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || "").trim());
}

async function readJsonResponse(res) {
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, json, raw: text };
}

/**
 * Banner API (expected response):
 * GET /banner.json
 * {
 *   ok: true,
 *   updatedAt: number,
 *   slots: [
 *     { slot: number, active: boolean, title: string, link: string, imageGateway: string, updatedAt: number }
 *   ]
 * }
 */

export function HeroSlider({
  images = [],
  intervalMs = 3500,
  className = "",
  heightClass = "h-[180px] sm:h-[240px] md:h-[300px]",

  // caption (optional)
  showCaption = false,
  captionTag = "Marketplace",
  captionTitle = "Discover, collect, and list NFTs.",
  captionSubtitle = "A clean UI with wallet-ready flows and an indexer-friendly architecture.",

  // API binding
  apiBase =
    (typeof window !== "undefined" && window.__BANNER_API__) ||
    import.meta.env.VITE_BANNER_API ||
    "",
  useApi = images.length === 0,
  refreshMs = 30_000,
  maxSlots = 4,
  openInNewTab = true,

  // visuals
  fitMode = "contain", // "contain" | "cover"
  backgroundClass = "bg-slate-950",
  overlayClass = "bg-black/10",

  // manual control
  enableDrag = true,
  dragThresholdPx = 40,
  pauseOnHover = true,
}) {
  // slide shape: { src, href, title, slot, updatedAt }
  const [remoteSlides, setRemoteSlides] = useState([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [remoteErr, setRemoteErr] = useState("");

  const lastUpdatedRef = useRef(0);
  const inFlightRef = useRef(false);
  const hoverRef = useRef(false);
  const abortRef = useRef(null);

  const fetchRemote = useCallback(async () => {
    if (!useApi) return;
    if (!apiBase) {
      setRemoteErr("Missing banner API base. Set VITE_BANNER_API or window.__BANNER_API__.");
      setRemoteSlides([]);
      return;
    }
    if (inFlightRef.current) return;

    inFlightRef.current = true;

    try {
      setRemoteErr("");
      setLoadingRemote(true);

      try {
        abortRef.current?.abort?.();
      } catch {
        /* ignore */
      }

      const ac = new AbortController();
      abortRef.current = ac;

      const url = `${String(apiBase).replace(/\/$/, "")}/banner.json?ts=${Date.now()}`;
      const res = await fetch(url, { signal: ac.signal, cache: "no-store" });
      const out = await readJsonResponse(res);

      if (!out.ok) {
        const msg = out.json?.error || out.json?.message || out.raw || `HTTP ${out.status}`;
        throw new Error(msg);
      }

      const updatedAt = Number(out.json?.updatedAt || 0);
      if (updatedAt && updatedAt === lastUpdatedRef.current) return;
      lastUpdatedRef.current = updatedAt;

      const slots = Array.isArray(out.json?.slots) ? out.json.slots : [];
      const next = slots
        .filter((x) => !!x && x.active === true)
        .slice(0, maxSlots)
        .map((x) => ({
          slot: Number(x.slot || 0),
          src: String(x.imageGateway || x.image || "").trim(),
          href: String(x.link || "").trim(),
          title: String(x.title || "").trim(),
          updatedAt: Number(x.updatedAt || 0),
        }))
        .filter((s) => !!s.src);

      setRemoteSlides(next);
    } catch (e) {
      if (String(e?.name || "") === "AbortError") return;
      setRemoteErr(String(e?.message || e || "Failed to load banners"));
      setRemoteSlides([]);
    } finally {
      setLoadingRemote(false);
      inFlightRef.current = false;
    }
  }, [apiBase, useApi, maxSlots]);

  // initial + polling
  useEffect(() => {
    if (!useApi) return;

    fetchRemote();

    let t = null;
    if (refreshMs && refreshMs > 0) {
      t = setInterval(() => {
        fetchRemote();
      }, refreshMs);
    }

    return () => {
      if (t) clearInterval(t);
      try {
        abortRef.current?.abort?.();
      } catch {
        /* ignore */
      }
    };
  }, [useApi, refreshMs, fetchRemote]);

  // slides source
  const safeImages = useMemo(() => images.filter(Boolean), [images]);

  const slides = useMemo(() => {
    if (useApi) return remoteSlides;
    return safeImages.map((src, i) => ({
      src: String(src),
      href: "",
      title: "",
      slot: i + 1,
      updatedAt: 0,
    }));
  }, [useApi, remoteSlides, safeImages]);

  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  const count = slides.length;

  // autoplay
  useEffect(() => {
    if (!count) return;

    if (timerRef.current) clearInterval(timerRef.current);

    if (!isPaused) {
      timerRef.current = setInterval(() => {
        setIndex((prev) => (prev + 1) % count);
      }, intervalMs);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [count, intervalMs, isPaused]);

  // clamp index when slide count changes
  useEffect(() => {
    if (!count) return;
    if (index >= count) setIndex(0);
  }, [count, index]);

  const goTo = useCallback(
    (i) => {
      if (!count) return;
      const nextIndex = ((i % count) + count) % count;
      setIndex(nextIndex);
    },
    [count]
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  const imgFitClass = fitMode === "cover" ? "object-cover" : "object-contain";

  // drag/swipe
  const drag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    dx: 0,
    dy: 0,
    pointerId: null,
  });

  const endPauseIfAllowed = useCallback(() => {
    if (pauseOnHover && hoverRef.current) return; // keep paused while hovering
    setIsPaused(false);
  }, [pauseOnHover]);

  const onPointerDown = (e) => {
    if (!enableDrag || count <= 1) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    drag.current.active = true;
    drag.current.pointerId = e.pointerId;
    drag.current.startX = e.clientX;
    drag.current.startY = e.clientY;
    drag.current.dx = 0;
    drag.current.dy = 0;

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }

    setIsPaused(true);
  };

  const onPointerMove = (e) => {
    if (!enableDrag || !drag.current.active) return;
    drag.current.dx = e.clientX - drag.current.startX;
    drag.current.dy = e.clientY - drag.current.startY;
  };

  const onPointerUp = (e) => {
    if (!enableDrag || !drag.current.active) return;

    const { dx, dy, pointerId } = drag.current;
    drag.current.active = false;

    try {
      e.currentTarget.releasePointerCapture?.(pointerId);
    } catch {
      /* ignore */
    }

    endPauseIfAllowed();

    // If user mostly scrolls vertically, do nothing
    if (Math.abs(dy) > Math.abs(dx)) return;

    if (Math.abs(dx) < dragThresholdPx) return;

    if (dx > 0) prev();
    else next();
  };

  const onPointerCancel = (e) => {
    if (!drag.current.active) return;
    drag.current.active = false;

    try {
      e.currentTarget.releasePointerCapture?.(drag.current.pointerId);
    } catch {
      /* ignore */
    }

    endPauseIfAllowed();
  };

  // empty state
  if (!count) {
    return (
      <div
        className={cn(
          "rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden",
          heightClass,
          className
        )}
      >
        {useApi && (loadingRemote || remoteErr) ? (
          <div className="h-full w-full flex items-center justify-center text-sm text-slate-500">
            {loadingRemote ? "Loading banners..." : remoteErr || "Failed to load banners"}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden select-none",
        heightClass,
        className
      )}
      onMouseEnter={
        pauseOnHover
          ? () => {
              hoverRef.current = true;
              setIsPaused(true);
            }
          : undefined
      }
      onMouseLeave={
        pauseOnHover
          ? () => {
              hoverRef.current = false;
              setIsPaused(false);
            }
          : undefined
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{ touchAction: enableDrag ? "pan-y" : "auto" }}
    >
      {/* Slides track */}
      <div
        className="absolute inset-0 flex transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {slides.map((it, i) => {
          const clickable = isHttpUrl(it.href);
          const Wrapper = clickable ? "a" : "div";

          const wrapperProps = clickable
            ? {
                href: it.href,
                target: openInNewTab ? "_blank" : undefined,
                rel: openInNewTab ? "noreferrer" : undefined,
                "aria-label": `Open banner link ${i + 1}`,
                title: it.title || undefined,
                onClick: (e) => {
                  // prevent accidental click after swipe
                  const dx = Math.abs(drag.current.dx || 0);
                  const dy = Math.abs(drag.current.dy || 0);
                  if (dx >= dragThresholdPx && dx >= dy) e.preventDefault();
                },
              }
            : { title: it.title || undefined };

          return (
            <div
              key={`${it.slot}-${it.src}-${it.updatedAt}-${i}`}
              className="min-w-full h-full relative"
            >
              <Wrapper
                {...wrapperProps}
                className={cn(
                  "absolute inset-0 block",
                  "flex items-center justify-center",
                  backgroundClass,
                  clickable && "cursor-pointer"
                )}
              >
                <img
                  src={it.src}
                  alt={it.title ? it.title : `Hero banner ${i + 1}`}
                  className={cn(
                    "max-h-full max-w-full",
                    imgFitClass,
                    "select-none pointer-events-none"
                  )}
                  draggable={false}
                />
                <div className={cn("absolute inset-0 pointer-events-none", overlayClass)} />
              </Wrapper>
            </div>
          );
        })}
      </div>

      {/* Dots */}
      {count > 1 ? (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={cn(
                "h-2.5 w-2.5 rounded-full border transition",
                i === index
                  ? "bg-white border-white"
                  : "bg-white/40 border-white/60 hover:bg-white/70"
              )}
            />
          ))}
        </div>
      ) : null}

      {/* Caption */}
      {showCaption ? (
        <div className="absolute left-5 right-5 bottom-10 md:bottom-12 pointer-events-none">
          <div className="text-white">
            <div className="text-[11px] font-semibold tracking-[0.25em] uppercase opacity-90">
              {captionTag}
            </div>
            <div className="mt-2 text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight">
              {captionTitle}
            </div>
            <div className="mt-2 text-sm sm:text-base text-white/90 max-w-2xl">
              {captionSubtitle}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
