// src/pages/Profile/ProfilePage.jsx

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { bsc } from "viem/chains";
import { formatUnits, getAddress, isAddress, zeroAddress } from "viem";

import { relixTestnet } from "../../lib/chains";
import { cn } from "../../lib/cn";
import { setPageMeta } from "../../lib/meta";

import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { NFTGrid } from "../../components/nft/NFTGrid";

import { RELIX_MARKETPLACE_ABI } from "../../contracts/relixMarketplaceAbi";
import { MARKETPLACE_ADDRESS_BY_CHAIN } from "../../contracts/relixMarketplaceAddress";

/* -------------------- Utils -------------------- */
function shortAddress(addr) {
  if (!addr) return "Not connected";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function isLikelyCid(s) {
  return /^(Qm[1-9A-HJ-NP-Za-km-z]{44,}|b[a-z2-7]{20,})/.test(
    String(s || "").trim()
  );
}

function extractCid(uri) {
  const u = String(uri || "").trim();
  if (!u) return "";

  if (u.startsWith("http://") || u.startsWith("https://")) return u;

  if (u.startsWith("ipfs://")) {
    const rest = u.replace("ipfs://", "");
    const cleaned = rest.startsWith("ipfs/") ? rest.slice(5) : rest;
    return cleaned.trim();
  }

  if (u.startsWith("/ipfs/")) return u.slice("/ipfs/".length).trim();
  if (isLikelyCid(u)) return u;

  return "";
}

function hashToIndex(str, mod) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % Math.max(1, mod);
}

function ipfsToHttpSmart(uri, gateways) {
  const u = String(uri || "").trim();
  if (!u) return "";

  if (u.startsWith("http://") || u.startsWith("https://")) return u;

  const cid = extractCid(u);
  if (!cid) return "";

  const idx = hashToIndex(cid, gateways.length);
  const primary = gateways[idx] || gateways[0];

  const base = primary.endsWith("/") ? primary : primary + "/";
  return base + cid;
}

function nativeSymbol(chainId) {
  if (chainId === 56) return "BNB";
  if (chainId === 4127) return "tRLX";
  return "NATIVE";
}

/**
 * Fetch JSON with timeout and safe JSON parsing.
 */
async function safeJsonFetch(url, { timeoutMs = 25000, signal } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  const onAbort = () => ac.abort();

  try {
    if (signal) signal.addEventListener("abort", onAbort);

    const r = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: ac.signal,
    });

    const raw = await r.text();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }

    return { ok: r.ok, status: r.status, json, raw };
  } finally {
    clearTimeout(t);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Fetch IPFS JSON with fallback through multiple gateways.
 */
async function fetchIpfsJsonWithFallback(
  ipfsUriOrHttp,
  gateways,
  { timeoutMs = 20000, signal } = {}
) {
  const u = String(ipfsUriOrHttp || "").trim();
  if (!u) return { ok: false, status: 0, json: null, raw: "" };

  const direct = u.startsWith("http://") || u.startsWith("https://") ? u : "";
  const cid = direct ? "" : extractCid(u);

  const candidates = [];
  if (direct) candidates.push(direct);

  if (cid) {
    const primary = ipfsToHttpSmart(`ipfs://${cid}`, gateways);
    if (primary) candidates.push(primary);

    for (const g of gateways) {
      const base = String(g).replace(/\/$/, "");
      const full = `${base}/${cid}`;
      if (!candidates.includes(full)) candidates.push(full);
    }
  }

  let last = { ok: false, status: 0, json: null, raw: "" };

  for (const url of candidates) {
    const withTs = url.includes("?")
      ? `${url}&ts=${Date.now()}`
      : `${url}?ts=${Date.now()}`;

    try {
      const out = await safeJsonFetch(withTs, { timeoutMs, signal });
      last = out;
      if (out.ok && out.json) return out;
    } catch (e) {
      last = { ok: false, status: 0, json: null, raw: String(e?.message || "") };
    }
  }

  return last;
}

/**
 * Resolve an IPFS image URL to an HTTP URL.
 */
async function resolveIpfsImageUrl(
  ipfsOrHttp,
  gateways,
  { timeoutMs = 15000, signal } = {}
) {
  const u = String(ipfsOrHttp || "").trim();
  if (!u) return "";

  if (u.startsWith("http://") || u.startsWith("https://")) return u;

  const cid = extractCid(u);
  if (!cid) return "";

  const candidates = [];
  const primary = ipfsToHttpSmart(`ipfs://${cid}`, gateways);
  if (primary) candidates.push(primary);

  for (const g of gateways) {
    const base = String(g).replace(/\/$/, "");
    const full = `${base}/${cid}`;
    if (!candidates.includes(full)) candidates.push(full);
  }

  for (const url of candidates) {
    const withTs = url.includes("?")
      ? `${url}&ts=${Date.now()}`
      : `${url}?ts=${Date.now()}`;

    try {
      const r = await fetch(withTs, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        headers: { Range: "bytes=0-0" },
        signal,
      });
      if (r.ok || r.status === 206) return url;
    } catch {
      // ignore and try next
    }
  }

  return candidates[0] || "";
}

/* -------------------- Config -------------------- */
const PER_PAGE = 10;
const PLACEHOLDER_IMG = "/nft-test/nft-test.png";

/**
 * Optional runtime override:
 * window.__SCAN_API__ = "https://your-scan-api.example"
 */
