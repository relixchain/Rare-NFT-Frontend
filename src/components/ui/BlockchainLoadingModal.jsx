import React from "react";
import { cn } from "../../lib/cn";

export function BlockchainLoadingModal({
  open,
  context,              // ✅ NEW: e.g. "Create Collection"
  phase = "wallet",     // ✅ NEW: "wallet" | "pending" | "indexing"
  title = "Processing",
  text,
  showVideo = true,
}) {
  if (!open) return null;

  const ctx = (context || "").trim();
  const computedTitle = ctx ? `${title}: ${ctx}` : title;

  // auto subtitle by phase (still overridable by `text`)
  const subtitle =
    text ||
    (phase === "wallet"
      ? "Open your wallet to confirm..."
      : phase === "pending"
      ? "Waiting for confirmation..."
      : phase === "indexing"
      ? "Finalizing and indexing..."
      : "Please wait...");

  const isWallet = phase === "wallet" || /wallet|confirm/i.test(String(subtitle));
  const badge = isWallet ? "Wallet" : "On-chain";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-white/55 backdrop-blur-md" />
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50/80 via-white/30 to-indigo-50/70" />

      <div
        className={cn(
          "relative z-10 w-full max-w-[440px] overflow-hidden rounded-[28px]",
          "border border-sky-100 shadow-[0_22px_80px_rgba(15,23,42,0.18)]",
          "bg-white/85 backdrop-blur-xl"
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="relative h-[230px]">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-200/70 via-white/10 to-indigo-200/50" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.35),rgba(255,255,255,0))]" />

          {showVideo ? (
            <>
              <video
                src="/loading/loading1.mp4"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="absolute inset-0 h-full w-full object-cover opacity-[0.55]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white/80 via-white/15 to-sky-50/40" />
              <div className="absolute inset-0 bg-sky-500/10 mix-blend-overlay" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-sky-50/60 to-white/70" />
          )}

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border border-sky-200 bg-white/75 backdrop-blur-md shadow-[0_14px_40px_rgba(56,189,248,0.22)]" />
              <div className="absolute inset-0 rounded-full border-4 border-sky-200/70 border-t-sky-600 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-9 w-9 rounded-2xl bg-white/80 border border-sky-200 backdrop-blur-md flex items-center justify-center">
                  {isWallet ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M20 8V7a3 3 0 0 0-3-3H6a4 4 0 0 0-4 4v9a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-1"
                        stroke="rgb(15 23 42)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M20 12h-4a2 2 0 0 0 0 4h4v-4Z"
                        stroke="rgb(15 23 42)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1"
                        stroke="rgb(15 23 42)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1"
                        stroke="rgb(15 23 42)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="absolute left-4 top-4 right-4 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-slate-900 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-sky-500 shadow-[0_0_18px_rgba(56,189,248,0.55)]" />
              {badge}
            </div>

            <div className="flex items-center gap-1">
              <span className={cn("h-1.5 w-1.5 rounded-full", isWallet ? "bg-sky-600" : "bg-sky-300")} />
              <span className={cn("h-1.5 w-1.5 rounded-full", isWallet ? "bg-sky-300" : "bg-sky-600")} />
              <span className="h-1.5 w-1.5 rounded-full bg-sky-200" />
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="text-base font-extrabold tracking-tight text-slate-900">
            {computedTitle}
          </div>
          <div className="mt-1 text-sm text-slate-600">{subtitle}</div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50/80 px-3 py-1.5 text-[11px] font-semibold text-slate-700">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
              Do not close this tab
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/70 px-3 py-1.5 text-[11px] font-semibold text-slate-700">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              Network may take a moment
            </div>
          </div>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-200/60">
            <div className="h-full w-[45%] animate-[loadingBar_1.2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-sky-400 via-sky-600 to-indigo-500" />
          </div>

          <style>{`
            @keyframes loadingBar {
              0% { transform: translateX(-30%); opacity: .65; }
              50% { opacity: 1; }
              100% { transform: translateX(220%); opacity: .65; }
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}
