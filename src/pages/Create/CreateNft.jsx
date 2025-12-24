// src/pages/Create/CreateNft.jsx
/* cspell:ignore wagmi ipfsUri gatewayUrl nonce JWT CID webp */
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  usePublicClient,
} from "wagmi";
import { bsc } from "viem/chains";
import { decodeEventLog, isAddress, zeroAddress, getAddress } from "viem";
import { relixTestnet } from "../../lib/chains";
import { setPageMeta } from "../../lib/meta";

import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { cn } from "../../lib/cn";

import { FactoryAbi, getFactoryAddress } from "../../contracts";
import { BlockchainLoadingModal } from "../../components/ui/BlockchainLoadingModal";

/* -------------------- Utils -------------------- */
function shortAddress(addr) {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function explorerAddressUrl(chainId, addr) {
  if (!addr) return "";
  if (chainId === bsc.id) return `https://bscscan.com/address/${addr}`;
  if (chainId === relixTestnet.id) return `https://testnet.relixchain.com/address/${addr}`;
  return "";
}

function explorerTxUrl(chainId, txHash) {
  if (!txHash) return "";
  if (chainId === bsc.id) return `https://bscscan.com/tx/${txHash}`;
  if (chainId === relixTestnet.id) return `https://testnet.relixchain.com/tx/${txHash}`;
  return "";
}

function storageKeyForCollection(chainId, collection) {
  return `collectionMeta.${chainId}.${String(collection || "").toLowerCase()}`;
}

function safeGetCollectionMeta(chainId, collection) {
  try {
    const key = storageKeyForCollection(chainId, collection);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function safeSetCollectionMeta(chainId, collection, meta) {
  try {
    const key = storageKeyForCollection(chainId, collection);
    localStorage.setItem(key, JSON.stringify(meta || {}));
  } catch {}
}

function pickErr(e) {
  return e?.shortMessage || e?.message || (typeof e === "string" ? e : "") || "Unknown error";
}

async function safeJson(res) {
  const text = await res.text();
  if (!text) return { ok: res.ok, status: res.status, json: null, raw: "" };
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text), raw: text };
  } catch {
    return { ok: res.ok, status: res.status, json: null, raw: text };
  }
}

function normalizeBaseUrl(s) {
  return String(s || "").trim().replace(/\/+$/, "");
}

function joinUrl(base, path) {
  const b = normalizeBaseUrl(base);
  const p = String(path || "").startsWith("/") ? String(path) : `/${path}`;
  return `${b}${p}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const signal = options.signal;

  const onAbort = () => ac.abort();
  try {
    if (signal) signal.addEventListener("abort", onAbort);
    const r = await fetch(url, { ...options, signal: ac.signal });
    return r;
  } catch (e) {
    const isAbort = String(e?.name || "").toLowerCase().includes("abort");
    const msg = isAbort
      ? "Request timeout / aborted."
      : "Network error / CORS blocked / DNS/SSL issue.";
    throw new Error(`${msg}\nURL: ${url}`);
  } finally {
    clearTimeout(t);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

function explainUploadFail(status, raw, json, url, hasKey) {
  const msg = json?.error || json?.message || raw || "Request failed";

  if (status === 401) {
    return (
      `Unauthorized (401): upload endpoint requires API key.\n` +
      `- Frontend key present: ${hasKey ? "YES" : "NO"}\n` +
      `- Ensure VITE_UPLOAD_API_KEY matches server key\n\n` +
      `${msg}\nURL: ${url}`
    );
  }
  if (status === 403) {
    return (
      `Forbidden (403): server rejected origin or key.\n` +
      `- Check ALLOWED_ORIGINS on server\n` +
      `- Verify API key\n\n${msg}\nURL: ${url}`
    );
  }
  if (status === 404) {
    return (
      `Not Found (404): upload route not reachable.\n` +
      `Most common causes:\n` +
      `- Reverse proxy forwards /scan but NOT /ipfs\n` +
      `- OPTIONS preflight to /ipfs/* returns 404 (because you send x-api-key)\n\n` +
      `Fix: forward /ipfs/* to your Node app and allow OPTIONS.\n\n` +
      `${msg}\nURL: ${url}`
    );
  }
  if (status === 413) return `File too large (413).\n${msg}\nURL: ${url}`;
  if (status === 429) return `Rate limited (429).\n${msg}\nURL: ${url}`;
  return `Upload failed (${status}).\n${msg}\nURL: ${url}`;
}

/* -------------------- Minimal ABIs -------------------- */
const ERC721_META_ABI_MIN = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
];

const Mint721Abi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenName", type: "string" },
      { name: "imageURI", type: "string" },
      { name: "tokenURI", type: "string" },
      { name: "userInfo", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "safeMint",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "uri", type: "string" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "uri", type: "string" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "mintTo",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "uri", type: "string" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "event",
    name: "Transfer",
    anonymous: false,
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: true, name: "tokenId", type: "uint256" },
    ],
  },
];

