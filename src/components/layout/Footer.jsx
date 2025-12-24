// src/components/layout/Footer.jsx
import React from "react";

/* ===================== Strings ===================== */
const TEXT = {
  aria: {
    externalLink: (label) => `Open ${label} in a new tab`,
    footerHome: () => "Open Rare NFT website in a new tab",
  },
  brand: {
    name: () => "Rare NFT",
    tagline: () => "Create, buy, sell, and trade NFTs on BSC & Relix Smart Chain.",
    byline: () => "Rare NFT by Relix Development",
    logoAlt: () => "Rare NFT logo",
  },
  sections: {
    quickGuides: () => "Quick Guides",
  },
  footer: {
    copyright: (year) => `© ${year} Rare NFT. All rights reserved.`,
    domainLabel: () => "nft.rarecore.net",
  },
};

const LINKS = [
  { label: "Website", href: "https://relixchain.com", icon: "/icon/website.png" },
  { label: "Telegram", href: "https://t.me/relixchain", icon: "/icon/telegram.png" },
  { label: "GitHub", href: "https://github.com/relixchain", icon: "/icon/github.png" },
  {
    label: "Docs",
    href: "https://relix-chain.gitbook.io/relix-chain-docs/about-nft",
    icon: "/icon/docs.png",
  },
];

const GUIDES = [
  {
    title: "How to Create a Collection",
    href: "https://relix-chain.gitbook.io/relix-chain-docs/about-nft/how-to-create-a-collection",
  },
  {
    title: "How to Mint an NFT",
    href: "https://relix-chain.gitbook.io/relix-chain-docs/about-nft/how-to-mint-nft",
  },
  {
    title: "Check NFT Ownership",
    href: "https://relix-chain.gitbook.io/relix-chain-docs/about-nft/check-your-nft-ownership",
  },
  {
    title: "How to Sell",
    href: "https://relix-chain.gitbook.io/relix-chain-docs/about-nft/how-to-sell-an-nft-on-rare-nft",
  },
  {
    title: "How to Buy",
    href: "https://relix-chain.gitbook.io/relix-chain-docs/about-nft/how-to-buy-an-nft-on-rare-nft",
  },
];

function IconLink({ label, href, icon }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={[
        "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2",
        "text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300",
        "transition shadow-sm",
      ].join(" ")}
      aria-label={TEXT.aria.externalLink(label)}
      title={label}
    >
      <img src={icon} alt="" className="h-4 w-4 opacity-90" loading="lazy" decoding="async" />
      <span>{label}</span>
    </a>
  );
}

function GuidePill({ title, href }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={[
        "inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5",
        "text-[11px] font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300",
        "transition whitespace-nowrap",
      ].join(" ")}
      aria-label={TEXT.aria.externalLink(title)}
      title={title}
    >
      {title}
    </a>
  );
}

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 py-7">
        {/* Row 1: Brand + Social */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <img
              src="/icon/logo-nav.png"
              alt={TEXT.brand.logoAlt()}
              className="h-10 w-10 rounded-xl border border-slate-200 bg-white"
              loading="lazy"
              decoding="async"
            />
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900">{TEXT.brand.name()}</div>
              <div className="text-xs text-slate-500">{TEXT.brand.tagline()}</div>
              <div className="mt-1 text-[11px] font-semibold text-slate-600">
                {TEXT.brand.byline()}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 md:justify-end">
            {LINKS.map((x) => (
              <IconLink key={x.label} {...x} />
            ))}
          </div>
        </div>

        {/* Row 2: Quick Guides */}
        <div className="mt-5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-2">
            <div className="text-xs font-semibold text-slate-900 shrink-0">
              {TEXT.sections.quickGuides()}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {GUIDES.map((g) => (
                <GuidePill key={g.title} {...g} />
              ))}
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-6 pt-5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="text-xs text-slate-500">{TEXT.footer.copyright(year)}</div>

          <a
            href="https://nft.rarecore.net"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
            aria-label={TEXT.aria.footerHome()}
            title={TEXT.footer.domainLabel()}
          >
            {TEXT.footer.domainLabel()}
          </a>
        </div>
      </div>
    </footer>
  );
}
