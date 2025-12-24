import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAccount } from "wagmi";
import { cn } from "../../lib/cn";
import { WalletControls } from "../wallet/WalletControls";

/**
 * Open-source friendly:
 * - Do not hardcode sensitive addresses in the repo.
 * - Provide placeholders and load from env / runtime config instead.
 *
 * Supported sources (first match wins):
 * 1) window.__ADMIN_WALLET__ (runtime injected)
 * 2) import.meta.env.VITE_ADMIN_WALLET (Vite env)
 * 3) "INSERT_YOUR_ADMIN_WALLET_ADDRESS_HERE" (placeholder)
 */
const ADMIN_WALLET =
  (typeof window !== "undefined" && window.__ADMIN_WALLET__) ||
  import.meta.env.VITE_ADMIN_WALLET ||
  "INSERT_YOUR_ADMIN_WALLET_ADDRESS_HERE";

function normalizeAddress(v) {
  return String(v || "").trim().toLowerCase();
}

function isLooksLikeAddress(v) {
  const s = String(v || "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

const navLinkClass = ({ isActive }) =>
  cn(
    "relative text-sm font-semibold transition px-3 py-2 rounded-2xl",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-2",
    isActive
      ? cn(
          "text-sky-700",
          "bg-gradient-to-r from-sky-50 via-white to-indigo-50",
          "border border-sky-200/70",
          "shadow-sm"
        )
      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
  );

function NavText({ children, active }) {
  return (
    <span className="relative inline-flex items-center">
      {children}
      <span
        className={cn(
          "absolute -bottom-2 left-1/2 h-[3px] w-10 -translate-x-1/2 rounded-full transition",
          active
            ? "bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 opacity-100"
            : "opacity-0"
        )}
      />
    </span>
  );
}

function Chevron({ open }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className={cn("transition", open ? "rotate-180" : "rotate-0")}
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Navbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { pathname } = useLocation();

  const { address: connectedAddress } = useAccount();

  const isAdmin = useMemo(() => {
    const admin = normalizeAddress(ADMIN_WALLET);
    const current = normalizeAddress(connectedAddress);

    // If placeholder or invalid, do not grant admin.
    if (!isLooksLikeAddress(admin)) return false;

    return Boolean(current) && current === admin;
  }, [connectedAddress]);

  const createWrapRef = useRef(null);

  useEffect(() => {
    setDrawerOpen(false);
    setCreateOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onDown(e) {
      if (!createWrapRef.current) return;
      if (!createWrapRef.current.contains(e.target)) setCreateOpen(false);
    }
    function onEsc(e) {
      if (e.key === "Escape") {
        setCreateOpen(false);
        setDrawerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const createActive = useMemo(
    () => pathname === "/create" || pathname.startsWith("/create/"),
    [pathname]
  );

  const createTriggerClass = cn(
    "relative text-sm font-semibold transition px-3 py-2 rounded-2xl",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-2",
    createActive
      ? cn(
          "text-sky-700",
          "bg-gradient-to-r from-sky-50 via-white to-indigo-50",
          "border border-sky-200/70",
          "shadow-sm"
        )
      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
  );

  const dropdownItemClass = ({ isActive }) =>
    cn(
      "flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition",
      isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
    );

  const mobileLinkClass = ({ isActive }) =>
    cn(
      "w-full text-left rounded-2xl px-3 py-3 text-sm font-semibold transition border",
      isActive
        ? "border-sky-200 bg-gradient-to-r from-sky-50 via-white to-indigo-50 text-sky-800"
        : "border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-800"
    );

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="h-[2px] w-full bg-gradient-to-r from-sky-400/70 via-blue-500/70 to-indigo-500/70" />

        <div className="max-w-7xl mx-auto px-4">
          <div className="h-16 flex items-center justify-between gap-3">
            <Link to="/" className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden flex items-center justify-center">
                <img
                  src="/icon/logo-nav.png"
                  alt="RARE NFT"
                  className="h-7 w-7 object-contain select-none"
                  draggable={false}
                />
              </div>

              <div className="leading-tight min-w-0">
                <div className="text-sm font-extrabold tracking-tight truncate">
                  RARE NFT
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  By Relix Developer
                </div>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <NavLink to="/" className={navLinkClass} end>
                {({ isActive }) => <NavText active={isActive}>Explore</NavText>}
              </NavLink>

              <NavLink to="/marketplace" className={navLinkClass}>
                {({ isActive }) => <NavText active={isActive}>Marketplace</NavText>}
              </NavLink>

              <div className="relative" ref={createWrapRef}>
                <button
                  type="button"
                  className={createTriggerClass}
                  onClick={() => setCreateOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={createOpen}
                >
                  <span className="inline-flex items-center gap-2">
                    <NavText active={createActive}>Create</NavText>
                    <span className={cn("text-slate-600", createActive && "text-sky-700")}>
                      <Chevron open={createOpen} />
                    </span>
                  </span>
                </button>

                <div
                  className={cn(
                    "absolute right-0 mt-2 w-56 origin-top-right",
                    "rounded-3xl border border-slate-200 bg-white shadow-xl p-2",
                    createOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none",
                    "transition"
                  )}
                  role="menu"
                >
                  <div className="px-2 pb-2">
                    <div className="text-[10px] font-semibold tracking-[0.25em] text-slate-500 uppercase">
                      Create
                    </div>
                  </div>

                  <div className="grid gap-1">
                    <NavLink to="/create" className={dropdownItemClass} end>
                      Create NFT <span className="text-xs opacity-70">→</span>
                    </NavLink>

                    <NavLink to="/create/collection" className={dropdownItemClass}>
                      Create Collection <span className="text-xs opacity-70">→</span>
                    </NavLink>
                  </div>
                </div>
              </div>

              <NavLink to="/profile" className={navLinkClass}>
                {({ isActive }) => <NavText active={isActive}>Profile</NavText>}
              </NavLink>

              {/* Admin-only Dashboard */}
              {isAdmin ? (
                <NavLink to="/dashboard" className={navLinkClass}>
                  {({ isActive }) => <NavText active={isActive}>Dashboard</NavText>}
                </NavLink>
              ) : null}
            </nav>

            <div className="flex items-center gap-2">
              <div className="hidden md:flex">
                <WalletControls />
              </div>

              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className={cn(
                  "md:hidden inline-flex items-center justify-center",
                  "h-10 px-4 rounded-2xl border border-slate-200 bg-white shadow-sm",
                  "text-xs font-extrabold tracking-[0.18em] text-slate-900",
                  "hover:bg-slate-50 transition"
                )}
                aria-label="Open menu"
                aria-expanded={drawerOpen}
              >
                MENU
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-[60]",
          drawerOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!drawerOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/30 transition-opacity",
            drawerOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setDrawerOpen(false)}
        />

        <aside
          className={cn(
            "absolute right-0 top-0 h-full w-[86%] max-w-[360px]",
            "bg-white shadow-2xl border-l border-slate-200",
            "transition-transform duration-200",
            drawerOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden flex items-center justify-center">
                <img
                  src="/icon/logo-nav.png"
                  alt="RARE NFT"
                  className="h-7 w-7 object-contain select-none"
                  draggable={false}
                />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold truncate">RARE NFT</div>
                <div className="text-[11px] text-slate-500 truncate">Menu</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className={cn(
                "h-10 w-10 rounded-2xl border border-slate-200 bg-white shadow-sm",
                "inline-flex items-center justify-center hover:bg-slate-50 transition"
              )}
              aria-label="Close menu"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">
            <div className="mb-4">
              <div className="px-1 pb-2 text-[10px] font-semibold tracking-[0.25em] uppercase text-slate-500">
                Navigation
              </div>

              <div className="grid gap-2">
                <NavLink to="/" className={mobileLinkClass} end>
                  Explore
                </NavLink>
                <NavLink to="/marketplace" className={mobileLinkClass}>
                  Marketplace
                </NavLink>
                <NavLink to="/create" className={mobileLinkClass} end>
                  Create NFT
                </NavLink>
                <NavLink to="/create/collection" className={mobileLinkClass}>
                  Create Collection
                </NavLink>
                <NavLink to="/profile" className={mobileLinkClass}>
                  Profile
                </NavLink>

                {/* Admin-only Dashboard */}
                {isAdmin ? (
                  <NavLink to="/dashboard" className={mobileLinkClass}>
                    Dashboard
                  </NavLink>
                ) : null}
              </div>
            </div>

            <div className="mt-6">
              <div className="px-1 pb-2 text-[10px] font-semibold tracking-[0.25em] uppercase text-slate-500">
                Wallet
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-3">
                <WalletControls layout="vertical" className="w-full" />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
