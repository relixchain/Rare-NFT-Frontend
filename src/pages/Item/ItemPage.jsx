// src/pages/item/ItemPage.jsx
// NOTE (OSS):
// - This file intentionally does NOT introduce any new VITE_* env keys.
// - Keep .env.example aligned with ONLY these keys (used elsewhere in the app):
//   VITE_IPFS_API, VITE_BANNER_API, VITE_UPLOAD_API_KEY, VITE_SCAN_API_BASE

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useAccount,
  useBlockNumber,
  useChainId,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  getAddress,
  isAddress,
  zeroAddress,
  formatUnits,
  parseEther,
  parseUnits,
} from "viem";

import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/cn";

import { RELIX_MARKETPLACE_ABI } from "../../contracts/relixMarketplaceAbi";
import { MARKETPLACE_ADDRESS_BY_CHAIN } from "../../contracts/relixMarketplaceAddress";

/* =========================================================
   PUBLIC CONFIG (safe for open-source)
   - All values below are PUBLIC on-chain or public URLs.
   - If you fork this repo, edit these constants to match your networks.
========================================================= */
const APP_CONFIG = Object.freeze({
  LISTING_LOOKBACK: 400,
  REFRESH_SCAN_EVERY_N_BLOCKS: 3n,

  // Optional: ERC20 token used as a payment currency on a specific chain.
  // Keep as PUBLIC contract addresses only (never keys).
  PAYMENT_TOKENS_BY_CHAIN: Object.freeze({
    56: {
      // BNB Chain mainnet (example)
      RELIX: "0xe36aB5B68Af6180dF1A65D31E61c6af5F5907282",
    },
  }),

  EXPLORER_BASE_BY_CHAIN: Object.freeze({
    56: "https://bscscan.com",
    4127: "https://testnet.relixchain.com",
  }),

  CHAIN_LABEL_BY_ID: Object.freeze({
    56: "BNB Chain",
    4127: "Relix Testnet",
  }),

  NATIVE_SYMBOL_BY_CHAIN: Object.freeze({
    56: "BNB",
    4127: "tRLX",
  }),

  // Public gateways (fine for OSS). If you want your own gateway, replace these strings.
  IPFS_GATEWAY_BASE: "https://ipfs.io/ipfs/",
  ARWEAVE_GATEWAY_BASE: "https://arweave.net/",
});

/** ===== ERC165 Interface IDs =====
 * ERC721:  0x80ac58cd
 * ERC1155: 0xd9b67a26
 */
const ERC165_ABI_MIN = [
  {
    type: "function",
    name: "supportsInterface",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ name: "", type: "bool" }],
  },
];

const ERC721_ABI_MIN = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
];

const ERC1155_ABI_MIN = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "uri",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
];

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

const ERC20_PAY_ABI_MIN = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];

