// src/lib/chains.ts
import { defineChain } from "viem";
import { bsc } from "viem/chains";

declare global {
  interface Window {
    __RELIX_SCAN_API__?: string;
  }
}

function normalizeBaseUrl(v: unknown) {
  return String(v || "").trim().replace(/\/+$/, "");
}

function isPlaceholder(v: string) {
  // Matches your .env.example style: INSERT_YOUR_...
  return /INSERT_YOUR_/i.test(v);
}

/**
 * OSS behavior:
 * - Prefer runtime override: window.__RELIX_SCAN_API__
 * - Then env: VITE_SCAN_API_BASE
 * - If missing/placeholder: do NOT throw; fall back to public RPC so the repo can boot.
 */
const SCAN_API_BASE = normalizeBaseUrl(
  (typeof window !== "undefined" && window.__RELIX_SCAN_API__) ||
    import.meta.env.VITE_SCAN_API_BASE
);

const HAS_SCAN_PROXY = Boolean(SCAN_API_BASE) && !isPlaceholder(SCAN_API_BASE);

// BSC RPC via backend proxy when available (API keys stay on backend)
const BSC_RPC_PROXY = HAS_SCAN_PROXY ? `${SCAN_API_BASE}/rpc/bsc` : "";

// Fallback BSC RPC (keeps the app usable without private backend/proxy)
const BSC_RPC_FALLBACK =
  (bsc.rpcUrls?.default?.http && bsc.rpcUrls.default.http[0]) ||
  "https://bsc-dataseed.binance.org";

const BSC_RPC_EFFECTIVE = BSC_RPC_PROXY || BSC_RPC_FALLBACK;

/** BSC Custom (multicall + RPC via backend proxy when configured) */
export const bscCustom = defineChain({
  ...bsc,
  rpcUrls: {
    default: { http: [BSC_RPC_EFFECTIVE] },
    public: { http: [BSC_RPC_EFFECTIVE] },
  },
  contracts: {
    ...bsc.contracts,
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
      blockCreated: 1,
    },
  },
});

/** Relix Testnet with multicall3 */
export const relixTestnet = defineChain({
  id: 4127,
  name: "Relix Testnet",
  network: "relix-testnet",
  nativeCurrency: { name: "Relix", symbol: "tRLX", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc-testnet.relixchain.com"] },
    public: { http: ["https://rpc-testnet.relixchain.com"] },
  },
  blockExplorers: {
    default: { name: "Relix Explorer", url: "https://testnet.relixchain.com" },
  },
  contracts: {
    multicall3: {
      address: "0x2c287b85309F731CE5F6589239c6E54e857F5c1E",
      blockCreated: 1,
    },
  },
});

// UI placeholder
export const relixMainnetPlaceholder = {
  id: 999999,
  name: "Relix Mainnet",
};
