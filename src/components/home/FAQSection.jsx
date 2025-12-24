import { useMemo, useState } from "react";
import { Card } from "../ui/Card";
import { cn } from "../../lib/cn";

function FaqItem({ item, isOpen, onToggle }) {
  return (
    <div
      className={cn(
        "group rounded-2xl border border-slate-200 bg-white/75 backdrop-blur",
        "shadow-sm transition",
        isOpen ? "border-slate-300 shadow-md" : "hover:border-slate-300 hover:shadow-md"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-4 md:p-5"
        aria-expanded={isOpen}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm md:text-base font-extrabold tracking-tight text-slate-900">
              {item.q}
            </div>
            {item.subtitle && (
              <div className="mt-1 text-sm text-slate-600">{item.subtitle}</div>
            )}
          </div>

          <div
            className={cn(
              "shrink-0 h-9 w-9 rounded-2xl border border-slate-200 bg-white",
              "flex items-center justify-center shadow-sm",
              "transition"
            )}
          >
            <span
              className={cn(
                "text-lg font-black leading-none text-slate-700 transition",
                isOpen ? "rotate-45" : "rotate-0"
              )}
            >
              +
            </span>
          </div>
        </div>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out px-4 md:px-5",
          isOpen ? "grid-rows-[1fr] opacity-100 pb-4 md:pb-5" : "grid-rows-[0fr] opacity-0 pb-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="text-sm text-slate-700 leading-relaxed">{item.a}</div>

          {item.bullets?.length ? (
            <ul className="mt-3 space-y-2">
              {item.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500" />
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function FAQSection({
  title = "FAQ",
  subtitle = "Quick answers to common questions. If you need help, we will keep the experience simple and straightforward.",
}) {
const items = useMemo(
  () => [
    {
      q: "What is RARE NFT?",
      a: "RARE NFT is the official NFT marketplace built by Relix Development — made for creating, discovering, buying, and selling NFTs across the Relix ecosystem.",
    },
    {
      q: "Is the marketplace live?",
      subtitle: "Yes — based on your connected network",
      a: "Yes. You can explore live listings on the Marketplace page. Listings shown depend on the network your wallet is currently connected to.",
      bullets: [
        "Explore live listings in Marketplace",
        "Switch network to view that network’s listings",
        "Use search to filter by name, collection, token ID, listing ID, or owner",
      ],
    },
    {
      q: "Do I need an account to use RARE NFT?",
      a: "No account needed. Your wallet is your identity — just connect your wallet to buy, sell, and manage your NFTs.",
      bullets: ["No email or password", "Your wallet address is your profile & ownership"],
    },
    {
      q: "How do I create & mint an NFT?",
      a: "Go to Create, upload your artwork, fill in the details, then mint. After confirmation, your NFT will appear in your wallet and profile.",
      bullets: ["Upload image", "Add name, description, and traits", "Confirm mint in your wallet"],
    },
    {
      q: "How do I list my NFT for sale?",
      subtitle: "Mint in Create → List in Marketplace",
      a: "Minting happens on the Create page. For now, listing from the Create page is disabled — please list your NFT directly from the Marketplace section.",
      bullets: [
        "Mint your NFT in Create",
        "Open Marketplace to list it manually",
        "Create-page listing will be enabled in a future update",
      ],
    },
    {
      q: "Can I buy NFTs right now?",
      a: "Yes. Open an NFT on the Marketplace and follow the buy flow in your wallet. Make sure you’re on the correct network before confirming.",
      bullets: ["Check the network badge", "Review price and fees before confirming"],
    },
    {
      q: "What fees will I pay?",
      a: "You’ll pay network gas fees for on-chain actions. Creator royalties may apply depending on the collection settings.",
      bullets: ["Gas fee = paid to the network", "Royalties depend on the collection"],
    },
    {
      q: "Where are the image & metadata stored?",
      a: "Ownership is always on-chain. Artwork and metadata are stored on IPFS, and your NFT references them using a TokenURI.",
      bullets: ["Ownership on-chain", "Media + metadata on IPFS", "TokenURI points to the metadata"],
    },
    {
      q: "How do I stay safe from fake collections?",
      a: "Always verify the collection contract address before buying. Never trust random DMs or anyone asking for your seed phrase.",
      bullets: [
        "Verify the collection contract address",
        "Avoid off-platform deals",
        "Never share your seed phrase",
      ],
    },
  ],
  []
);



  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500" />
            <span className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-700">
              {title}
            </span>
          </div>

          <h2 className="mt-2 text-xl md:text-2xl font-extrabold tracking-tight">
            Frequently Asked Questions
            <span className="block mt-2 h-[3px] w-20 rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500" />
          </h2>

          <p className="mt-2 text-sm text-slate-600 max-w-2xl">{subtitle}</p>
        </div>

        <div className="text-xs text-slate-500">Support</div>
      </div>

      <Card className="p-4 md:p-5 relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="grid grid-cols-1 gap-3">
          {items.map((item, idx) => (
            <FaqItem
              key={idx}
              item={item}
              isOpen={openIndex === idx}
              onToggle={() => setOpenIndex(openIndex === idx ? -1 : idx)}
            />
          ))}
        </div>
      </Card>
    </section>
  );
}