/* ===================== Utils ===================== */
function shortAddress(addr) {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function explorerBase(chainId) {
  return APP_CONFIG.EXPLORER_BASE_BY_CHAIN[Number(chainId)] ?? null;
}

function chainLabel(chainId) {
  return APP_CONFIG.CHAIN_LABEL_BY_ID[Number(chainId)] ?? `Chain ${chainId}`;
}

function nativeSymbol(chainId) {
  return APP_CONFIG.NATIVE_SYMBOL_BY_CHAIN[Number(chainId)] ?? "NATIVE";
}

/** ===== Helpers: resolve IPFS + data:base64 ===== */
function resolveUriToHttp(uri) {
  if (!uri) return null;

  if (uri.startsWith("ipfs://")) {
    const clean = uri.replace("ipfs://", "").replace(/^ipfs\//, "");
    return `${APP_CONFIG.IPFS_GATEWAY_BASE}${clean}`;
  }
  if (uri.startsWith("ar://")) {
    const clean = uri.replace("ar://", "");
    return `${APP_CONFIG.ARWEAVE_GATEWAY_BASE}${clean}`;
  }
  return uri;
}

function decodeDataUriJson(dataUri) {
  try {
    const [meta, payload] = dataUri.split(",");
    if (!payload) return null;

    if (meta.includes(";base64")) {
      const jsonText = atob(payload);
      return JSON.parse(jsonText);
    }

    const jsonText = decodeURIComponent(payload);
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

async function fetchJsonSmart(uri, signal) {
  if (!uri) return null;

  if (uri.startsWith("data:application/json")) {
    return decodeDataUriJson(uri);
  }

  const http = resolveUriToHttp(uri);
  if (!http) return null;

  const res = await fetch(http, { signal });
  if (!res.ok) throw new Error(`Metadata HTTP ${res.status}`);
  return await res.json();
}

function normalizeMetadata(meta) {
  if (!meta || typeof meta !== "object") return null;

  const name = meta.name ? String(meta.name) : null;
  const description = meta.description ? String(meta.description) : null;

  let image = null;
  if (meta.image) image = String(meta.image);
  else if (meta.image_url) image = String(meta.image_url);

  const imageHttp = image ? resolveUriToHttp(image) : null;

  let attributes = [];
  if (Array.isArray(meta.attributes)) {
    attributes = meta.attributes
      .map((a) => {
        const trait = a.trait_type ?? a.trait ?? a.key;
        const value = a.value ?? a.val;
        if (!trait || value === undefined || value === null) return null;
        return { trait: String(trait), value: String(value) };
      })
      .filter(Boolean);
  }

  return { name, description, image: imageHttp, attributes };
}

/**
 * Custom hook (must be called unconditionally).
 * Avoids React warning (setState sync inside effect body).
 */
function useLoadingDots(active, baseText = "Fetching") {
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (!active) return undefined;

    const t = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 450);

    return () => clearInterval(t);
  }, [active]);

  const visibleDots = active ? dots : "";
  return `${baseText}${visibleDots}`;
}

function safeGetAddress(addr) {
  try {
    if (!addr) return null;
    return getAddress(String(addr));
  } catch {
    return null;
  }
}

function isSameAddress(a, b) {
  try {
    if (!a || !b) return false;
    return getAddress(String(a)) === getAddress(String(b));
  } catch {
    return false;
  }
}

function parseListingResult(result, listingId) {
  if (!result) return null;
  const [seller, nft, listedTokenId, amount, price, payToken, is1155, active] = result;
  return {
    listingId: BigInt(listingId),
    seller: String(seller),
    nft: String(nft),
    tokenId: BigInt(listedTokenId),
    amount: BigInt(amount),
    price: BigInt(price),
    payToken: String(payToken),
    is1155: Boolean(is1155),
    active: Boolean(active),
  };
}

/* ===================== Page ===================== */
export function ItemPage() {
  const { address, tokenId } = useParams();

  const chainId = useChainId();
  const { address: me, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

  const collection = useMemo(() => {
    if (!address || !isAddress(address)) return null;
    return getAddress(address);
  }, [address]);

  const tid = useMemo(() => {
    try {
      return BigInt(tokenId ?? "0");
    } catch {
      return 0n;
    }
  }, [tokenId]);

  const marketplace = MARKETPLACE_ADDRESS_BY_CHAIN[chainId];
  const wrongChain = Boolean(collection) && !marketplace;

  // Hard block: wrong chain => do not load NFT data
  const dataEnabled = Boolean(collection) && !wrongChain;

  // Realtime: watch block number
  const { data: blockNumber } = useBlockNumber({
    watch: Boolean(dataEnabled && marketplace),
  });

  // Detect interface
  const { data: isErc721 } = useReadContract({
    abi: ERC165_ABI_MIN,
    address: collection ?? undefined,
    functionName: "supportsInterface",
    args: ["0x80ac58cd"],
    query: { enabled: dataEnabled },
  });

  const { data: isErc1155 } = useReadContract({
    abi: ERC165_ABI_MIN,
    address: collection ?? undefined,
    functionName: "supportsInterface",
    args: ["0xd9b67a26"],
    query: { enabled: dataEnabled },
  });

  const tokenStandard = useMemo(() => {
    if (!dataEnabled) return "UNKNOWN";
    if (isErc721) return "ERC721";
    if (isErc1155) return "ERC1155";
    return "UNKNOWN";
  }, [dataEnabled, isErc721, isErc1155]);

  // Owner / balance (drives "Sell" availability when NOT listed)
  const {
    data: ownerOf,
    isLoading: ownerLoading,
    refetch: refetchOwner,
  } = useReadContract({
    abi: ERC721_ABI_MIN,
    address: collection ?? undefined,
    functionName: "ownerOf",
    args: [tid],
    query: { enabled: dataEnabled && tokenStandard === "ERC721" },
  });

  const {
    data: my1155Balance,
    isLoading: bal1155Loading,
    refetch: refetchBal1155,
  } = useReadContract({
    abi: ERC1155_ABI_MIN,
    address: collection ?? undefined,
    functionName: "balanceOf",
    args: me ? [me, tid] : undefined,
    query: {
      enabled: dataEnabled && Boolean(me) && tokenStandard === "ERC1155",
    },
  });

  const owner = ownerOf ? String(ownerOf) : null;

  const isOwner = useMemo(() => {
    if (!me || !dataEnabled) return false;

    if (tokenStandard === "ERC721") {
      if (!owner) return false;
      return isSameAddress(me, owner);
    }

    if (tokenStandard === "ERC1155") {
      try {
        return BigInt(my1155Balance ?? 0n) > 0n;
      } catch {
        return false;
      }
    }

    return false;
  }, [me, owner, tokenStandard, my1155Balance, dataEnabled]);

  // tokenURI / uri
  const { data: tokenUri721, isLoading: uri721Loading } = useReadContract({
    abi: ERC721_ABI_MIN,
    address: collection ?? undefined,
    functionName: "tokenURI",
    args: [tid],
    query: { enabled: dataEnabled && tokenStandard === "ERC721" },
  });

  const { data: tokenUri1155, isLoading: uri1155Loading } = useReadContract({
    abi: ERC1155_ABI_MIN,
    address: collection ?? undefined,
    functionName: "uri",
    args: [tid],
    query: { enabled: dataEnabled && tokenStandard === "ERC1155" },
  });

  const resolved1155Uri = useMemo(() => {
    const raw = tokenUri1155 ? String(tokenUri1155) : null;
    if (!raw) return null;
    if (!raw.includes("{id}")) return raw;
    const hex = tid.toString(16).padStart(64, "0");
    return raw.replaceAll("{id}", hex);
  }, [tokenUri1155, tid]);

  const tokenUri = useMemo(() => {
    if (!dataEnabled) return null;
    if (tokenStandard === "ERC721") return tokenUri721 ? String(tokenUri721) : null;
    if (tokenStandard === "ERC1155") return resolved1155Uri;
    return null;
  }, [dataEnabled, tokenStandard, tokenUri721, resolved1155Uri]);

  // Fetch metadata
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState(null);

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    async function run() {
      setMeta(null);
      setMetaError(null);
      setMetaLoading(false);

      if (!tokenUri) return;

      setMetaLoading(true);

      try {
        const json = await fetchJsonSmart(tokenUri, ac.signal);
        if (!alive) return;
        setMeta(normalizeMetadata(json));
      } catch (e) {
        if (!alive) return;
        setMetaError(e?.message || "Failed to load metadata");
      } finally {
        if (alive) setMetaLoading(false);
      }
    }

    run();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [tokenUri]);

  // Marketplace: nextListingId
  const {
    data: nextListingIdRaw,
    isLoading: nextIdLoading,
    refetch: refetchNextId,
  } = useReadContract({
    abi: RELIX_MARKETPLACE_ABI,
    address: marketplace,
    functionName: "nextListingId",
    query: { enabled: Boolean(marketplace) },
  });

  const nextListingId = nextListingIdRaw ? BigInt(nextListingIdRaw) : 0n;

  const listingIdsToCheck = useMemo(() => {
    if (!marketplace) return [];
    if (!nextListingId || nextListingId <= 1n) return [];

    const end = nextListingId - 1n;
    const start =
      end > BigInt(APP_CONFIG.LISTING_LOOKBACK)
        ? end - BigInt(APP_CONFIG.LISTING_LOOKBACK) + 1n
        : 1n;

    const ids = [];
    for (let i = end; i >= start; i--) {
      ids.push(i);
      if (i === start) break;
    }
    return ids;
  }, [marketplace, nextListingId]);

  // Pin listingId once found (stop heavy scan)
  const [pinnedListingId, setPinnedListingId] = useState(null);

  // Scan is enabled only if we don't have a pinned listing
  const scanEnabled =
    Boolean(marketplace) && listingIdsToCheck.length > 0 && !pinnedListingId;

  const {
    data: listingsBatch,
    isLoading: listingsLoading,
    refetch: refetchListingsBatch,
  } = useReadContracts({
    contracts: listingIdsToCheck.map((id) => ({
      abi: RELIX_MARKETPLACE_ABI,
      address: marketplace,
      functionName: "listings",
      args: [id],
    })),
    query: { enabled: scanEnabled },
  });

  const matchedListingFromScan = useMemo(() => {
    if (!listingsBatch || !collection) return null;

    for (let idx = 0; idx < listingsBatch.length; idx++) {
      const res = listingsBatch[idx];
      if (!res || res.status !== "success" || !res.result) continue;

      const parsed = parseListingResult(res.result, listingIdsToCheck[idx]);
      if (!parsed?.active) continue;

      // match collection + tokenId
      try {
        if (getAddress(parsed.nft) !== getAddress(collection)) continue;
      } catch {
        continue;
      }
      if (parsed.tokenId !== tid) continue;

      return parsed;
    }
    return null;
  }, [listingsBatch, listingIdsToCheck, collection, tid]);

  // Pin when found
  useEffect(() => {
    if (!pinnedListingId && matchedListingFromScan?.listingId) {
      setPinnedListingId(matchedListingFromScan.listingId);
    }
  }, [pinnedListingId, matchedListingFromScan?.listingId]);

  // Read single pinned listing for realtime updates
  const { data: pinnedListingRaw, refetch: refetchPinnedListing } = useReadContract({
    abi: RELIX_MARKETPLACE_ABI,
    address: marketplace,
    functionName: "listings",
    args: pinnedListingId ? [pinnedListingId] : undefined,
    query: { enabled: Boolean(marketplace && pinnedListingId) },
  });

  const pinnedListing = useMemo(() => {
    if (!pinnedListingId || !pinnedListingRaw) return null;
    return parseListingResult(pinnedListingRaw, pinnedListingId);
  }, [pinnedListingId, pinnedListingRaw]);

  // Validate pinned listing belongs to this item; else unpin
  useEffect(() => {
    if (!pinnedListingId) return;
    if (!pinnedListing) return;

    const ok =
      pinnedListing.active &&
      isSameAddress(pinnedListing.nft, collection) &&
      pinnedListing.tokenId === tid;

    if (!ok) setPinnedListingId(null);
  }, [pinnedListingId, pinnedListing, collection, tid]);

  // Effective listing = pinned if exists, else scan result
  const effectiveListing = pinnedListingId ? pinnedListing : matchedListingFromScan;
  const isListed = Boolean(effectiveListing?.active);

  const isSeller = useMemo(() => {
    if (!isConnected || !me || !effectiveListing?.seller) return false;
    return isSameAddress(me, effectiveListing.seller);
  }, [isConnected, me, effectiveListing?.seller]);

  // Flags
  const loadingAction = isPending || nextIdLoading || listingsLoading;

  const isFetchingCore =
    !dataEnabled ||
    ownerLoading ||
    bal1155Loading ||
    uri721Loading ||
    uri1155Loading ||
    metaLoading;

  const dotsCore = useLoadingDots(isFetchingCore && dataEnabled, "Fetching data");
  const dotsMeta = useLoadingDots(isFetchingCore && dataEnabled, "Loading metadata");
  const dotsImage = useLoadingDots(isFetchingCore && dataEnabled, "Loading image");
  const dotsTraits = useLoadingDots(isFetchingCore && dataEnabled, "Fetching traits");

  // UI
  const uiName = useMemo(() => {
    if (wrongChain) return "WRONG CHAIN";
    return meta?.name ?? (isFetchingCore ? dotsCore : `NFT #${tid.toString()}`);
  }, [wrongChain, meta?.name, isFetchingCore, dotsCore, tid]);

  const uiDesc = useMemo(() => {
    if (wrongChain) {
      return "This item is on a different network. Item data is not loaded. Please switch to a supported chain to view details.";
    }
    return (
      meta?.description ??
      (isFetchingCore ? dotsMeta : metaError ? "Metadata failed to load." : "")
    );
  }, [wrongChain, meta?.description, isFetchingCore, dotsMeta, metaError]);

  const uiImage = wrongChain ? null : meta?.image ?? null;

  // Explorer links
  const explorer = explorerBase(chainId);
  const contractExplorerUrl = explorer && collection ? `${explorer}/address/${collection}` : null;
  const ownerExplorerUrl = explorer && owner ? `${explorer}/address/${owner}` : null;
  const sellerExplorerUrl =
    explorer && effectiveListing?.seller ? `${explorer}/address/${effectiveListing.seller}` : null;

  // Tx UX state
  const [txHash, setTxHash] = useState(null);

  const { isLoading: txConfirming, isSuccess: txSuccess } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    query: { enabled: Boolean(txHash) },
  });

  const [sellOpen, setSellOpen] = useState(false);
  const [sellPrice, setSellPrice] = useState("");
  const [sellError, setSellError] = useState(null);
  const [sellSubmitting, setSellSubmitting] = useState(false);

  const [buyError, setBuyError] = useState(null);
  const [buySubmitting, setBuySubmitting] = useState(false);

  const [cancelError, setCancelError] = useState(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const actionBusy = txConfirming || sellSubmitting || buySubmitting || cancelSubmitting;

  // Add to Wallet state
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState(null);
  const [addSuccess, setAddSuccess] = useState(null);

  // Reset add feedback when item/ownership changes
  useEffect(() => {
    setAddError(null);
    setAddSuccess(null);
    setAddSubmitting(false);
  }, [collection, tid, isOwner, tokenStandard, wrongChain]);

  // Sell: currency selection (RELIX ERC20 ONLY on chain 56 if configured)
  const relixTokenOnChain56 = APP_CONFIG.PAYMENT_TOKENS_BY_CHAIN?.[56]?.RELIX ?? null;
  const allowRelixErc20 = Number(chainId) === 56 && Boolean(relixTokenOnChain56);
  const [sellCurrency, setSellCurrency] = useState("native"); // "native" | "relix"

  useEffect(() => {
    if (!allowRelixErc20 && sellCurrency !== "native") setSellCurrency("native");
  }, [allowRelixErc20, sellCurrency]);

  const selectedPayToken = useMemo(() => {
    if (allowRelixErc20 && sellCurrency === "relix") return getAddress(relixTokenOnChain56);
    return zeroAddress;
  }, [allowRelixErc20, sellCurrency, relixTokenOnChain56]);

  const { data: relixDecimals } = useReadContract({
    abi: ERC20_INFO_ABI_MIN,
    address: allowRelixErc20 && sellCurrency === "relix" ? selectedPayToken : undefined,
    functionName: "decimals",
    query: { enabled: Boolean(allowRelixErc20 && sellCurrency === "relix") },
  });

  const { data: relixSymbol } = useReadContract({
    abi: ERC20_INFO_ABI_MIN,
    address: allowRelixErc20 && sellCurrency === "relix" ? selectedPayToken : undefined,
    functionName: "symbol",
    query: { enabled: Boolean(allowRelixErc20 && sellCurrency === "relix") },
  });

  const relixDecimalsNum = useMemo(() => {
    const n = Number(relixDecimals ?? 18);
    return Number.isFinite(n) ? n : 18;
  }, [relixDecimals]);

  const relixSymbolText = useMemo(() => {
    return relixSymbol ? String(relixSymbol) : "RELIX";
  }, [relixSymbol]);

  async function ensureApproval() {
    if (!collection || !marketplace || !me) throw new Error("Missing params");

    if (tokenStandard === "ERC721") {
      await writeContractAsync({
        abi: ERC721_ABI_MIN,
        address: collection,
        functionName: "approve",
        args: [marketplace, tid],
      });
      return;
    }

    if (tokenStandard === "ERC1155") {
      await writeContractAsync({
        abi: ERC1155_ABI_MIN,
        address: collection,
        functionName: "setApprovalForAll",
        args: [marketplace, true],
      });
      return;
    }

    throw new Error("Unsupported token standard");
  }

  function parseSellPriceToUnits() {
    const v = String(sellPrice || "").trim();
    if (!v || Number(v) <= 0) throw new Error("Invalid price");
    if (selectedPayToken === zeroAddress) return parseEther(v);
    return parseUnits(v, relixDecimalsNum);
  }

  async function submitSell() {
    setSellError(null);
    setBuyError(null);
    setCancelError(null);

    try {
      if (!collection || !marketplace) throw new Error("Invalid params");
      if (!isOwner) throw new Error("Only current owner can list");
      if (wrongChain) throw new Error("Wrong chain");
      if (isListed) throw new Error("Already listed");
      if (txConfirming) throw new Error("Please wait for confirmation.");

      setSellSubmitting(true);

      const priceUnits = parseSellPriceToUnits();
      await ensureApproval();

      let hash;
      if (tokenStandard === "ERC721") {
        hash = await writeContractAsync({
          abi: RELIX_MARKETPLACE_ABI,
          address: marketplace,
          functionName: "listERC721",
          args: [collection, tid, priceUnits, selectedPayToken],
        });
      } else if (tokenStandard === "ERC1155") {
        hash = await writeContractAsync({
          abi: RELIX_MARKETPLACE_ABI,
          address: marketplace,
          functionName: "listERC1155",
          args: [collection, tid, 1n, priceUnits, selectedPayToken],
        });
      } else {
        throw new Error("Unsupported token standard");
      }

      setTxHash(hash);
    } catch (e) {
      setSellSubmitting(false);
      setSellError(e?.message || "Failed to list");
    }
  }

  // Buy logic
  const listingPayTokenAddr = useMemo(() => {
    if (!effectiveListing?.payToken) return null;
    const addr = safeGetAddress(effectiveListing.payToken);
    if (!addr || addr === zeroAddress) return null;
    return addr;
  }, [effectiveListing?.payToken]);

  const listingAmount = useMemo(() => {
    if (!effectiveListing) return 0n;
    if (!effectiveListing.is1155) return 1n;
    return BigInt(effectiveListing.amount ?? 1n);
  }, [effectiveListing]);

  const listingTotalCost = useMemo(() => {
    if (!effectiveListing) return 0n;
    try {
      return BigInt(effectiveListing.price ?? 0n) * BigInt(listingAmount ?? 0n);
    } catch {
      return 0n;
    }
  }, [effectiveListing, listingAmount]);

  const { data: buyAllowance, refetch: refetchAllowance } = useReadContract({
    abi: ERC20_PAY_ABI_MIN,
    address: listingPayTokenAddr ?? undefined,
    functionName: "allowance",
    args: me && marketplace && listingPayTokenAddr ? [me, marketplace] : undefined,
    query: {
      enabled: Boolean(isConnected && isListed && listingPayTokenAddr && marketplace && me),
    },
  });

  const { data: listingErc20Symbol } = useReadContract({
    abi: ERC20_INFO_ABI_MIN,
    address: listingPayTokenAddr ?? undefined,
    functionName: "symbol",
    query: { enabled: Boolean(listingPayTokenAddr) },
  });

  const { data: listingErc20Decimals } = useReadContract({
    abi: ERC20_INFO_ABI_MIN,
    address: listingPayTokenAddr ?? undefined,
    functionName: "decimals",
    query: { enabled: Boolean(listingPayTokenAddr) },
  });

  const listingPaySymbol = useMemo(() => {
    if (!listingPayTokenAddr) return nativeSymbol(chainId);
    return listingErc20Symbol ? String(listingErc20Symbol) : "ERC20";
  }, [listingPayTokenAddr, listingErc20Symbol, chainId]);

  const listingPayDecimalsNum = useMemo(() => {
    const n = Number(listingErc20Decimals ?? 18);
    return Number.isFinite(n) ? n : 18;
  }, [listingErc20Decimals]);

  const formattedListingPrice = useMemo(() => {
    if (!effectiveListing) return "-";
    try {
      const price = BigInt(effectiveListing.price ?? 0n);
      const total = price * BigInt(listingAmount ?? 0n);

      if (!listingPayTokenAddr) {
        return `${formatUnits(total, 18)} ${nativeSymbol(chainId)}`;
      }
      return `${formatUnits(total, listingPayDecimalsNum)} ${listingPaySymbol}`;
    } catch {
      return "-";
    }
  }, [
    effectiveListing,
    listingAmount,
    listingPayTokenAddr,
    chainId,
    listingPayDecimalsNum,
    listingPaySymbol,
  ]);

  async function submitBuy() {
    setBuyError(null);
    setSellError(null);
    setCancelError(null);

    try {
      if (wrongChain) throw new Error("Wrong chain.");
      if (!isConnected) throw new Error("Connect wallet first.");
      if (!marketplace) throw new Error("Marketplace unavailable.");
      if (!effectiveListing?.listingId) throw new Error("Listing not found.");
      if (!isListed) throw new Error("Listing is not active.");
      if (isSeller) throw new Error("You are the seller. Use Cancel Listing.");
      if (txConfirming) throw new Error("Please wait for confirmation.");

      if (listingAmount <= 0n) throw new Error("Invalid amount.");
      if (listingTotalCost <= 0n) throw new Error("Invalid price.");

      setBuySubmitting(true);

      // ERC20 payment
      if (listingPayTokenAddr) {
        const allowance = BigInt(buyAllowance ?? 0n);
        if (allowance < listingTotalCost) {
          const hashApprove = await writeContractAsync({
            abi: ERC20_PAY_ABI_MIN,
            address: listingPayTokenAddr,
            functionName: "approve",
            args: [marketplace, listingTotalCost],
          });
          setTxHash(hashApprove);
          return;
        }

        const hashBuy = await writeContractAsync({
          abi: RELIX_MARKETPLACE_ABI,
          address: marketplace,
          functionName: "buy",
          args: [effectiveListing.listingId, listingAmount],
        });
        setTxHash(hashBuy);
        return;
      }

      // Native payment
      const hashBuy = await writeContractAsync({
        abi: RELIX_MARKETPLACE_ABI,
        address: marketplace,
        functionName: "buy",
        args: [effectiveListing.listingId, listingAmount],
        value: listingTotalCost,
      });
      setTxHash(hashBuy);
    } catch (e) {
      setBuySubmitting(false);
      setBuyError(e?.message || "Buy failed.");
    }
  }

  // Cancel listing
  async function submitCancel() {
    setCancelError(null);
    setSellError(null);
    setBuyError(null);

    try {
      if (wrongChain) throw new Error("Wrong chain.");
      if (!isConnected) throw new Error("Connect wallet first.");
      if (!marketplace) throw new Error("Marketplace unavailable.");
      if (!effectiveListing?.listingId) throw new Error("Listing not found.");
      if (!isListed) throw new Error("Listing is not active.");
      if (!isSeller) throw new Error("Only seller can cancel this listing.");
      if (txConfirming) throw new Error("Please wait for confirmation.");

      setCancelSubmitting(true);

      const hashCancel = await writeContractAsync({
        abi: RELIX_MARKETPLACE_ABI,
        address: marketplace,
        functionName: "cancel",
        args: [effectiveListing.listingId],
      });

      setTxHash(hashCancel);
    } catch (e) {
      setCancelSubmitting(false);
      setCancelError(e?.message || "Cancel failed.");
    }
  }

  // Add to Wallet DISABLE RULES
  const canAddToWallet = useMemo(() => {
    if (wrongChain) return false;
    if (!dataEnabled) return false;
    if (!isConnected) return false;
    if (!isOwner) return false; // only owner can add
    if (tokenStandard !== "ERC721" && tokenStandard !== "ERC1155") return false;
    return true;
  }, [wrongChain, dataEnabled, isConnected, isOwner, tokenStandard]);

  const addToWalletDisabledReason = useMemo(() => {
    if (wrongChain) return "Wrong chain.";
    if (!dataEnabled) return "Invalid item.";
    if (!isConnected) return "Connect wallet first.";
    if (!isOwner) return "Only the owner can add this NFT to the wallet.";
    if (tokenStandard !== "ERC721" && tokenStandard !== "ERC1155")
      return "Unsupported token standard.";
    return "";
  }, [wrongChain, dataEnabled, isConnected, isOwner, tokenStandard]);

  // Add to Wallet (wallet_watchAsset)
  async function onAddToWallet() {
    setAddError(null);
    setAddSuccess(null);

    if (!canAddToWallet) {
      setAddError(addToWalletDisabledReason || "Not allowed.");
      return;
    }

    try {
      if (typeof window === "undefined") throw new Error("Browser only.");

      const eth = window.ethereum;
      if (!eth?.request) throw new Error("Wallet provider not found (window.ethereum).");
      if (!collection) throw new Error("Invalid collection.");

      setAddSubmitting(true);

      // Keep only http(s) image for wallets
      const imageHttp =
        uiImage && /^https?:\/\//i.test(String(uiImage)) ? String(uiImage) : undefined;

      const params = {
        type: tokenStandard, // "ERC721" | "ERC1155"
        options: {
          address: collection,
          tokenId: tid.toString(),
          ...(imageHttp ? { image: imageHttp } : {}),
          ...(meta?.name ? { name: String(meta.name) } : {}),
        },
      };

      const ok = await eth.request({
        method: "wallet_watchAsset",
        params,
      });

      if (ok === false) {
        setAddError("Wallet rejected the request.");
      } else {
        setAddSuccess("Add to Wallet request sent.");
      }
    } catch (e) {
      setAddError(e?.message || "Failed to add NFT to wallet.");
    } finally {
      setAddSubmitting(false);
    }
  }

  // Realtime refetch helpers
  const refetchAll = async () => {
    await Promise.allSettled([
      refetchNextId?.(),
      refetchListingsBatch?.(),
      refetchPinnedListing?.(),
      refetchOwner?.(),
      refetchBal1155?.(),
      refetchAllowance?.(),
    ]);
  };

  // When tx is confirmed => refetch immediately => UI updates without reload
  useEffect(() => {
    if (!txSuccess) return;

    (async () => {
      await refetchAll();
      setSellSubmitting(false);
      setBuySubmitting(false);
      setCancelSubmitting(false);
      setTxHash(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txSuccess]);

  // Keep Sell form closed if listed
  useEffect(() => {
    if (isListed) setSellOpen(false);
  }, [isListed]);

  // Realtime block watcher
  const lastScanBlockRef = useRef(0n);

  useEffect(() => {
    if (!blockNumber) return;
    if (wrongChain || !marketplace || !dataEnabled) return;

    const bn = BigInt(blockNumber);

    if (pinnedListingId) {
      refetchPinnedListing?.();
      refetchOwner?.();
      refetchBal1155?.();
      return;
    }

    if (bn - lastScanBlockRef.current >= APP_CONFIG.REFRESH_SCAN_EVERY_N_BLOCKS) {
      lastScanBlockRef.current = bn;
      refetchNextId?.();
      refetchListingsBatch?.();
      refetchOwner?.();
      refetchBal1155?.();
    }
  }, [
    blockNumber,
    wrongChain,
    marketplace,
    dataEnabled,
    pinnedListingId,
    refetchPinnedListing,
    refetchNextId,
    refetchListingsBatch,
    refetchOwner,
    refetchBal1155,
  ]);

  // Primary button rules
  const primaryAction = useMemo(() => {
    if (wrongChain) return { label: "Wrong Chain", mode: "wrong_chain", disabled: true };

    if (isListed) {
      if (isSeller) return { label: "Cancel Listing", mode: "cancel" };
      return { label: "Buy", mode: "buy" };
    }

    if (isOwner) return { label: "Sell NFT", mode: "sell" };
    return { label: "Not Listed", mode: "not_listed", disabled: true };
  }, [wrongChain, isListed, isSeller, isOwner]);

  async function onPrimaryClick() {
    if (!collection) return;

    if (primaryAction.mode === "sell") {
      setSellOpen((v) => !v);
      return;
    }

    if (primaryAction.mode === "cancel") {
      await submitCancel();
      return;
    }

    if (primaryAction.mode === "buy") {
      await submitBuy();
    }
  }

  // Info rows
  const infoRows = useMemo(() => {
    const rows = [
      { label: "Standard", value: tokenStandard, href: null, mono: false },
      {
        label: "Contract",
        value: collection ? shortAddress(collection) : "-",
        href: contractExplorerUrl,
        mono: false,
      },
      {
        label: "Owner (On-chain)",
        value:
          tokenStandard === "ERC721"
            ? owner
              ? shortAddress(owner)
              : dataEnabled
              ? isFetchingCore
                ? dotsCore
                : "-"
              : "-"
            : tokenStandard === "ERC1155"
            ? me
              ? `${formatUnits(BigInt(my1155Balance ?? 0n), 0)} (balance)`
              : "Connect wallet"
            : "-",
        href: tokenStandard === "ERC721" ? ownerExplorerUrl : null,
        mono: false,
      },
    ];

    if (!wrongChain && isListed && effectiveListing?.seller) {
      rows.push({
        label: "Seller",
        value: shortAddress(effectiveListing.seller),
        href: sellerExplorerUrl,
        mono: false,
      });
      if (marketplace) {
        rows.push({
          label: "Marketplace",
          value: shortAddress(marketplace),
          href: explorer ? `${explorer}/address/${marketplace}` : null,
          mono: false,
        });
      }
    }

    rows.push(
      {
        label: "Status",
        value: wrongChain
          ? "Wrong Chain"
          : loadingAction
          ? "Syncing..."
          : isListed
          ? "Listed"
          : "Not Listed",
        href: null,
        mono: false,
      },
      {
        label: "Token URI",
        value: tokenUri ? String(tokenUri) : dataEnabled ? (isFetchingCore ? dotsCore : "-") : "-",
        href: null,
        mono: true,
      }
    );

    return rows;
  }, [
    tokenStandard,
    collection,
    contractExplorerUrl,
    owner,
    ownerExplorerUrl,
    wrongChain,
    loadingAction,
    isListed,
    tokenUri,
    dataEnabled,
    isFetchingCore,
    dotsCore,
    me,
    my1155Balance,
    effectiveListing?.seller,
    sellerExplorerUrl,
    marketplace,
    explorer,
  ]);

  const actionStatusText = useMemo(() => {
    if (wrongChain) return "Switch chain to load item data and interact.";
    if (!isConnected) return "Connect wallet to interact.";
    if (isListed && isSeller) return "You are the seller of this listing.";
    if (isListed && !isSeller) return "You are viewing a listed item.";
    if (!isListed && isOwner) return "You are the current owner.";
    return "You are viewing this NFT.";
  }, [wrongChain, isConnected, isListed, isSeller, isOwner]);

  const addBtnDisabled = loadingAction || actionBusy || addSubmitting || !canAddToWallet;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT */}
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="aspect-square bg-slate-50 relative">
          {wrongChain ? (
            <div className="h-full w-full flex items-center justify-center px-8 text-center">
              <div>
                <div className="text-sm font-extrabold text-slate-900">WRONG CHAIN</div>
                <div className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Item data is not loaded. Please switch to <b>BNB Chain (56)</b> or{" "}
                  <b>Relix Testnet (4127)</b> to view this NFT.
                </div>
              </div>
            </div>
          ) : !uiImage ? (
            <div className="h-full w-full flex items-center justify-center">
              <div className="text-sm text-slate-500">{dotsImage}</div>
            </div>
          ) : (
            <img
              src={uiImage}
              alt={uiName}
              className="h-full w-full object-cover select-none"
              draggable={false}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}

          <div className="absolute top-3 left-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-700 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-linear-to-r from-sky-400 via-blue-500 to-indigo-500" />
              {wrongChain
                ? "Wrong Chain"
                : loadingAction
                ? "Syncing"
                : isListed
                ? "Listed"
                : "Not Listed"}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-white/70 backdrop-blur">
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-slate-900 truncate">{uiName}</div>
            <div className="mt-1 text-xs text-slate-500 truncate">
              {chainLabel(chainId)} • #{tid.toString()}
            </div>
          </div>
        </div>
      </Card>

      {/* RIGHT */}
      <div className="space-y-4">
        {/* Title + desc */}
        <Card className="p-5">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
            {uiName}
          </h1>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">{uiDesc}</p>
          {!wrongChain && metaError ? (
            <div className="mt-2 text-xs text-rose-600">Metadata error: {metaError}</div>
          ) : null}
        </Card>

        {/* INFORMATION */}
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-extrabold text-slate-900">NFT INFORMATION</div>
            {collection ? (
              <Link
                to={`/collection/${collection}`}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                View collection →
              </Link>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {infoRows.map((r) => (
              <div
                key={r.label}
                className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-3"
              >
                <div className="text-xs font-semibold tracking-[0.18em] uppercase text-slate-500">
                  {r.label}
                </div>

                <div className="text-right max-w-[70%] break-words">
                  {r.href ? (
                    <a
                      href={r.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-extrabold text-sky-600 hover:text-sky-700 hover:underline"
                    >
                      {r.value}
                    </a>
                  ) : (
                    <span
                      className={
                        r.mono
                          ? "font-mono text-xs font-semibold text-slate-800"
                          : "text-sm font-extrabold text-slate-900"
                      }
                    >
                      {r.value}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ACTION */}
        <Card className="p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">Action</div>
              <div className="mt-1 text-base font-extrabold text-slate-900">
                {wrongChain ? "Wrong Chain" : isListed ? "Marketplace Listing" : "Not Listed"}
              </div>
              <div className="mt-1 text-xs text-slate-500">{actionStatusText}</div>
            </div>

            <div className="text-right">
              <div className="text-xs text-slate-500">Status</div>
              <div className="mt-1 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {wrongChain ? "Wrong Chain" : loadingAction ? "Syncing..." : isListed ? "Listed" : "Not Listed"}
              </div>
            </div>
          </div>

          {/* Price */}
          {!wrongChain && isListed && effectiveListing ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-500">
                Price
              </div>
              <div className="mt-1 text-sm font-extrabold text-slate-900">{formattedListingPrice}</div>
              {effectiveListing.is1155 ? (
                <div className="mt-1 text-[11px] text-slate-500">Amount: {listingAmount.toString()}</div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              className="w-full"
              disabled={
                wrongChain ||
                loadingAction ||
                primaryAction.disabled ||
                actionBusy ||
                (!isConnected && primaryAction.mode !== "sell")
              }
              onClick={onPrimaryClick}
            >
              {actionBusy ? "Waiting confirmation..." : loadingAction ? "Processing..." : primaryAction.label}
            </Button>

            <Button
              className={cn("w-full", addBtnDisabled && "opacity-50 cursor-not-allowed pointer-events-none")}
              variant="outline"
              disabled={addBtnDisabled}
              onClick={!addBtnDisabled ? onAddToWallet : undefined}
              title={canAddToWallet ? "Add this NFT to your wallet (wallet_watchAsset)" : addToWalletDisabledReason}
              aria-disabled={addBtnDisabled}
            >
              {addSubmitting ? "Adding..." : "Add to Wallet"}
            </Button>
          </div>

          {addError ? <div className="mt-2 text-xs text-rose-600">{addError}</div> : null}
          {addSuccess ? <div className="mt-2 text-xs text-emerald-600">{addSuccess}</div> : null}

          {buyError ? <div className="mt-2 text-xs text-rose-600">{buyError}</div> : null}
          {sellError ? <div className="mt-2 text-xs text-rose-600">{sellError}</div> : null}
          {cancelError ? <div className="mt-2 text-xs text-rose-600">{cancelError}</div> : null}

          {/* Sell Form */}
          {sellOpen && !wrongChain && isOwner && !isListed ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-extrabold text-slate-900">Create Listing</div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-500">
                    Currency
                  </div>

                  <select
                    value={sellCurrency}
                    onChange={(e) => setSellCurrency(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
                    disabled={sellSubmitting || txConfirming}
                  >
                    <option value="native">{nativeSymbol(chainId)} (Native)</option>
                    {allowRelixErc20 ? <option value="relix">{relixSymbolText} (ERC20)</option> : null}
                  </select>

                  {allowRelixErc20 && sellCurrency === "relix" ? (
                    <div className="mt-2 text-[11px] text-slate-500 break-all">
                      Token: {relixTokenOnChain56}
                    </div>
                  ) : null}

                  {!allowRelixErc20 ? (
                    <div className="mt-2 text-[11px] text-slate-500">
                      ERC20 payments are not available on this network.
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-500">
                    Price
                  </div>
                  <input
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    placeholder={
                      sellCurrency === "native"
                        ? `e.g. 1.25 ${nativeSymbol(chainId)}`
                        : `e.g. 100 ${relixSymbolText}`
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none"
                    disabled={sellSubmitting || txConfirming}
                  />
                  <div className="mt-2 text-[11px] text-slate-500">
                    {sellCurrency === "native"
                      ? "Price will be listed in native currency."
                      : `Price will be listed in ${relixSymbolText} (decimals: ${relixDecimalsNum}).`}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={loadingAction || isPending || sellSubmitting || txConfirming} onClick={submitSell}>
                  {sellSubmitting || txConfirming ? "Listing..." : "Approve & List"}
                </Button>
                <Button
                  variant="outline"
                  disabled={loadingAction || isPending || sellSubmitting || txConfirming}
                  onClick={() => setSellOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        {/* TRAITS */}
        <Card className="p-5">
          <div className="text-sm font-extrabold text-slate-900">Traits</div>

          {wrongChain ? (
            <div className="mt-3 text-sm text-slate-500">Traits are not loaded on the wrong chain.</div>
          ) : !meta && metaLoading ? (
            <div className="mt-3 text-sm text-slate-500">{dotsTraits}</div>
          ) : meta?.attributes?.length ? (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
              {meta.attributes.map((a, i) => (
                <div key={`${a.trait}-${a.value}-${i}`} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-500">
                    {a.trait}
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-slate-900 truncate">{a.value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-500">
              {metaError ? "No traits (metadata failed)." : "No attributes found."}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
