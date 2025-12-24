import { Card } from "../ui/Card";
import { cn } from "../../lib/cn";

function StepCard({ index, title, desc, bullets = [], tone = "sky" }) {
  const toneMap = {
    sky: {
      dot: "bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500",
      ring: "ring-sky-100",
      top: "from-sky-400/60 via-blue-500/60 to-indigo-500/60",
    },
    violet: {
      dot: "bg-gradient-to-r from-violet-400 via-fuchsia-500 to-sky-500",
      ring: "ring-violet-100",
      top: "from-violet-400/60 via-fuchsia-500/60 to-sky-500/60",
    },
    emerald: {
      dot: "bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500",
      ring: "ring-emerald-100",
      top: "from-emerald-400/60 via-teal-500/60 to-cyan-500/60",
    },
  };

  const t = toneMap[tone] || toneMap.sky;

  return (
    <Card className="relative overflow-hidden p-5 md:p-6 h-full">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-80",
          "bg-linear-to-r",
          t.top
        )}
      />

      <div className="flex items-start gap-3">
        <div
          className={cn(
            "shrink-0 h-10 w-10 rounded-2xl bg-white border border-slate-200",
            "shadow-sm ring-4",
            t.ring,
            "flex items-center justify-center"
          )}
        >
          <div className={cn("h-2.5 w-2.5 rounded-full", t.dot)} />
        </div>

        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">
            Step {index}
          </div>
          <div className="mt-1 text-base md:text-lg font-extrabold tracking-tight text-slate-900">
            {title}
          </div>
          <div className="mt-1 text-sm text-slate-600">{desc}</div>

          {bullets?.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className={cn("mt-2 h-1.5 w-1.5 rounded-full", t.dot)} />
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute -right-20 -bottom-20 h-48 w-48 rounded-full bg-slate-900/5 blur-2xl" />
    </Card>
  );
}

export function HowItWorksSection() {
  return (
    <section className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500" />
            <span className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-700">
              How It Works
            </span>
          </div>

          <h2 className="mt-2 text-xl md:text-2xl font-extrabold tracking-tight">
            Create → List → Sell on Relix
            <span className="block mt-2 h-[3px] w-20 rounded-full bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500" />
          </h2>

          <p className="mt-2 text-sm text-slate-600 max-w-2xl">
            A simple, wallet-ready flow that mirrors modern NFT marketplaces — optimized for
            creators, collectors, and developers.
          </p>
        </div>

        <div className="text-xs text-slate-500">Marketplace flow</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StepCard
          index={1}
          tone="sky"
          title="Connect Wallet"
          desc="Connect once and you are ready to interact with collections and listings."
          bullets={[
            "Select Relix network",
            "Your address appears in Profile",
            "No account required",
          ]}
        />

        <StepCard
          index={2}
          tone="violet"
          title="Create & Mint"
          desc="Create a collection, upload artwork, and mint NFTs with metadata."
          bullets={[
            "Upload image + traits (IPFS-ready)",
            "Mint directly to your wallet",
            "Supports creator royalties",
          ]}
        />

        <StepCard
          index={3}
          tone="emerald"
          title="Approve & List"
          desc="Approve marketplace once, then list with fixed price or timed listing."
          bullets={[
            "One-time approval per collection",
            "Set price and expiration",
            "Listing appears instantly",
          ]}
        />

        <StepCard
          index={4}
          tone="sky"
          title="Buy & Earn"
          desc="Buyers purchase in one click. Sellers receive funds automatically."
          bullets={[
            "Instant settlement on-chain",
            "Royalty distributed to creator",
            "Activity is tracked in the feed",
          ]}
        />
      </div>
    </section>
  );
}