const SCAN_API_BASE =
  (typeof window !== "undefined" && window.__SCAN_API__) ||
  "INSERT_YOUR_SCAN_API_BASE_HERE";

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs",
  "https://dweb.link/ipfs",
  "https://nftstorage.link/ipfs",
];

/**
 * ERC20 token used for marketplace earnings (example).
 * Replace this address for your deployment.
 */
const RELIX_TOKEN_ADDRESS = "INSERT_YOUR_RELIX_TOKEN_ADDRESS_HERE";

const ERC20_INFO_ABI_MIN = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
];

const ERC721_META_ABI_MIN = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "string" }],
  },
];

const ERC1155_META_ABI_MIN = [
  {
    type: "function",
    name: "uri",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "string" }],
  },
];

// Listed safety scan window
const LISTED_SCAN_WINDOW = 300;

// Profile lookback hint (optional for backend)
const PROFILE_LOOKBACK_BY_CHAIN = {
  56: 250_000, // BSC
  4127: 400_000, // Relix
};

/* ---------------- Skeleton UI ---------------- */
function SkeletonLine({ className = "" }) {
  return (
    <div className={cn("rounded bg-slate-200/80 animate-pulse", className)} />
  );
}

function SkeletonStatCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur p-4 animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 w-full">
          <SkeletonLine className="h-3 w-20" />
          <SkeletonLine className="mt-3 h-7 w-16" />
        </div>
        <div className="h-5 w-5 rounded-full bg-slate-200/80" />
      </div>
      <SkeletonLine className="mt-3 h-3 w-24" />
    </div>
  );
}