const Mint1155Abi = [
  {
    type: "function",
    name: "mint1155",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "uri", type: "string" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "uri", type: "string" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "event",
    name: "TransferSingle",
    anonymous: false,
    inputs: [
      { indexed: true, name: "operator", type: "address" },
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "id", type: "uint256" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
];

/* -------------------- Limits -------------------- */
const MAX_MB = 2;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const MAX_NAME_LEN = 80;
const MAX_USERINFO_LEN = 200;
const MAX_URI_LEN_SOFT = 600;
const MAX_BPS = 10000;

/* -------------------- UI helpers -------------------- */
function FieldRow({ label, value, mono = true, actions }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">
            {label}
          </div>
          <div className={cn("mt-1 text-sm text-slate-900 break-all", mono && "font-mono text-[12px]")}>
            {value || "—"}
          </div>
        </div>
        {actions ? <div className="shrink-0 flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/* -------------------- Page -------------------- */
export function CreateNft() {
  const { pathname } = useLocation();

  // ✅ OSS-safe: no hardcoded domains
  const SCAN_API_BASE = normalizeBaseUrl(
    (typeof window !== "undefined" && window.__RELIX_SCAN_API__) ||
      import.meta.env.VITE_SCAN_API_BASE ||
      ""
  );

  const IPFS_API_BASE = normalizeBaseUrl(
    (typeof window !== "undefined" && window.__RELIX_IPFS_API__) ||
      import.meta.env.VITE_IPFS_API ||
      ""
  );

  // fallback upload base: IPFS_API_BASE -> SCAN_API_BASE (if your server serves /ipfs on same host)
  const UPLOAD_API_BASE = IPFS_API_BASE || SCAN_API_BASE || "";

  const UPLOAD_KEY = String(import.meta.env.VITE_UPLOAD_API_KEY || "").trim();
  const hasUploadKey = Boolean(UPLOAD_KEY);

  const { address: connectedAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();

  const isSupportedChain = chainId === relixTestnet.id || chainId === bsc.id;

  const network = useMemo(() => {
    if (chainId === relixTestnet.id) {
      return {
        name: relixTestnet.name,
        chainId: relixTestnet.id,
        symbol: relixTestnet.nativeCurrency.symbol,
      };
    }
    if (chainId === bsc.id) {
      return { name: "BNB Chain", chainId: bsc.id, symbol: bsc.nativeCurrency.symbol };
    }
    return { name: "Unsupported", chainId: chainId || 0, symbol: "-" };
  }, [chainId]);

  const currencySymbol = network.symbol;

  useEffect(() => {
    if (!pathname || !pathname.startsWith("/create")) return;

    setPageMeta({
      title: "Create NFT",
      description: "Upload artwork, generate metadata, and mint NFTs securely.",
    });
    document.title = "Create NFT — RARE NFT";

    const t = setTimeout(() => {
      if (pathname.startsWith("/create")) {
        setPageMeta({
          title: "Create NFT",
          description: "Upload artwork, generate metadata, and mint NFTs securely.",
        });
        document.title = "Create NFT — RARE NFT";
      }
    }, 0);

    return () => clearTimeout(t);
  }, [pathname]);

  const factoryAddress = useMemo(() => {
    try {
      return chainId ? getFactoryAddress(chainId) : null;
    } catch {
      return null;
    }
  }, [chainId]);

  const {
    data: onchainCollections,
    isLoading: loadingCollections,
    refetch: refetchCollections,
    isFetching: fetchingCollections,
  } = useReadContract({
    abi: FactoryAbi,
    address: factoryAddress || undefined,
    functionName: "getCollections",
    args: connectedAddress ? [connectedAddress] : undefined,
    query: {
      enabled: !!connectedAddress && !!factoryAddress && isSupportedChain,
      refetchInterval: 8000,
    },
  });

  const collectionOptions = useMemo(() => {
    const list = Array.isArray(onchainCollections) ? onchainCollections : [];
    return list
      .filter((a) => typeof a === "string" && isAddress(a))
      .map((addr) => {
        const checksum = getAddress(addr);
        const meta = safeGetCollectionMeta(chainId, checksum);
        const label = meta?.name ? `${meta.name} (${meta.symbol || "COLL"})` : shortAddress(checksum);
        return { address: checksum, label, meta };
      });
  }, [onchainCollections, chainId]);

  // form state
  const [selectedCollection, setSelectedCollection] = useState("");
  const [standard, setStandard] = useState("ERC721");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [royaltyBps, setRoyaltyBps] = useState(250);
  const [supply, setSupply] = useState(1);
  const [traits, setTraits] = useState([{ trait_type: "Edition", value: "Genesis" }]);

  const [listOnMarket, setListOnMarket] = useState(false);
  const [price, setPrice] = useState("1");

  const [isCreating, setIsCreating] = useState(false);
  const [status, setStatus] = useState("");
  const [errorBox, setErrorBox] = useState("");

  const [chainPhase, setChainPhase] = useState("idle");

  const [resultUris, setResultUris] = useState(null);
  const [mintResult, setMintResult] = useState(null);
  const [lastSuccess, setLastSuccess] = useState(null);

  const [uploadDebug, setUploadDebug] = useState({ imageUrl: "", metaUrl: "" });

  const uploadAbortRef = useRef(null);

  // keep listing disabled (coming soon)
  useEffect(() => {
    if (listOnMarket) setListOnMarket(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listOnMarket]);

  const [copiedKey, setCopiedKey] = useState("");
  const copiedTimerRef = useRef(null);
  const flashCopied = useCallback((key) => {
    setCopiedKey(key);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedKey(""), 1200);
  }, []);
  useEffect(() => () => copiedTimerRef.current && clearTimeout(copiedTimerRef.current), []);

  const effectiveCollectionAddress = selectedCollection;

  const selectedOption = useMemo(() => {
    return collectionOptions.find((o) => o.address === selectedCollection) || null;
  }, [collectionOptions, selectedCollection]);

  const selectedCollectionChecksum = useMemo(() => {
    if (!effectiveCollectionAddress || !isAddress(effectiveCollectionAddress)) return null;
    try {
      return getAddress(effectiveCollectionAddress);
    } catch {
      return null;
    }
  }, [effectiveCollectionAddress]);

  const { data: selName } = useReadContract({
    abi: ERC721_META_ABI_MIN,
    address: selectedCollectionChecksum ?? undefined,
    functionName: "name",
    query: { enabled: Boolean(isSupportedChain && selectedCollectionChecksum) },
  });

  const { data: selSymbol } = useReadContract({
    abi: ERC721_META_ABI_MIN,
    address: selectedCollectionChecksum ?? undefined,
    functionName: "symbol",
    query: { enabled: Boolean(isSupportedChain && selectedCollectionChecksum) },
  });

  const selectedCollectionMeta = useMemo(() => {
    if (!selectedCollectionChecksum) return null;
    const cached = safeGetCollectionMeta(chainId, selectedCollectionChecksum);
    if (cached?.name) return cached;

    const fallback = selectedOption?.meta || null;
    const onchain = { name: selName ? String(selName) : "", symbol: selSymbol ? String(selSymbol) : "" };
    if (onchain.name || onchain.symbol) return onchain;
    return fallback;
  }, [chainId, selectedCollectionChecksum, selName, selSymbol, selectedOption]);

  useEffect(() => {
    if (!selectedCollectionChecksum) return;
    const n = selName ? String(selName) : "";
    const s = selSymbol ? String(selSymbol) : "";
    if (!n && !s) return;

    const existing = safeGetCollectionMeta(chainId, selectedCollectionChecksum);
    if (existing?.name && existing?.symbol) return;

    safeSetCollectionMeta(chainId, selectedCollectionChecksum, {
      name: n || existing?.name || "",
      symbol: s || existing?.symbol || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, selectedCollectionChecksum, selName, selSymbol]);

  const revokePreview = useCallback(() => {
    try {
      if (preview) URL.revokeObjectURL(preview);
    } catch {}
  }, [preview]);

  const resetAll = useCallback(
    (opts = { resetCollection: true, clearSuccess: false }) => {
      setErrorBox("");
      setStatus("");
      setResultUris(null);
      setMintResult(null);
      setUploadDebug({ imageUrl: "", metaUrl: "" });

      if (opts?.clearSuccess) setLastSuccess(null);

      setStandard("ERC721");
      setName("");
      setDescription("");
      setExternalUrl("");
      setRoyaltyBps(250);
      setSupply(1);
      setTraits([{ trait_type: "Edition", value: "Genesis" }]);

      setListOnMarket(false);
      setPrice("1");

      setFile(null);
      revokePreview();
      setPreview("");

      if (opts?.resetCollection) setSelectedCollection("");
    },
    [revokePreview]
  );

  useEffect(() => {
    if (!collectionOptions.length) return;
    const exists = collectionOptions.some((o) => o.address === selectedCollection);
    if (!selectedCollection || !exists) setSelectedCollection(collectionOptions[0].address);
  }, [collectionOptions, selectedCollection]);

  useEffect(() => {
    resetAll({ resetCollection: true, clearSuccess: true });
    setChainPhase("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId]);

  const prevAddrRef = useRef(null);
  useEffect(() => {
    const prev = prevAddrRef.current;
    if (prev && connectedAddress && prev.toLowerCase() !== connectedAddress.toLowerCase()) {
      resetAll({ resetCollection: true, clearSuccess: true });
      setChainPhase("idle");
    }
    prevAddrRef.current = connectedAddress || null;
  }, [connectedAddress, resetAll]);

  useEffect(() => () => revokePreview(), [revokePreview]);

  const onPickFile = (f) => {
    setErrorBox("");
    if (!f) return;

    if (!f.type?.startsWith("image/")) return setErrorBox("Please upload an image file (PNG / JPG / WEBP).");
    if (f.size > MAX_BYTES) return setErrorBox(`File is too large. Max size is ${MAX_MB}MB.`);

    setFile(f);
    revokePreview();
    setPreview(URL.createObjectURL(f));
  };

  const addTrait = () => setTraits((p) => [...p, { trait_type: "", value: "" }]);
  const removeTrait = (idx) => setTraits((p) => p.filter((_, i) => i !== idx));
  const updateTrait = (idx, key, val) => setTraits((p) => p.map((t, i) => (i === idx ? { ...t, [key]: val } : t)));

  const nameTrim = (name || "").trim();
  const descTrim = (description || "").trim();
  const externalTrim = (externalUrl || "").trim();

  const userInfo = useMemo(() => {
    const base = externalTrim || descTrim || "";
    return String(base).slice(0, MAX_USERINFO_LEN);
  }, [externalTrim, descTrim]);

  const submitBlockers = useMemo(() => {
    const blockers = [];

    // env blockers (OSS-friendly)
    if (!UPLOAD_API_BASE) blockers.push("Missing IPFS API base. Set VITE_IPFS_API (or serve /ipfs on VITE_SCAN_API_BASE).");
    if (!SCAN_API_BASE) blockers.push("Missing Scan API base. Set VITE_SCAN_API_BASE.");

    if (!isConnected) blockers.push("Connect your wallet to continue.");
    if (!isSupportedChain) blockers.push("Please switch to BNB Chain or Relix Testnet.");
    if (!publicClient) blockers.push("Web3 client is not ready. Check your wallet connection.");
    if (!factoryAddress) blockers.push("Factory address is missing for this network.");
    if (!effectiveCollectionAddress || !isAddress(effectiveCollectionAddress)) blockers.push("Please select a collection.");

    if (!file) blockers.push("Please upload your artwork image.");
    if (nameTrim.length < 2) blockers.push("NFT name must be at least 2 characters.");
    if (nameTrim.length > MAX_NAME_LEN) blockers.push(`NFT name is too long. Max ${MAX_NAME_LEN} characters.`);
    if (descTrim.length < 2) blockers.push("Please add a short description.");

    const bps = clampInt(royaltyBps, 0, MAX_BPS);
    if (Number(royaltyBps) !== bps) blockers.push(`Royalties must be between 0 and ${MAX_BPS} bps.`);

    if (standard === "ERC1155") {
      const sup = Number(supply) || 0;
      if (sup < 1) blockers.push("Supply must be at least 1.");
    }

    if (listOnMarket && (!price.trim() || Number(price) <= 0)) blockers.push("Listing price is not valid.");
    return blockers;
  }, [
    UPLOAD_API_BASE,
    SCAN_API_BASE,
    isConnected,
    isSupportedChain,
    publicClient,
    factoryAddress,
    effectiveCollectionAddress,
    file,
    nameTrim,
    descTrim,
    royaltyBps,
    standard,
    supply,
    listOnMarket,
    price,
  ]);

  const canSubmit = submitBlockers.length === 0 && !isCreating;

  function getAttributesForMetadata() {
    return traits
      .filter((t) => (t?.trait_type || "").trim() && (t?.value || "").trim())
      .map((t) => ({ trait_type: t.trait_type.trim(), value: t.value.trim() }));
  }

  function buildUploadHeaders(extra = {}) {
    const h = { ...extra };
    // important: only send header if key exists (reduce preflight pain)
    if (hasUploadKey) h["x-api-key"] = UPLOAD_KEY;
    return h;
  }

  async function uploadToIpfs() {
    if (!UPLOAD_API_BASE) {
      throw new Error("Upload base is not configured.\nSet VITE_IPFS_API (recommended) or serve /ipfs under VITE_SCAN_API_BASE.");
    }
    if (!file) throw new Error("No file selected.");

    try {
      uploadAbortRef.current?.abort?.();
    } catch {}
    const ac = new AbortController();
    uploadAbortRef.current = ac;

    setChainPhase("upload");
    setStatus("Uploading artwork to IPFS...");

    const imageUrl = joinUrl(UPLOAD_API_BASE, "/ipfs/image");
    const metaUrl = joinUrl(UPLOAD_API_BASE, "/ipfs/metadata");

    // DEV-only debug (safer for OSS)
    if (import.meta?.env?.DEV) setUploadDebug({ imageUrl, metaUrl });

    const fd = new FormData();
    fd.append("file", file);

    const r1 = await fetchWithTimeout(
      imageUrl,
      { method: "POST", headers: buildUploadHeaders(), body: fd, signal: ac.signal },
      45_000
    );

    const img = await safeJson(r1);
    if (!img.ok) throw new Error(explainUploadFail(img.status, img.raw, img.json, imageUrl, hasUploadKey));

    const imageIpfs = img.json?.ipfsUri;
    const imageGateway = img.json?.gatewayUrl;

    if (!imageIpfs) throw new Error(`Invalid IPFS response: missing ipfsUri.\nURL: ${imageUrl}`);
    if (String(imageIpfs).length > MAX_URI_LEN_SOFT) throw new Error("Image URI looks too long.");

    setStatus("Uploading metadata to IPFS...");

    const attributes = getAttributesForMetadata();
    const metadata = {
      name: nameTrim,
      description: descTrim,
      image: imageIpfs,
      ...(externalTrim ? { external_url: externalTrim } : {}),
      ...(attributes.length ? { attributes } : {}),
      ...(effectiveCollectionAddress ? { collection: effectiveCollectionAddress } : {}),
      ...(royaltyBps !== "" ? { seller_fee_basis_points: clampInt(royaltyBps, 0, MAX_BPS) } : {}),
    };

    const r2 = await fetchWithTimeout(
      metaUrl,
      {
        method: "POST",
        headers: buildUploadHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(metadata),
        signal: ac.signal,
      },
      45_000
    );

    const meta = await safeJson(r2);
    if (!meta.ok) throw new Error(explainUploadFail(meta.status, meta.raw, meta.json, metaUrl, hasUploadKey));

    const tokenUri = meta.json?.tokenUri;
    const metaGateway = meta.json?.gatewayUrl;

    if (!tokenUri) throw new Error(`Invalid IPFS response: missing tokenUri.\nURL: ${metaUrl}`);
    if (String(tokenUri).length > MAX_URI_LEN_SOFT) throw new Error("TokenURI looks too long.");

    return { imageIpfs, tokenUri, imageGateway, metaGateway };
  }

  async function mintOnCollection({ collection, tokenUri, imageUri }) {
    if (!publicClient) throw new Error("Public client not ready.");
    if (!connectedAddress) throw new Error("Wallet not connected.");
    if (!collection || !isAddress(collection)) throw new Error("Invalid collection address.");

    const to = connectedAddress;
    const amount = BigInt(Math.max(1, Number(supply) || 1));
    const tokenName = nameTrim.slice(0, MAX_NAME_LEN);
    const userInfoSafe = String(userInfo || "").slice(0, MAX_USERINFO_LEN);

    const candidates =
      standard === "ERC721"
        ? [
            { abi: Mint721Abi, fn: "mint", args: [to, tokenName, imageUri, tokenUri, userInfoSafe] },
            { abi: Mint721Abi, fn: "safeMint", args: [to, tokenUri] },
            { abi: Mint721Abi, fn: "mint", args: [to, tokenUri] },
            { abi: Mint721Abi, fn: "mintTo", args: [to, tokenUri] },
          ]
        : [
            { abi: Mint1155Abi, fn: "mint1155", args: [to, amount, tokenUri] },
            { abi: Mint1155Abi, fn: "mint", args: [to, amount, tokenUri] },
          ];

    let lastErr = null;

    for (const c of candidates) {
      try {
        setChainPhase("minting");
        setStatus("Preparing your mint transaction...");

        await publicClient.simulateContract({
          address: collection,
          abi: c.abi,
          functionName: c.fn,
          args: c.args,
          account: connectedAddress,
        });

        setChainPhase("wallet");
        setStatus("Please confirm the mint in your wallet...");

        const txHash = await writeContractAsync({
          address: collection,
          abi: c.abi,
          functionName: c.fn,
          args: c.args,
        });

        setChainPhase("confirming");
        setStatus("Waiting for blockchain confirmation...");

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        setChainPhase("finalizing");
        setStatus("Finalizing your NFT details...");

        let tokenId = null;

        for (const log of receipt.logs || []) {
          try {
            if ((log.address || "").toLowerCase() !== collection.toLowerCase()) continue;

            if (standard === "ERC721") {
              const decoded = decodeEventLog({ abi: Mint721Abi, data: log.data, topics: log.topics });
              if (decoded?.eventName === "Transfer") {
                const from = decoded.args?.from;
                const toAddr = decoded.args?.to;
                if (
                  String(from).toLowerCase() === String(zeroAddress).toLowerCase() &&
                  String(toAddr).toLowerCase() === to.toLowerCase()
                ) {
                  tokenId = decoded.args?.tokenId?.toString?.() || String(decoded.args?.tokenId);
                  break;
                }
              }
            } else {
              const decoded = decodeEventLog({ abi: Mint1155Abi, data: log.data, topics: log.topics });
              if (decoded?.eventName === "TransferSingle") {
                const from = decoded.args?.from;
                const toAddr = decoded.args?.to;
                if (
                  String(from).toLowerCase() === String(zeroAddress).toLowerCase() &&
                  String(toAddr).toLowerCase() === to.toLowerCase()
                ) {
                  tokenId = decoded.args?.id?.toString?.() || String(decoded.args?.id);
                  break;
                }
              }
            }
          } catch {}
        }

        return { txHash, tokenId, usedFn: `${c.fn} (${c.args.length} args)` };
      } catch (e) {
        lastErr = e;
      }
    }

    throw new Error(pickErr(lastErr) || "Mint failed: no supported mint function was found.");
  }

  async function handleCreate() {
    setErrorBox("");
    setStatus("");
    setResultUris(null);
    setMintResult(null);

    try {
      if (!canSubmit) {
        setErrorBox(`Please fix these first: ${submitBlockers.join(" | ")}`);
        return;
      }

      setIsCreating(true);
      setChainPhase("upload");
      setStatus("Starting...");

      const ipfs = await uploadToIpfs();
      setResultUris(ipfs);

      const minted = await mintOnCollection({
        collection: effectiveCollectionAddress,
        tokenUri: ipfs.tokenUri,
        imageUri: ipfs.imageIpfs,
      });

      setMintResult(minted);
      setStatus("All set! Your NFT is minted ✅");

      setLastSuccess({
        at: Date.now(),
        chainId,
        collection: effectiveCollectionAddress,
        tokenId: minted.tokenId ?? null,
        txHash: minted.txHash,
        tokenUri: ipfs.tokenUri,
        metaGateway: ipfs.metaGateway || "",
        imageIpfs: ipfs.imageIpfs,
        imageGateway: ipfs.imageGateway || "",
        usedFn: minted.usedFn,
      });

      resetAll({ resetCollection: false, clearSuccess: false });
    } catch (e) {
      setStatus("");
      setErrorBox(pickErr(e));
    } finally {
      setIsCreating(false);
      setChainPhase("idle");
      try {
        uploadAbortRef.current?.abort?.();
      } catch {}
    }
  }

  const modalOpen = chainPhase !== "idle";
  const modalText =
    chainPhase === "upload"
      ? "Uploading your artwork & metadata to IPFS..."
      : chainPhase === "wallet"
      ? "Open your wallet and confirm the transaction..."
      : chainPhase === "minting"
      ? "Preparing your mint transaction..."
      : chainPhase === "confirming"
      ? "Waiting for blockchain confirmation..."
      : chainPhase === "finalizing"
      ? "Finalizing your NFT details..."
      : "Please wait...";

  const modalShowVideo =
    chainPhase === "upload" || chainPhase === "confirming" || chainPhase === "finalizing";
  const modalPhase = chainPhase === "wallet" ? "wallet" : chainPhase === "finalizing" ? "indexing" : "pending";

  return (
    <div className="space-y-5">
      <BlockchainLoadingModal
        open={modalOpen}
        title="Processing"
        context="Create NFT"
        phase={modalPhase}
        text={modalText}
        showVideo={modalShowVideo}
      />

      {/* Setup hint (OSS-friendly) */}
      {(!SCAN_API_BASE || !UPLOAD_API_BASE) ? (
        <Card className="p-5 md:p-6 rounded-3xl border border-amber-200 bg-amber-50">
          <div className="text-xs font-extrabold text-amber-900">Setup required</div>
          <div className="mt-2 text-sm text-amber-900/90 leading-relaxed">
            This page needs API base URLs via environment variables:
            <div className="mt-2 rounded-2xl border border-amber-200 bg-white p-3 text-xs">
              <div className="font-mono">VITE_SCAN_API_BASE=INSERT_YOUR_SCAN_API_BASE_HERE</div>
              <div className="font-mono">VITE_IPFS_API=INSERT_YOUR_IPFS_API_BASE_HERE</div>
              <div className="font-mono">VITE_UPLOAD_API_KEY=INSERT_YOUR_UPLOAD_API_KEY_HERE</div>
            </div>
            <div className="mt-2 text-xs text-amber-900/80">
              Tip: if your backend serves <span className="font-mono">/ipfs/*</span> on the same host as scan,
              you can set only <span className="font-mono">VITE_SCAN_API_BASE</span> and leave IPFS base empty.
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-5 md:p-7 relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.25em] text-sky-600 uppercase">
              RARE NFT Studio
            </div>
            <h1 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight">
              Create & Mint NFT
            </h1>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl">
              Upload artwork, generate metadata, then mint — step by step.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge>{network.name}</Badge>
              {!isSupportedChain && (
                <Badge className="border-red-200 bg-red-50 text-red-700">Unsupported chain</Badge>
              )}
              <span className="text-xs text-slate-500">
                Chain ID: <span className="font-semibold text-slate-900">{network.chainId}</span>
              </span>
              <span className="text-xs text-slate-500">
                Wallet:{" "}
                <span className="font-semibold text-slate-900">
                  {connectedAddress ? shortAddress(connectedAddress) : "Not connected"}
                </span>
              </span>
            </div>

            <div className="mt-3 text-[11px] text-slate-500 space-y-1">
              <div>
                IPFS base:{" "}
                <span className="font-mono text-slate-700">{UPLOAD_API_BASE || "(not set)"}</span>
                <span className="mx-2">·</span>
                Key:{" "}
                <span className="font-semibold text-slate-900">{hasUploadKey ? "ON" : "OFF"}</span>
              </div>
              <div>
                Scan base:{" "}
                <span className="font-mono text-slate-700">{SCAN_API_BASE || "(not set)"}</span>
              </div>

              {import.meta?.env?.DEV && (uploadDebug.imageUrl || uploadDebug.metaUrl) ? (
                <div className="text-slate-500">
                  <div>Image URL: <span className="font-mono">{uploadDebug.imageUrl}</span></div>
                  <div>Meta URL: <span className="font-mono">{uploadDebug.metaUrl}</span></div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {status ? (
              <div className="text-xs text-slate-600">
                Status: <span className="font-semibold text-slate-900">{status}</span>
              </div>
            ) : (
              <div className="text-xs text-slate-500">Ready to mint</div>
            )}
          </div>
        </div>
      </Card>

      {/* success box */}
      {lastSuccess?.txHash ? (
        <Card className="p-5 md:p-6 border border-emerald-200 bg-emerald-50/50">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.25em] uppercase text-emerald-700">
                Success
              </div>
              <div className="mt-1 text-lg font-extrabold text-slate-900">Your NFT is minted ✅</div>
              <div className="mt-2 text-sm text-slate-600">
                Want to mint another one? You can continue right away.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setLastSuccess(null)}>Close</Button>
              <Button onClick={() => resetAll({ resetCollection: true, clearSuccess: true })}>New mint</Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <FieldRow
              label="Transaction"
              value={lastSuccess.txHash}
              actions={
                <>
                  <Button
                    variant="outline"
                    className="h-8 px-3"
                    onClick={async () => {
                      const ok = await copyText(lastSuccess.txHash);
                      if (ok) flashCopied("success_tx");
                    }}
                  >
                    {copiedKey === "success_tx" ? "Copied" : "Copy"}
                  </Button>
                  {explorerTxUrl(lastSuccess.chainId, lastSuccess.txHash) ? (
                    <a
                      className="text-[12px] font-semibold text-emerald-700 underline"
                      href={explorerTxUrl(lastSuccess.chainId, lastSuccess.txHash)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View
                    </a>
                  ) : null}
                </>
              }
            />
            <FieldRow label="Token ID" value={String(lastSuccess.tokenId ?? "(not decoded)")} mono={false} />
            <FieldRow
              label="TokenURI"
              value={lastSuccess.tokenUri}
              actions={
                <>
                  <Button
                    variant="outline"
                    className="h-8 px-3"
                    onClick={async () => {
                      const ok = await copyText(lastSuccess.tokenUri);
                      if (ok) flashCopied("success_uri");
                    }}
                  >
                    {copiedKey === "success_uri" ? "Copied" : "Copy"}
                  </Button>
                  {lastSuccess.metaGateway ? (
                    <a
                      className="text-[12px] font-semibold text-emerald-700 underline"
                      href={lastSuccess.metaGateway}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  ) : null}
                </>
              }
            />
            <FieldRow label="Mint method" value={lastSuccess.usedFn || "-"} mono={false} />
          </div>
        </Card>
      ) : null}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left */}
        <Card className="lg:col-span-2 p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-extrabold text-slate-900">Artwork</div>
              <p className="mt-1 text-xs text-slate-500">Upload a clean image · Max {MAX_MB}MB</p>
            </div>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              {standard}
            </span>
          </div>

          <div className="mt-4">
            <label className="block">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isCreating}
                onChange={(e) => onPickFile(e.target.files?.[0])}
              />

              <div
                className={cn(
                  "rounded-3xl border border-dashed border-slate-200 bg-slate-50",
                  "p-4 cursor-pointer hover:bg-slate-100 transition",
                  isCreating && "opacity-60 pointer-events-none"
                )}
              >
                <div className="aspect-square rounded-2xl overflow-hidden bg-white border border-slate-200">
                  {preview ? (
                    <img src={preview} alt="Preview" className="h-full w-full object-cover select-none" draggable={false} />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-sm text-slate-500">
                      Click to upload your artwork
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{file?.name || "No file selected"}</div>
                    <div className="text-xs text-slate-500">{file ? `${Math.round(file.size / 1024)} KB` : "PNG / JPG recommended"}</div>
                  </div>

                  <Button
                    variant="outline"
                    className="h-9 px-3"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                      revokePreview();
                      setPreview("");
                    }}
                    disabled={!file || isCreating}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </label>
          </div>

          {(resultUris || mintResult?.txHash) ? (
            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold text-slate-900">Results</div>
                  <div className="text-xs text-slate-500">IPFS links & mint receipt</div>
                </div>

                <Button
                  variant="outline"
                  className="h-9 px-3"
                  onClick={() => {
                    setResultUris(null);
                    setMintResult(null);
                  }}
                  disabled={isCreating}
                >
                  Clear
                </Button>
              </div>

              <div className="mt-3 space-y-3">
                {resultUris ? (
                  <>
                    <FieldRow
                      label="Image IPFS"
                      value={resultUris.imageIpfs}
                      actions={
                        <>
                          <Button
                            variant="outline"
                            className="h-8 px-3"
                            onClick={async () => {
                              const ok = await copyText(resultUris.imageIpfs);
                              if (ok) flashCopied("img_ipfs");
                            }}
                          >
                            {copiedKey === "img_ipfs" ? "Copied" : "Copy"}
                          </Button>
                          {resultUris.imageGateway ? (
                            <a className="text-[12px] font-semibold text-sky-700 underline" href={resultUris.imageGateway} target="_blank" rel="noreferrer">
                              Open
                            </a>
                          ) : null}
                        </>
                      }
                    />
                    <FieldRow
                      label="TokenURI"
                      value={resultUris.tokenUri}
                      actions={
                        <>
                          <Button
                            variant="outline"
                            className="h-8 px-3"
                            onClick={async () => {
                              const ok = await copyText(resultUris.tokenUri);
                              if (ok) flashCopied("token_uri");
                            }}
                          >
                            {copiedKey === "token_uri" ? "Copied" : "Copy"}
                          </Button>
                          {resultUris.metaGateway ? (
                            <a className="text-[12px] font-semibold text-sky-700 underline" href={resultUris.metaGateway} target="_blank" rel="noreferrer">
                              Open
                            </a>
                          ) : null}
                        </>
                      }
                    />
                  </>
                ) : null}

                {mintResult?.txHash ? (
                  <>
                    <FieldRow
                      label="Transaction"
                      value={mintResult.txHash}
                      actions={
                        <>
                          <Button
                            variant="outline"
                            className="h-8 px-3"
                            onClick={async () => {
                              const ok = await copyText(mintResult.txHash);
                              if (ok) flashCopied("mint_tx");
                            }}
                          >
                            {copiedKey === "mint_tx" ? "Copied" : "Copy"}
                          </Button>
                          {explorerTxUrl(chainId, mintResult.txHash) ? (
                            <a className="text-[12px] font-semibold text-sky-700 underline" href={explorerTxUrl(chainId, mintResult.txHash)} target="_blank" rel="noreferrer">
                              View
                            </a>
                          ) : null}
                        </>
                      }
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <FieldRow label="Token ID" value={String(mintResult.tokenId ?? "(not decoded)")} mono={false} />
                      <FieldRow label="Mint method" value={mintResult.usedFn} mono={false} />
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>

        {/* Right */}
        <Card className="lg:col-span-3 p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-extrabold text-slate-900">Details</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="h-9 px-3"
                onClick={() => resetAll({ resetCollection: true, clearSuccess: false })}
                disabled={isCreating}
              >
                Reset
              </Button>
              <Button
                variant="outline"
                className="h-9 px-3"
                onClick={() => refetchCollections?.()}
                disabled={isCreating || !isConnected || !isSupportedChain || !factoryAddress || fetchingCollections}
              >
                {fetchingCollections ? "Refreshing..." : "Refresh collections"}
              </Button>
            </div>
          </div>

          {/* Collection */}
          <div className="mt-4">
            <div className="text-xs font-semibold text-slate-600">Collection</div>

            <div className="mt-2">
              {!isConnected || !isSupportedChain || !factoryAddress ? (
                <div className="text-xs text-slate-500 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  Connect your wallet and select a supported network to load your collections.
                </div>
              ) : loadingCollections ? (
                <div className="text-xs text-slate-500 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  Loading your collections...
                </div>
              ) : (collectionOptions?.length || 0) === 0 ? (
                <div className="text-xs text-slate-500 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  You don’t have a collection yet. Create one first, then come back here to mint.
                </div>
              ) : (
                <select
                  value={selectedCollection}
                  onChange={(e) => setSelectedCollection(e.target.value)}
                  disabled={isCreating}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-200 disabled:opacity-60"
                >
                  {collectionOptions.map((opt) => (
                    <option key={opt.address} value={opt.address}>
                      {opt.label} — {shortAddress(opt.address)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="mt-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">
                Selected
              </div>

              <div className="mt-1 text-sm font-semibold text-slate-900">
                {selectedCollectionMeta?.name
                  ? `${selectedCollectionMeta.name} (${selectedCollectionMeta.symbol || "COLL"})`
                  : selectedOption?.label || "—"}
              </div>

              <div className="mt-1 text-xs text-slate-500 break-all">
                {effectiveCollectionAddress && isAddress(effectiveCollectionAddress)
                  ? effectiveCollectionAddress
                  : "—"}
              </div>

              <div className="mt-2 flex items-center gap-2">
                {effectiveCollectionAddress && isAddress(effectiveCollectionAddress) ? (
                  <>
                    <Button
                      variant="outline"
                      className="h-8 px-3"
                      onClick={async () => {
                        const ok = await copyText(effectiveCollectionAddress);
                        if (ok) flashCopied("coll_addr");
                      }}
                    >
                      {copiedKey === "coll_addr" ? "Copied" : "Copy"}
                    </Button>
                    {explorerAddressUrl(chainId, effectiveCollectionAddress) ? (
                      <a
                        className="text-[12px] font-semibold text-sky-700 underline"
                        href={explorerAddressUrl(chainId, effectiveCollectionAddress)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Explorer
                      </a>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-slate-400">Select a collection</span>
                )}
              </div>
            </div>
          </div>

          {/* Settings + Metadata */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-semibold text-slate-600">Standard</div>
              <select
                value={standard}
                onChange={(e) => setStandard(e.target.value)}
                disabled={isCreating}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-200 disabled:opacity-60"
              >
                <option value="ERC721">ERC-721 (1 of 1)</option>
                <option value="ERC1155">ERC-1155 (editions)</option>
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                ERC-721 is a single unique NFT. ERC-1155 supports multiple copies.
              </div>
            </div>

            {standard === "ERC1155" ? (
              <div>
                <div className="text-xs font-semibold text-slate-600">Supply</div>
                <Input
                  value={String(supply)}
                  onChange={(e) => setSupply(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="e.g. 10"
                  disabled={isCreating}
                />
              </div>
            ) : (
              <div>
                <div className="text-xs font-semibold text-slate-600">Supply</div>
                <Input value="1" disabled />
              </div>
            )}

            <div className="md:col-span-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-600">NFT Name</div>
                <div
                  className={cn(
                    "text-[11px]",
                    nameTrim.length > MAX_NAME_LEN ? "text-rose-600" : "text-slate-500"
                  )}
                >
                  {nameTrim.length}/{MAX_NAME_LEN}
                </div>
              </div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. RARE Genesis #1"
                disabled={isCreating}
              />
            </div>

            <div className="md:col-span-2">
              <div className="text-xs font-semibold text-slate-600">Description</div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell collectors what makes this NFT special..."
                disabled={isCreating}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-200 disabled:opacity-60"
                rows={4}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Note: userInfo (for mint) will be trimmed to {MAX_USERINFO_LEN} chars automatically.
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600">External URL (optional)</div>
              <Input
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://your-site.com"
                disabled={isCreating}
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600">Royalties (bps)</div>
              <Input
                value={String(royaltyBps)}
                onChange={(e) => setRoyaltyBps(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="250 = 2.5%"
                disabled={isCreating}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                Tip: 250 = 2.5% · 500 = 5% · Max {MAX_BPS} bps
              </div>
            </div>
          </div>

          {/* Traits */}
          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-slate-900">Traits</div>
                <div className="text-xs text-slate-500">Optional attributes (background, rarity, edition, etc.)</div>
              </div>
              <Button variant="outline" onClick={() => addTrait()} disabled={isCreating}>
                Add trait
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              {traits.map((t, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-10 gap-2">
                  <div className="md:col-span-5">
                    <Input
                      value={t.trait_type}
                      onChange={(e) => updateTrait(idx, "trait_type", e.target.value)}
                      placeholder="Trait type (e.g. Background)"
                      disabled={isCreating}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <Input
                      value={t.value}
                      onChange={(e) => updateTrait(idx, "value", e.target.value)}
                      placeholder="Value (e.g. Ice Blue)"
                      disabled={isCreating}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => removeTrait(idx)}
                      disabled={traits.length <= 1 || isCreating}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Listing */}
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-slate-900">Listing</div>
                <div className="text-xs text-slate-500">Coming soon · Manual listing is available in the marketplace for now.</div>
              </div>

              <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setListOnMarket(false)}
                  disabled={isCreating}
                  className={cn(
                    "px-4 py-2 text-[11px] font-extrabold rounded-xl transition disabled:opacity-60",
                    !listOnMarket ? "bg-white shadow-sm text-slate-900" : "text-slate-500"
                  )}
                >
                  OFF
                </button>

                <button
                  type="button"
                  onClick={() => setListOnMarket(false)}
                  disabled={true}
                  className={cn(
                    "px-4 py-2 text-[11px] font-extrabold rounded-xl transition disabled:opacity-60",
                    "text-slate-400 cursor-not-allowed"
                  )}
                  title="Listing is under development"
                >
                  ON
                </button>
              </div>
            </div>

            <div className={cn("mt-3 grid grid-cols-1 md:grid-cols-2 gap-3", !listOnMarket && "opacity-60")}>
              <div>
                <div className="text-xs font-semibold text-slate-600">Price</div>
                <Input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 1" disabled={true} />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-600">Currency</div>
                <Input value={currencySymbol} disabled />
              </div>
            </div>

            <div className="mt-2 text-[11px] text-slate-500">
              Listing is not available yet. After minting, go to the marketplace and list your NFT manually.
            </div>
          </div>

          {submitBlockers.length ? (
            <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-extrabold text-amber-900">Almost there — please check:</div>
              <ul className="mt-2 list-disc pl-5 text-xs text-amber-900/90 space-y-1">
                {submitBlockers.map((b, i) => (<li key={i}>{b}</li>))}
              </ul>
            </div>
          ) : null}

          {errorBox ? (
            <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4">
              <div className="text-xs font-extrabold text-red-800">Something went wrong</div>
              <div className="mt-1 text-xs text-red-800 whitespace-pre-wrap">{errorBox}</div>
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button onClick={handleCreate} disabled={!canSubmit}>
              {isCreating ? "Processing..." : "Create & Mint"}
            </Button>

            <Button
              variant="outline"
              onClick={() => resetAll({ resetCollection: false, clearSuccess: false })}
              disabled={isCreating}
            >
              Clear form
            </Button>
          </div>

          <div className="mt-3 text-[11px] text-slate-500">
            Tip: Keep this tab open until the transaction is confirmed.
          </div>
        </Card>
      </div>
    </div>
  );
}
