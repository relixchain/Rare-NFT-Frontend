// src/components/wallet/WalletControls.jsx
import { useMemo, useState, useEffect, useRef } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useChainId } from "wagmi";
import { bsc } from "viem/chains";
import { formatEther } from "viem";

import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { cn } from "../../lib/cn";
import { relixTestnet, relixMainnetPlaceholder } from "../../lib/chains";

/**
 * Runtime override (OSS-friendly):
 * window.__APP_CHAINS_UI__ = [{ id, name, subtitle, enabled, logo }]
 * window.__APP_CHAIN_LOGOS__ = { [chainId]: "/path.png" }
 */
function getRuntimeChainsUi() {
  try {
    if (typeof window !== "undefined" && Array.isArray(window.__APP_CHAINS_UI__)) {
      return window.__APP_CHAINS_UI__;
    }
  } catch {}
  return null;
}

function getRuntimeChainLogos() {
  try {
    if (typeof window !== "undefined" && window.__APP_CHAIN_LOGOS__) {
      return window.__APP_CHAIN_LOGOS__;
    }
  } catch {}
  return null;
}

/** Default UI list (safe for OSS) */
const DEFAULT_CHAINS_UI = [
  { id: bsc.id, name: "BNB Chain", subtitle: "Mainnet", enabled: true, logo: "/chain/bnb-chain.png" },
  { id: relixTestnet.id, name: "Relix Chain", subtitle: "Testnet", enabled: true, logo: "/chain/relix-chain.png" },
  { id: relixMainnetPlaceholder.id, name: "Relix Chain", subtitle: "Mainnet", enabled: false, logo: "/chain/relix-chain.png" },
];

const CHAINS_BY_ID = {
  [bsc.id]: bsc,
  [relixTestnet.id]: relixTestnet,
};

function getMetaMaskProvider() {
  const eth = window?.ethereum;
  if (!eth?.request) return null;
  return eth.isMetaMask ? eth : null;
}

async function switchOrAddMetaMask(eth, chain) {
  const chainIdHex = `0x${Number(chain.id).toString(16)}`;

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
    return { ok: true };
  } catch (err) {
    const code = err?.code ?? err?.cause?.code;

    if (code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: chain.rpcUrls?.default?.http || [],
            blockExplorerUrls: [chain.blockExplorers?.default?.url].filter(Boolean),
          },
        ],
      });

      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });

      return { ok: true, added: true };
    }

    if (code === -32002) return { ok: false, pending: true, code };
    if (code === 4001) return { ok: false, rejected: true, code };

    return { ok: false, code, err };
  }
}

function formatNum(n) {
  if (!Number.isFinite(n)) return "0.0000";
  return n.toFixed(4);
}

function getChainUi(chainsUi, chainId) {
  return chainsUi.find((c) => c.id === chainId) || null;
}