function SkeletonCard() {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm animate-pulse"
      )}
    >
      <div className="relative aspect-square bg-slate-100">
        <div className="absolute left-3 top-3 h-6 w-24 rounded-full bg-slate-200" />
      </div>

      <div className="p-4 space-y-3">
        <div className="h-4 w-3/4 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-200" />

        <div className="pt-2 flex items-end justify-between gap-3">
          <div className="space-y-2 w-1/2">
            <div className="h-3 w-10 rounded bg-slate-200" />
            <div className="h-3 w-24 rounded bg-slate-200" />
          </div>
          <div className="space-y-2 w-1/3 text-right">
            <div className="h-3 w-10 ml-auto rounded bg-slate-200" />
            <div className="h-4 w-20 ml-auto rounded bg-slate-200" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function SkeletonGrid({ count = 10, className = "" }) {
  return (
    <div className={cn("grid gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/* -------------------- Page -------------------- */
export function ProfilePage() {
  const { address: walletAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });

  const isSupportedChain = chainId === relixTestnet.id || chainId === bsc.id;
  const isWalletReady = Boolean(isConnected && walletAddress);

  const network = useMemo(() => {
    if (chainId === bsc.id) return { name: "BNB Chain", subtitle: "Mainnet" };
    if (chainId === relixTestnet.id)
      return { name: "Relix Chain", subtitle: "Testnet" };
    return { name: "Unsupported Network", subtitle: "" };
  }, [chainId]);

  useEffect(() => {
    setPageMeta({
      title: "Profile",
      description:
        "View your NFT inventory, created items, collected NFTs, active listings, and earnings.",
    });
  }, []);

  const marketplace = useMemo(
    () => MARKETPLACE_ADDRESS_BY_CHAIN?.[chainId] || null,
    [chainId]
  );

  // Tabs
  const tabs = ["Inventory", "Collected", "Created", "Listed"];
  const [tab, setTab] = useState("Inventory");

  // Search & paging
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // Data: wallet items (Scan API)
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  // Data: listed items (on-chain)
  const [listedItems, setListedItems] = useState([]);
  const [listedError, setListedError] = useState("");
  const [listedLoading, setListedLoading] = useState(false);
  const listedReqIdRef = useRef(0);

  // Loading
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Abort / race control (Scan API)
  const abortRef = useRef(null);
  const reqIdRef = useRef(0);

  // Modal
  const [helpOpen, setHelpOpen] = useState(null);

  // Stop boot spam
  const bootKeyRef = useRef("");

  // Listed lazy
  const listedLoadedRef = useRef(false);

  /* -------------------- Earnings (seller pending balance) -------------------- */
  const allowRelixErc20 = chainId === bsc.id;

  const relixTokenAddr = useMemo(() => {
    if (!allowRelixErc20) return null;
    if (!isAddress(RELIX_TOKEN_ADDRESS)) return null;
    return getAddress(RELIX_TOKEN_ADDRESS);
  }, [allowRelixErc20]);

  const {
    data: pendingNativeRaw,
    isLoading: pendingNativeLoading,
    refetch: refetchPendingNative,
  } = useReadContract({
    abi: RELIX_MARKETPLACE_ABI,
    address: marketplace ?? undefined,
    functionName: "pendingNative",
    args: walletAddress ? [walletAddress] : undefined,
    query: {
      enabled: Boolean(
        isWalletReady && isSupportedChain && marketplace && walletAddress
      ),
    },
  });

  const {
    data: pendingRelixRaw,
    isLoading: pendingRelixLoading,
    refetch: refetchPendingRelix,
  } = useReadContract({
    abi: RELIX_MARKETPLACE_ABI,
    address: marketplace ?? undefined,
    functionName: "pendingERC20",
    args:
      allowRelixErc20 && relixTokenAddr && walletAddress
        ? [relixTokenAddr, walletAddress]
        : undefined,
    query: {
      enabled: Boolean(
        isWalletReady &&
          isSupportedChain &&
          marketplace &&
          allowRelixErc20 &&
          relixTokenAddr &&
          walletAddress
      ),
    },
  });

  const { data: relixDecimals } = useReadContract({
    abi: ERC20_INFO_ABI_MIN,
    address: relixTokenAddr ?? undefined,
    functionName: "decimals",
    query: { enabled: Boolean(allowRelixErc20 && relixTokenAddr) },
  });

  const { data: relixSymbol } = useReadContract({
    abi: ERC20_INFO_ABI_MIN,
    address: relixTokenAddr ?? undefined,
    functionName: "symbol",
    query: { enabled: Boolean(allowRelixErc20 && relixTokenAddr) },
  });

  const relixDecimalsNum = useMemo(() => {
    const n = Number(relixDecimals ?? 18);
    return Number.isFinite(n) ? n : 18;
  }, [relixDecimals]);

  const relixSymbolText = useMemo(
    () => (relixSymbol ? String(relixSymbol) : "RELIX"),
    [relixSymbol]
  );

  const pendingNative = useMemo(() => {
    try {
      return BigInt(pendingNativeRaw ?? 0n);
    } catch {
      return 0n;
    }
  }, [pendingNativeRaw]);

  const pendingRelix = useMemo(() => {
    try {
      return BigInt(pendingRelixRaw ?? 0n);
    } catch {
      return 0n;
    }
  }, [pendingRelixRaw]);

  const pendingNativeText = useMemo(
    () => `${formatUnits(pendingNative, 18)} ${nativeSymbol(chainId)}`,
    [pendingNative, chainId]
  );

  const pendingRelixText = useMemo(
    () => `${formatUnits(pendingRelix, relixDecimalsNum)} ${relixSymbolText}`,
    [pendingRelix, relixDecimalsNum, relixSymbolText]
  );

  const refetchPendingNativeRef = useRef(null);
  const refetchPendingRelixRef = useRef(null);

  useEffect(() => {
    refetchPendingNativeRef.current = refetchPendingNative;
  }, [refetchPendingNative]);

  useEffect(() => {
    refetchPendingRelixRef.current = refetchPendingRelix;
  }, [refetchPendingRelix]);

  // Withdraw tx UX
  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState(null);

  const { isLoading: confirming } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    query: { enabled: Boolean(txHash) },
  });

  const [withdrawErr, setWithdrawErr] = useState(null);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    if (!txHash) return;
    if (!confirming) {
      setWithdrawing(false);
      setTxHash(null);
      refetchPendingNativeRef.current?.();
      refetchPendingRelixRef.current?.();
    }
  }, [txHash, confirming]);

  async function withdrawNative() {
    setWithdrawErr(null);

    try {
      if (!isWalletReady) throw new Error("Please connect your wallet first.");
      if (!marketplace) throw new Error("Marketplace contract is not available.");
      if (pendingNative <= 0n)
        throw new Error("You have no pending balance to withdraw.");
      if (confirming)
        throw new Error("Your previous transaction is still confirming.");

      setWithdrawing(true);

      const hash = await writeContractAsync({
        abi: RELIX_MARKETPLACE_ABI,
        address: marketplace,
        functionName: "withdrawNative",
        args: [],
      });

      setTxHash(hash);
    } catch (e) {
      setWithdrawing(false);
      setWithdrawErr(e?.message || "Withdrawal failed. Please try again.");
    }
  }

  async function withdrawRelixFixed() {
    setWithdrawErr(null);

    try {
      if (!isWalletReady) throw new Error("Please connect your wallet first.");
      if (!marketplace) throw new Error("Marketplace contract is not available.");
      if (!relixTokenAddr)
        throw new Error("Token is not available on this network.");
      if (pendingRelix <= 0n)
        throw new Error("You have no pending token balance to withdraw.");
      if (confirming)
        throw new Error("Your previous transaction is still confirming.");

      setWithdrawing(true);

      const hash = await writeContractAsync({
        abi: RELIX_MARKETPLACE_ABI,
        address: marketplace,
        functionName: "withdrawERC20",
        args: [relixTokenAddr],
      });

      setTxHash(hash);
    } catch (e) {
      setWithdrawing(false);
      setWithdrawErr(e?.message || "Withdrawal failed. Please try again.");
    }
  }

  /* -------------------- Reset UI on disconnect -------------------- */
  useEffect(() => {
    if (isWalletReady) return;

    try {
      abortRef.current?.abort?.();
    } catch {
      // ignore
    }

    listedReqIdRef.current += 1;
    listedLoadedRef.current = false;

    setError("");
    setListedError("");
    setInitialLoading(false);
    setRefreshing(false);
    setListedLoading(false);
    setHelpOpen(null);

    setTab("Inventory");
    setQuery("");
    setPage(1);

    setItems([]);
    setListedItems([]);

    setTxHash(null);
    setWithdrawErr(null);
    setWithdrawing(false);

    bootKeyRef.current = "";
  }, [isWalletReady]);

  /* -------------------- Normalize items from Scan API -------------------- */
  const normalizeItems = useCallback(
    (data) => {
      const arr = Array.isArray(data?.items) ? data.items : [];

      const normalized = arr.map((x) => {
        const tokenId = String(x.tokenId ?? "");
        const rawImage = String(x.image || "");

        const imgHttp =
          ipfsToHttpSmart(rawImage, IPFS_GATEWAYS) ||
          (rawImage.startsWith("http") ? rawImage : "");

        return {
          collection: String(x.collection || "").toLowerCase(),
          collectionName: x.collectionName || "Collection",
          tokenId,
          name: x.name || (tokenId ? `NFT #${tokenId}` : "NFT"),
          image: imgHttp || PLACEHOLDER_IMG,
          tokenUri: x.tokenUri || "",
          owner: shortAddress(walletAddress),
          chain: data.network || `${network.name} ${network.subtitle}`.trim(),
          status: x.status === "Created" ? "Created" : "Collected",
        };
      });

      normalized.sort((a, b) => {
        const ai = Number(a.tokenId);
        const bi = Number(b.tokenId);
        if (Number.isFinite(ai) && Number.isFinite(bi)) return bi - ai;
        return String(b.tokenId).localeCompare(String(a.tokenId));
      });

      return normalized;
    },
    [walletAddress, network.name, network.subtitle]
  );

  /* -------------------- Scan API loader -------------------- */
  const loadFromApi = useCallback(
    async ({ hard = false } = {}) => {
      if (!isWalletReady || !chainId) return;
      if (!isSupportedChain) return;

      try {
        abortRef.current?.abort?.();
      } catch {
        // ignore
      }

      const ac = new AbortController();
      abortRef.current = ac;

      const myReqId = ++reqIdRef.current;

      setError("");
      setRefreshing(true);
      if (hard) setInitialLoading(true);

      const resetValue = 0;
      const lookback = PROFILE_LOOKBACK_BY_CHAIN?.[chainId] ?? 250_000;

      try {
        const url =
          `${SCAN_API_BASE}/scan/profile` +
          `?chainId=${encodeURIComponent(chainId)}` +
          `&wallet=${encodeURIComponent(walletAddress)}` +
          `&reset=${encodeURIComponent(String(resetValue))}` +
          `&meta=1` +
          `&lookbackBlocks=${encodeURIComponent(String(lookback))}` +
          `&ts=${Date.now()}`;

        const out = await safeJsonFetch(url, {
          timeoutMs: 30_000,
          signal: ac.signal,
        });

        if (myReqId !== reqIdRef.current) return;

        if (!out.ok) {
          const msg =
            out.json?.error ||
            `We couldn’t reach the Scan API (HTTP ${out.status}).`;
          throw new Error(msg);
        }

        const data = out.json;
        if (!data?.ok)
          throw new Error(data?.error || "We couldn’t load your profile right now.");

        const normalized = normalizeItems(data);
        setItems(normalized);

        refetchPendingNativeRef.current?.();
        refetchPendingRelixRef.current?.();
      } catch (e) {
        const name = String(e?.name || "").toLowerCase();
        if (name.includes("abort")) return;
        setError(e?.message || "We couldn’t load your NFTs. Please try again.");
      } finally {
        if (myReqId === reqIdRef.current) {
          setRefreshing(false);
          setInitialLoading(false);
        }
      }
    },
    [isWalletReady, chainId, isSupportedChain, walletAddress, normalizeItems]
  );

  /* -------------------- Listed (on-chain) helpers -------------------- */
  const erc20InfoCacheRef = useRef(new Map());
  const erc20InfoInflightRef = useRef(new Map());

  const getPayTokenInfo = useCallback(
    async (payToken) => {
      const addr = String(payToken || "");
      const lower = addr.toLowerCase();

      if (!addr || lower === String(zeroAddress).toLowerCase()) {
        return {
          isNative: true,
          decimals: 18,
          symbol: nativeSymbol(chainId),
          address: zeroAddress,
        };
      }

      const checksum = getAddress(addr);

      const cached = erc20InfoCacheRef.current.get(checksum.toLowerCase());
      if (cached) return { ...cached, isNative: false, address: checksum };

      const inflight = erc20InfoInflightRef.current.get(checksum.toLowerCase());
      if (inflight) return inflight;

      const p = (async () => {
        try {
          if (!publicClient) throw new Error("No public client");

          const res = await publicClient.multicall({
            contracts: [
              {
                address: checksum,
                abi: ERC20_INFO_ABI_MIN,
                functionName: "decimals",
              },
              {
                address: checksum,
                abi: ERC20_INFO_ABI_MIN,
                functionName: "symbol",
              },
            ],
            allowFailure: true,
          });

          const decimals =
            res?.[0]?.status === "success" ? Number(res[0].result) : 18;

          const symbol =
            res?.[1]?.status === "success" ? String(res[1].result) : "ERC20";

          const info = {
            decimals: Number.isFinite(decimals) ? decimals : 18,
            symbol: symbol || "ERC20",
          };

          erc20InfoCacheRef.current.set(checksum.toLowerCase(), info);
          return { ...info, isNative: false, address: checksum };
        } finally {
          erc20InfoInflightRef.current.delete(checksum.toLowerCase());
        }
      })();

      erc20InfoInflightRef.current.set(checksum.toLowerCase(), p);
      return p;
    },
    [publicClient, chainId]
  );

  const listedMetaCacheRef = useRef(new Map());
  const jsonCacheRef = useRef(new Map());

  const resolveListedMetadata = useCallback(
    async (nft, tokenIdBig, is1155) => {
      if (!publicClient) return null;

      const nftAddr = getAddress(nft);
      const tokenId = BigInt(tokenIdBig);
      const cacheKey = `${chainId}:${nftAddr.toLowerCase()}:${tokenId.toString()}`;

      const cached = listedMetaCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const metaCalls = [
        { address: nftAddr, abi: ERC721_META_ABI_MIN, functionName: "name" },
        { address: nftAddr, abi: ERC721_META_ABI_MIN, functionName: "symbol" },
        is1155
          ? {
              address: nftAddr,
              abi: ERC1155_META_ABI_MIN,
              functionName: "uri",
              args: [tokenId],
            }
          : {
              address: nftAddr,
              abi: ERC721_META_ABI_MIN,
              functionName: "tokenURI",
              args: [tokenId],
            },
      ];

      const metaRes = await publicClient.multicall({
        contracts: metaCalls,
        allowFailure: true,
      });

      const collectionName =
        metaRes?.[0]?.status === "success"
          ? String(metaRes[0].result)
          : "Collection";

      const _symbol =
        metaRes?.[1]?.status === "success" ? String(metaRes[1].result) : "";

      let tokenUri =
        metaRes?.[2]?.status === "success" ? String(metaRes[2].result) : "";

      if (is1155 && tokenUri && tokenUri.includes("{id}")) {
        const hex = tokenId.toString(16).padStart(64, "0");
        tokenUri = tokenUri.replace("{id}", hex);
      }

      let name = tokenId
        ? `${collectionName} #${tokenId.toString()}`
        : collectionName;

      let image = "";

      if (tokenUri) {
        const tokenUriKey = extractCid(tokenUri) || tokenUri;
        const cachedJson = jsonCacheRef.current.get(tokenUriKey);
        let j = cachedJson;

        if (!j) {
          const out = await fetchIpfsJsonWithFallback(tokenUri, IPFS_GATEWAYS, {
            timeoutMs: 20000,
          });

          if (out.ok && out.json) {
            j = out.json;
            jsonCacheRef.current.set(tokenUriKey, j);
          }
        }

        if (j) {
          name = j?.name || name;
          image = j?.image || j?.image_url || "";
        }
      }

      let imageHttp = "";

      if (image) {
        imageHttp =
          image.startsWith("http://") || image.startsWith("https://")
            ? image
            : (await resolveIpfsImageUrl(image, IPFS_GATEWAYS, {
                timeoutMs: 15000,
              })) || "";
      }

      const finalMeta = {
        collectionName,
        symbol: _symbol,
        tokenUri,
        name,
        image: imageHttp || PLACEHOLDER_IMG,
      };

      listedMetaCacheRef.current.set(cacheKey, finalMeta);
      return finalMeta;
    },
    [publicClient, chainId]
  );

  const loadListedFromChain = useCallback(
    async () => {
      if (!isWalletReady || !isSupportedChain) return;
      if (!marketplace || !publicClient) return;

      const myReqId = ++listedReqIdRef.current;

      setListedError("");
      setListedLoading(true);

      try {
        const nextId = await publicClient.readContract({
          address: marketplace,
          abi: RELIX_MARKETPLACE_ABI,
          functionName: "nextListingId",
          args: [],
        });

        const end = Number(nextId) - 1;

        if (!Number.isFinite(end) || end <= 0) {
          if (myReqId === listedReqIdRef.current) {
            setListedItems([]);
            listedLoadedRef.current = true;
          }
          return;
        }

        const start = Math.max(1, end - LISTED_SCAN_WINDOW + 1);

        const contracts = [];
        for (let i = start; i <= end; i++) {
          contracts.push({
            address: marketplace,
            abi: RELIX_MARKETPLACE_ABI,
            functionName: "listings",
            args: [BigInt(i)],
          });
        }

        const res = await publicClient.multicall({
          contracts,
          allowFailure: true,
        });

        if (myReqId !== listedReqIdRef.current) return;

        const wantSeller = String(walletAddress || "").toLowerCase();

        const raw = [];

        res.forEach((r, idx) => {
          if (r.status !== "success" || !r.result) return;

          const listingId = BigInt(start + idx);

          const [seller, nft, tokenId, amount, price, payToken, is1155, active] =
            r.result;

          if (!active) return;
          if (!seller || String(seller).toLowerCase() !== wantSeller) return;

          raw.push({
            listingId,
            seller,
            nft,
            tokenId,
            amount,
            price,
            payToken,
            is1155,
          });
        });

        const enriched = [];

        for (const L of raw) {
          if (myReqId !== listedReqIdRef.current) return;

          let meta = null;
          try {
            meta = await resolveListedMetadata(L.nft, L.tokenId, Boolean(L.is1155));
          } catch {
            meta = null;
          }

          let payInfo = null;
          try {
            payInfo = await getPayTokenInfo(L.payToken);
          } catch {
            payInfo = {
              isNative: true,
              decimals: 18,
              symbol: nativeSymbol(chainId),
              address: zeroAddress,
            };
          }

          const priceRaw = BigInt(L.price ?? 0n);

          const decimals = Number(payInfo?.decimals ?? 18);
          const symbol = String(
            payInfo?.symbol || (payInfo?.isNative ? nativeSymbol(chainId) : "TOKEN")
          );

          const priceFormatted = formatUnits(
            priceRaw,
            Number.isFinite(decimals) ? decimals : 18
          );

          const priceDisplay = `${priceFormatted} ${symbol}`;

          enriched.push({
            collection: String(L.nft || "").toLowerCase(),
            collectionName: meta?.collectionName || "Collection",
            tokenId: String(L.tokenId ?? ""),
            name: meta?.name || `NFT #${String(L.tokenId ?? "")}`,
            image: meta?.image || PLACEHOLDER_IMG,
            tokenUri: meta?.tokenUri || "",
            owner: shortAddress(walletAddress),
            chain: `${network.name} ${network.subtitle}`.trim(),
            status: "Listed",

            listingId: String(L.listingId),
            is1155: Boolean(L.is1155),
            amountRaw: BigInt(L.amount ?? 0n),

            payToken: payInfo?.address || L.payToken,
            paySymbol: symbol,
            payDecimals: Number.isFinite(decimals) ? decimals : 18,

            priceRaw,
            priceFormatted,
            priceDisplay,

            // compat for older grid variants
            price: priceFormatted,
            currency: symbol,
            displayPrice: priceDisplay,
            priceText: priceDisplay,
          });
        }

        enriched.sort((a, b) => Number(b.listingId || 0) - Number(a.listingId || 0));

        if (myReqId === listedReqIdRef.current) {
          setListedItems(enriched);
          listedLoadedRef.current = true;
        }
      } catch (e) {
        if (myReqId !== listedReqIdRef.current) return;

        setListedError(
          e?.message || "We couldn’t load your listings. Please try again."
        );
      } finally {
        if (myReqId === listedReqIdRef.current) setListedLoading(false);
      }
    },
    [
      isWalletReady,
      isSupportedChain,
      marketplace,
      publicClient,
      walletAddress,
      network.name,
      network.subtitle,
      resolveListedMetadata,
      getPayTokenInfo,
      chainId,
    ]
  );

  /* -------------------- Boot loaders -------------------- */
  useEffect(() => {
    if (!isWalletReady) return;
    if (!chainId) return;
    if (!isSupportedChain) return;

    const key = `${chainId}:${String(walletAddress || "").toLowerCase()}`;
    if (bootKeyRef.current === key) return;
    bootKeyRef.current = key;

    setItems([]);
    setListedItems([]);
    listedLoadedRef.current = false;

    setError("");
    setListedError("");
    setPage(1);
    setQuery("");
    setTab("Inventory");
    setInitialLoading(true);

    loadFromApi({ hard: true });
  }, [isWalletReady, chainId, isSupportedChain, walletAddress, loadFromApi]);

  // Listed lazy loader
  useEffect(() => {
    if (!isWalletReady || !isSupportedChain) return;
    if (tab !== "Listed") return;
    if (!marketplace || !publicClient) return;
    if (listedLoadedRef.current) return;

    loadListedFromChain();
  }, [tab, isWalletReady, isSupportedChain, marketplace, publicClient, loadListedFromChain]);

  const onRefresh = useCallback(() => {
    loadFromApi({ hard: true });
    if (tab === "Listed" || listedLoadedRef.current) loadListedFromChain();
  }, [loadFromApi, loadListedFromChain, tab]);

  /* -------------------- Stats -------------------- */
  const stats = useMemo(() => {
    const collected = items.filter((x) => x.status === "Collected").length;
    const created = items.filter((x) => x.status === "Created").length;
    const listed = listedItems.length;
    return { inventory: items.length, collected, created, listed };
  }, [items, listedItems]);

  /* -------------------- Filtering per tab -------------------- */
  const baseItems = useMemo(() => (tab === "Listed" ? listedItems : items), [
    tab,
    listedItems,
    items,
  ]);

  const globallyFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return baseItems;

    return baseItems.filter((it) => {
      const hay = [
        it.name,
        it.collectionName,
        it.tokenId,
        it.owner,
        it.chain,
        it.collection,
        it.status,
        it.listingId,
        it.priceDisplay,
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [baseItems, query]);

  const tabFiltered = useMemo(() => {
    if (tab === "Inventory" || tab === "Listed") return globallyFiltered;
    return globallyFiltered.filter((x) => x.status === tab);
  }, [globallyFiltered, tab]);

  const totalPages = Math.max(1, Math.ceil(tabFiltered.length / PER_PAGE));
  const safePage = clamp(page, 1, totalPages);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PER_PAGE;
    return tabFiltered.slice(start, start + PER_PAGE);
  }, [tabFiltered, safePage]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    setPage(1);
  }, [tab, query]);

  const gridState = useMemo(() => {
    if (!isWalletReady) return "DISCONNECTED";
    if (!isSupportedChain) return "UNSUPPORTED";

    if (tab === "Listed") {
      if (listedLoading && listedItems.length === 0) return "SKELETON";
      if (listedLoading) return "REFRESHING";
    } else {
      const hasData = items.length > 0;
      if ((initialLoading || refreshing) && !hasData) return "SKELETON";
      if (refreshing) return "REFRESHING";
      if (initialLoading && !hasData) return "SKELETON";
    }

    if (pageItems.length === 0) return "EMPTY";
    return "READY";
  }, [
    isWalletReady,
    isSupportedChain,
    tab,
    listedLoading,
    listedItems.length,
    initialLoading,
    refreshing,
    items.length,
    pageItems.length,
  ]);

  const statsSkeleton = useMemo(() => {
    if (!isWalletReady || !isSupportedChain) return false;
    if (tab === "Listed") return listedLoading && listedItems.length === 0;
    return (initialLoading || refreshing) && items.length === 0;
  }, [
    isWalletReady,
    isSupportedChain,
    tab,
    listedLoading,
    listedItems.length,
    initialLoading,
    refreshing,
    items.length,
  ]);

  function InfoDot({ label = "Info", onClick }) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={[
          "inline-flex items-center justify-center",
          "h-5 w-5 rounded-full",
          "border border-slate-200 bg-white",
          "text-[11px] font-extrabold text-slate-700",
          "hover:bg-slate-50 active:scale-[0.98] transition",
        ].join(" ")}
      >
        ?
      </button>
    );
  }

  function Modal({ open, title, children, onClose }) {
    useEffect(() => {
      if (!open) return;
      const onKey = (e) => {
        if (e.key === "Escape") onClose?.();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
      <div className="fixed inset-0 z-[60]">
        <div
          className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold tracking-[0.25em] text-sky-600 uppercase">
                  Help
                </div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">
                  {title}
                </div>
              </div>

              <Button variant="outline" onClick={onClose} className="shrink-0">
                Got it
              </Button>
            </div>

            <div className="mt-4 text-sm text-slate-700 leading-relaxed">
              {children}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-5 md:p-7 relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-[0.25em] text-sky-600 uppercase">
              Profile
            </div>

            <h1 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight">
              Your NFT Collection
            </h1>

            <p className="mt-2 text-sm text-slate-600 max-w-2xl">
              We’ll automatically fetch your NFTs and keep the view up to date.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge>
                {network.name} {network.subtitle}
              </Badge>

              {!isSupportedChain ? (
                <Badge className="border-red-200 bg-red-50 text-red-700">
                  Network not supported
                </Badge>
              ) : null}

              <span className="text-xs text-slate-500">
                Wallet:{" "}
                <span className="font-semibold text-slate-900">
                  {shortAddress(walletAddress)}
                </span>
              </span>

              <span className="text-xs text-slate-500">
                {tab === "Listed"
                  ? listedLoading
                    ? listedItems.length
                      ? "Refreshing your listings…"
                      : "Loading your listings…"
                    : ""
                  : refreshing
                  ? items.length
                    ? "Refreshing…"
                    : "Loading…"
                  : initialLoading
                  ? "Loading…"
                  : ""}
              </span>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={onRefresh}
                className="w-full sm:w-auto"
                disabled={
                  !isWalletReady || !isSupportedChain || refreshing || listedLoading
                }
              >
                Refresh
              </Button>
            </div>
          </div>

          <div className="w-full md:w-[380px]">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, collection, token ID, or price…"
              disabled={!isWalletReady || refreshing || listedLoading}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 items-start">
          {statsSkeleton ? (
            <>
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
            </>
          ) : (
            <>
              {/* Inventory */}
              <div className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">
                      Inventory
                    </div>
                    <div className="mt-2 text-2xl font-extrabold text-slate-900 leading-none">
                      {isWalletReady ? stats.inventory : 0}
                    </div>
                  </div>
                  <InfoDot label="Inventory info" onClick={() => setHelpOpen("inventory")} />
                </div>
              </div>

              {/* Collected */}
              <div className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">
                      Collected
                    </div>
                    <div className="mt-2 text-2xl font-extrabold text-slate-900 leading-none">
                      {isWalletReady ? stats.collected : 0}
                    </div>
                  </div>
                  <InfoDot label="Collected info" onClick={() => setHelpOpen("collected")} />
                </div>
              </div>

              {/* Created */}
              <div className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">
                      Created
                    </div>
                    <div className="mt-2 text-2xl font-extrabold text-slate-900 leading-none">
                      {isWalletReady ? stats.created : 0}
                    </div>
                  </div>
                  <InfoDot label="Created info" onClick={() => setHelpOpen("created")} />
                </div>
              </div>

              {/* Earnings */}
              <div className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">
                      Earnings
                    </div>
                  </div>
                  <InfoDot label="Earnings info" onClick={() => setHelpOpen("earnings")} />
                </div>

                <div className="mt-3 space-y-2">
                  <div>
                    <div className="text-[11px] text-slate-500">Pending (Native)</div>
                    <div className="mt-1 text-sm font-extrabold text-slate-900">
                      {!isWalletReady || !isSupportedChain || !marketplace
                        ? "—"
                        : pendingNativeLoading
                        ? "Checking…"
                        : pendingNativeText}
                    </div>
                  </div>

                  {allowRelixErc20 ? (
                    <div className="pt-2 border-t border-slate-200/70">
                      <div className="mt-2 text-[11px] text-slate-500">
                        Pending ({relixSymbolText})
                      </div>
                      <div className="mt-1 text-sm font-extrabold text-slate-900">
                        {!isWalletReady || !isSupportedChain || !marketplace
                          ? "—"
                          : pendingRelixLoading
                          ? "Checking…"
                          : pendingRelixText}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={
                      !isWalletReady ||
                      !isSupportedChain ||
                      !marketplace ||
                      withdrawing ||
                      confirming ||
                      pendingNative <= 0n
                    }
                    onClick={withdrawNative}
                  >
                    {withdrawing || confirming ? "Processing…" : "Withdraw (Native)"}
                  </Button>

                  {allowRelixErc20 ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={
                        !isWalletReady ||
                        !isSupportedChain ||
                        !marketplace ||
                        !relixTokenAddr ||
                        withdrawing ||
                        confirming ||
                        pendingRelix <= 0n
                      }
                      onClick={withdrawRelixFixed}
                    >
                      {withdrawing || confirming
                        ? "Processing…"
                        : `Withdraw (${relixSymbolText})`}
                    </Button>
                  ) : null}

                  {withdrawErr ? (
                    <div className="text-xs text-rose-600">{withdrawErr}</div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Help Modals */}
      <Modal open={helpOpen === "inventory"} title="Inventory" onClose={() => setHelpOpen(null)}>
        This shows all NFTs currently held by your wallet.
      </Modal>

      <Modal open={helpOpen === "collected"} title="Collected" onClose={() => setHelpOpen(null)}>
        This shows NFTs you received (transfers, purchases, airdrops, and more).
      </Modal>

      <Modal open={helpOpen === "created"} title="Created" onClose={() => setHelpOpen(null)}>
        This shows NFTs minted by your wallet.
      </Modal>

      <Modal open={helpOpen === "listed"} title="Listed" onClose={() => setHelpOpen(null)}>
        This shows NFTs you currently have listed for sale on the marketplace.
      </Modal>

      <Modal open={helpOpen === "earnings"} title="Earnings" onClose={() => setHelpOpen(null)}>
        This is your pending seller balance from completed sales. Use Withdraw to claim it to your wallet.
      </Modal>

      {/* Errors */}
      {error ? (
        <Card className="p-4 border border-red-200 bg-red-50">
          <div className="text-xs font-extrabold text-red-800">
            Something went wrong
          </div>
          <div className="mt-1 text-xs text-red-800 whitespace-pre-wrap">{error}</div>
          <div className="mt-3">
            <Button variant="outline" onClick={onRefresh} disabled={refreshing || listedLoading}>
              Try again
            </Button>
          </div>
        </Card>
      ) : null}

      {listedError ? (
        <Card className="p-4 border border-amber-200 bg-amber-50">
          <div className="text-xs font-extrabold text-amber-800">
            Listings update issue
          </div>
          <div className="mt-1 text-xs text-amber-800 whitespace-pre-wrap">
            {listedError}
          </div>
          <div className="mt-3">
            <Button
              variant="outline"
              onClick={() => loadListedFromChain()}
              disabled={listedLoading}
            >
              Reload listings
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="w-full md:w-auto">
          <div className="w-full inline-flex items-center rounded-2xl border border-slate-200 bg-white shadow-sm p-1 overflow-x-auto">
            <div className="flex items-center gap-1 whitespace-nowrap">
              {tabs.map((t) => {
                const active = tab === t;
                const extraCount =
                  t === "Listed" ? ` (${isWalletReady ? stats.listed : 0})` : "";

                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    disabled={!isWalletReady}
                    className={[
                      "rounded-2xl font-semibold transition whitespace-nowrap",
                      "px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm",
                      active
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100",
                      !isWalletReady ? "opacity-50 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    {t}
                    {extraCount}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between md:justify-end gap-2 w-full md:w-auto">
          <span className="text-xs text-slate-500">
            Showing{" "}
            <span className="font-semibold text-slate-900">
              {isWalletReady ? pageItems.length : 0}
            </span>{" "}
            items
          </span>

          <div className="flex sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setQuery("")}
              className="w-full sm:w-auto"
              disabled={!isWalletReady || refreshing || listedLoading}
            >
              Clear search
            </Button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <section className="space-y-3">
        {gridState === "DISCONNECTED" ? (
          <Card className="p-5">
            <div className="text-sm font-semibold text-slate-900">
              Connect your wallet
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Connect your wallet to view and manage your NFTs.
            </div>
          </Card>
        ) : gridState === "UNSUPPORTED" ? (
          <Card className="p-5">
            <div className="text-sm font-semibold text-slate-900">
              Network not supported
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Please switch to BNB Chain or Relix Testnet.
            </div>
          </Card>
        ) : gridState === "SKELETON" ? (
          <SkeletonGrid
            count={5}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
          />
        ) : gridState === "EMPTY" ? (
          <Card className="p-5">
            <div className="text-sm text-slate-600">
              {tab === "Listed"
                ? "You don’t have any active listings yet."
                : "No NFTs found for this view."}
            </div>
          </Card>
        ) : (
          <>
            <NFTGrid
              items={pageItems}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"
            />

            {gridState === "REFRESHING" ? (
              <div className="text-xs text-slate-500">
                Updating… you can keep browsing while we refresh.
              </div>
            ) : null}
          </>
        )}
      </section>

      {/* Pagination */}
      {isWalletReady ? (
        <Card className="p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-xs text-slate-500 text-center sm:text-left">
              {tabFiltered.length} results in{" "}
              <span className="font-semibold text-slate-900">{tab}</span>
              {query ? (
                <>
                  {" "}
                  • Search:{" "}
                  <span className="font-semibold text-slate-900">"{query}"</span>
                </>
              ) : null}
            </div>

            <div className="w-full sm:w-auto">
              <div className="overflow-x-auto">
                <div className="flex items-center gap-2 whitespace-nowrap justify-center sm:justify-end w-max mx-auto sm:mx-0 px-1">
                  <Button
                    className="hidden sm:inline-flex"
                    variant="outline"
                    onClick={() => setPage(1)}
                    disabled={safePage === 1}
                  >
                    First
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => clamp(p - 1, 1, totalPages))}
                    disabled={safePage === 1}
                  >
                    Prev
                  </Button>

                  <div className="px-3 py-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-900">
                    {safePage}
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => clamp(p + 1, 1, totalPages))}
                    disabled={safePage === totalPages}
                  >
                    Next
                  </Button>

                  <Button
                    className="hidden sm:inline-flex"
                    variant="outline"
                    onClick={() => setPage(totalPages)}
                    disabled={safePage === totalPages}
                  >
                    Last
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
