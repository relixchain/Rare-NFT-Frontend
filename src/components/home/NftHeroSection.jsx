// src/components/nft/NftHeroSection.jsx
import { Link } from "react-router-dom";

export function NftHeroSection() {
  return (
    <section className="relative mt-8 md:mt-10">
      {/* background glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 -left-16 h-40 w-40 md:h-56 md:w-56 bg-violet-500/15 blur-3xl" />
        <div className="absolute -bottom-20 -right-16 h-40 w-40 md:h-56 md:w-56 bg-sky-500/15 blur-3xl" />
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl backdrop-blur">
        <div className="flex flex-col md:flex-row items-center md:items-stretch justify-between gap-8 px-6 py-8 md:px-10 md:py-10">
          {/* Left side: text + buttons */}
          <div className="flex-1">
            <p className="text-[10px] md:text-xs font-semibold tracking-[0.25em] text-sky-500 uppercase mb-3">
              RELIX NFT MARKETPLACE
            </p>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-slate-900 mb-3">
              Create, collect, and trade NFTs on Relix.
            </h1>
            <p className="text-sm md:text-base text-slate-600 mb-6 max-w-xl">
              Launch your own NFT collections on Relix and list them instantly on
              the marketplace. Built on a real Layer 1 ecosystem with AI, tools,
              and infrastructure ready for creators and developers.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/create"
                className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 shadow-sm transition"
              >
                Create NFT
              </Link>

              <Link
                to="/marketplace"
                className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-100 transition"
              >
                Go to marketplace
              </Link>
            </div>
          </div>

          {/* Right side: hero image */}
          <div className="flex-1 flex justify-center md:justify-end">
            <div className="relative h-40 w-40 md:h-56 md:w-56 lg:h-64 lg:w-64">
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-violet-500/15 via-sky-500/10 to-emerald-400/10 blur-xl" />
              <div className="relative h-full w-full rounded-3xl border border-slate-200 bg-slate-50/80 flex items-center justify-center overflow-hidden">
                <img
                  src="/icon/rare-nft-hero.png"
                  alt="Relix rare NFT"
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