export function WalletControls({ className, layout = "horizontal" }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();

  const {
    data: wagmiBal,
    isLoading: wagmiBalLoading,
    isError: wagmiBalError,
    error: wagmiBalErrObj,
  } = useBalance({
    address,
    chainId,
    query: { enabled: !!address, refetchInterval: 6000 },
  });

  // ✅ OSS-friendly: chains UI can be overridden at runtime
  const CHAINS_UI = useMemo(() => getRuntimeChainsUi() || DEFAULT_CHAINS_UI, []);
  const RUNTIME_LOGOS = useMemo(() => getRuntimeChainLogos() || {}, []);

  const [mmBalance, setMmBalance] = useState(null);
  const [mmLoading, setMmLoading] = useState(false);

  const [netOpen, setNetOpen] = useState(false);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);

  const wrapRef = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setNetOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const currentUi = useMemo(() => getChainUi(CHAINS_UI, chainId), [CHAINS_UI, chainId]);

  const currentChainLabel = useMemo(() => {
    if (currentUi) return `${currentUi.name} ${currentUi.subtitle}`;
    return chainId ? `Chain ${chainId}` : "No Chain";
  }, [chainId, currentUi]);

  const currentChainLogo = useMemo(() => {
    // priority: runtime logo map -> per-chain UI logo -> safe fallback
    return (
      RUNTIME_LOGOS?.[chainId] ||
      currentUi?.logo ||
      "/chain/default-chain.png"
    );
  }, [RUNTIME_LOGOS, chainId, currentUi]);

  const nativeSymbol = useMemo(() => {
    return (
      CHAINS_BY_ID?.[chainId]?.nativeCurrency?.symbol ||
      (chainId === bsc.id ? "BNB" : "ETH")
    );
  }, [chainId]);

  // MetaMask fallback balance read
  useEffect(() => {
    const eth = getMetaMaskProvider();
    if (!eth || !isConnected || !address) {
      setMmBalance(null);
      return;
    }

    let dead = false;

    async function tick() {
      try {
        setMmLoading(true);
        const hex = await eth.request({ method: "eth_getBalance", params: [address, "latest"] });
        if (dead) return;

        const wei = BigInt(hex);
        const val = Number(formatEther(wei));
        setMmBalance(`${formatNum(val)} ${nativeSymbol}`);
      } catch {
        if (!dead) setMmBalance(null);
      } finally {
        if (!dead) setMmLoading(false);
      }
    }

    tick();
    const t = setInterval(tick, 5000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [isConnected, address, chainId, nativeSymbol]);

  function onConnect() {
    const injected =
      connectors?.find((c) => c.id === "injected") ||
      connectors?.find((c) => (c.name || "").toLowerCase().includes("metamask")) ||
      connectors?.[0];
    if (!injected) return;
    connect({ connector: injected });
  }

  async function onPickChain(targetId, enabled) {
    if (!enabled) return;
    if (busy) return;

    setHint("");

    if (!isConnected) {
      setHint("Connect your wallet first.");
      setNetOpen(true);
      return;
    }

    if (targetId === relixMainnetPlaceholder.id) return;

    if (targetId === chainId) {
      setHint("You are already on this network.");
      setNetOpen(true);
      return;
    }

    const chain = CHAINS_BY_ID[targetId];
    if (!chain) {
      setHint("This network is not configured in the app.");
      setNetOpen(true);
      return;
    }

    const eth = getMetaMaskProvider();
    if (!eth) {
      setHint("MetaMask was not detected. Open the MetaMask extension and try again.");
      setNetOpen(true);
      return;
    }

    try {
      setBusy(true);

      const res = await switchOrAddMetaMask(eth, chain);

      if (res.pending) {
        setHint("A request is already pending in MetaMask. Please open MetaMask and approve/cancel it.");
        setNetOpen(true);
        return;
      }
      if (res.rejected) {
        setHint("Network switch was rejected in MetaMask.");
        setNetOpen(true);
        return;
      }
      if (!res.ok) {
        setHint(`Network switch failed (code: ${res.code ?? "unknown"}).`);
        setNetOpen(true);
        return;
      }

      setNetOpen(false);
    } catch (e) {
      console.error("switch error:", e);
      setHint(`Network switch error (code: ${e?.code ?? "unknown"}).`);
      setNetOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setHint("Address copied ✅");
      setTimeout(() => setHint(""), 900);
    } catch {}
  }

  const displayBalance = useMemo(() => {
    if (mmBalance) return mmBalance;
    if (wagmiBal?.formatted && wagmiBal?.symbol) {
      const n = Number(wagmiBal.formatted);
      return `${formatNum(n)} ${wagmiBal.symbol}`;
    }
    if (mmLoading || wagmiBalLoading) return "Loading…";
    return `0.0000 ${nativeSymbol}`;
  }, [mmBalance, mmLoading, wagmiBal, wagmiBalLoading, nativeSymbol]);

  useEffect(() => {
    if (wagmiBalError && wagmiBalErrObj) {
      setHint((h) => h || "RPC balance error (MetaMask fallback is active).");
      const t = setTimeout(() => setHint(""), 1200);
      return () => clearTimeout(t);
    }
  }, [wagmiBalError, wagmiBalErrObj]);

  const isVertical = layout === "vertical";

  return (
    <div className={cn(isVertical ? "w-full flex flex-col gap-3" : "flex items-center gap-2", className)}>
      {/* Network dropdown */}
      <div className={cn("relative", isVertical && "w-full")} ref={wrapRef}>
        <button
          type="button"
          onClick={() => setNetOpen((v) => !v)}
          className={cn(
            "inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2",
            "text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition",
            isVertical && "w-full justify-between"
          )}
          aria-expanded={netOpen}
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            <span className="h-5 w-5 rounded-full border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
              <img
                src={currentChainLogo}
                alt="Chain"
                className="h-4 w-4 object-contain select-none"
                draggable={false}
              />
            </span>

            <span className={cn("truncate", isVertical ? "max-w-[240px]" : "max-w-[140px]")}>
              {currentChainLabel}
            </span>
          </span>

          <span className={cn("text-[10px] font-semibold", busy ? "opacity-100" : "opacity-0")}>...</span>
        </button>

        <div
          className={cn(
            "absolute right-0 mt-2 w-72 rounded-3xl border border-slate-200 bg-white shadow-xl p-2",
            netOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none",
            "transition origin-top-right z-50",
            isVertical && "w-full max-w-none"
          )}
        >
          <div className="px-2 pb-2">
            <div className="text-[10px] font-semibold tracking-[0.25em] uppercase text-slate-500">
              Supported Networks
            </div>
          </div>

          <div className="grid gap-1">
            {CHAINS_UI.map((c) => {
              const active = chainId === c.id;
              const disabled = !c.enabled;

              const logoSrc =
                (RUNTIME_LOGOS && RUNTIME_LOGOS[c.id]) ||
                c.logo ||
                "/chain/default-chain.png";

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onPickChain(c.id, c.enabled)}
                  disabled={disabled || !isConnected || busy}
                  className={cn(
                    "w-full text-left rounded-2xl px-3 py-2 transition border",
                    active
                      ? "border-sky-200 bg-gradient-to-r from-sky-50 via-white to-indigo-50 text-sky-800"
                      : "border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-800",
                    (disabled || !isConnected || busy) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center justify-center overflow-hidden shrink-0">
                        <img
                          src={logoSrc}
                          alt={`${c.name} logo`}
                          className="h-5 w-5 object-contain select-none"
                          draggable={false}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="text-sm font-extrabold truncate">{c.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">{c.subtitle}</div>
                      </div>
                    </div>

                    {!c.enabled ? (
                      <span className="text-[11px] font-semibold text-slate-500">Soon</span>
                    ) : active ? (
                      <span className="text-[11px] font-semibold text-emerald-600">Active</span>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-500">Switch</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {hint ? (
            <div className="px-2 pt-2 text-[11px] font-semibold text-amber-600">{hint}</div>
          ) : (
            <div className="px-2 pt-2 text-[11px] text-slate-500">
              Select a network to switch.
            </div>
          )}
        </div>
      </div>

      {/* Balance badge */}
      {isConnected ? (
        <Badge
          title={address}
          className={cn("cursor-pointer select-none", isVertical && "w-full justify-between px-3 py-2")}
          onClick={copyAddress}
        >
          {isVertical ? (
            <span className="inline-flex items-center justify-between w-full gap-3">
              <span className="text-[11px] font-extrabold text-slate-600">Your Balance:</span>
              <span className="text-xs font-extrabold text-slate-900">{displayBalance}</span>
            </span>
          ) : (
            displayBalance
          )}
        </Badge>
      ) : (
        <Badge className={cn(isVertical && "w-full justify-between px-3 py-2")}>Not connected</Badge>
      )}

      {/* Connect / Disconnect */}
      {isConnected ? (
        <Button variant="outline" onClick={() => disconnect()} className={cn(isVertical && "w-full")}>
          Disconnect
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={onConnect}
          disabled={connecting}
          className={cn(isVertical && "w-full")}
        >
          {connecting ? "Connecting..." : "Connect Wallet"}
        </Button>
      )}
    </div>
  );
}
