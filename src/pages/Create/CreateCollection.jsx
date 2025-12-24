// src/pages/Create/CreateCollection.jsx
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
  useReadContract,
} from "wagmi";
import { decodeEventLog, isAddress, getAddress } from "viem";
import { bsc } from "viem/chains";
import { relixTestnet } from "../../lib/chains";
import { setPageMeta } from "../../lib/meta";

import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { cn } from "../../lib/cn";

import { BlockchainLoadingModal } from "../../components/ui/BlockchainLoadingModal";
import { FactoryAbi, getFactoryAddress } from "../../contracts";

const MAX_IMAGE_MB = 2;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024; // 2MB

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
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

async function safeJson(res) {
  const text = await res.text();
  if (!text) return { ok: res.ok, status: res.status, json: null, raw: "" };
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text), raw: text };
  } catch {
    return { ok: res.ok, status: res.status, json: null, raw: text };
  }
}

function pickErr(e) {
  return (
    e?.shortMessage ||
    e?.message ||
    (typeof e === "string" ? e : "") ||
    "Unknown error"
  );
}

function shortAddress(addr) {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function normalizeBaseUrl(s) {
  return String(s || "").trim().replace(/\/+$/, "");
}

function joinUrl(base, path) {
  const b = normalizeBaseUrl(base);
  const p = String(path || "").startsWith("/") ? String(path) : `/${path}`;
  return `${b}${p}`;
}

// fetch wrapper with timeout + abort chaining + better error
async function fetchWithTimeout(url, options = {}, timeoutMs = 45_000) {
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
      `- Ensure VITE_UPLOAD_API_KEY matches server UPLOAD_API_KEY\n\n` +
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
      `Not Found (404): upload route not reachable on public server.\n` +
      `Most common causes:\n` +
      `- Reverse proxy/Nginx/Apache only forwards /scan but NOT /ipfs\n` +
      `- OPTIONS preflight to /ipfs/* returns 404 (because you send x-api-key)\n\n` +
      `Ask server owner to forward /ipfs/* to Node app (port 5055) and allow OPTIONS.\n\n` +
      `${msg}\nURL: ${url}`
    );
  }
  if (status === 413) return `File too large (413).\n${msg}\nURL: ${url}`;
  if (status === 429) return `Rate limited (429).\n${msg}\nURL: ${url}`;
  return `Upload failed (${status}).\n${msg}\nURL: ${url}`;
}

function storageKeyForCollectionMeta(chainId, collection) {
  return `collectionMeta.${chainId}.${String(collection || "").toLowerCase()}`;
}

function FieldRow({ label, value, mono = true, actions }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">
            {label}
          </div>
          <div
            className={cn(
              "mt-1 text-sm text-slate-900 break-all",
              mono && "font-mono text-[12px]"
            )}
          >
            {value || "—"}
          </div>
        </div>
        {actions ? (
          <div className="shrink-0 flex items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

export function CreateCollectionPage() {
  const { pathname } = useLocation();

  // ===== IPFS API (backend) =====
  const IPFS_API = normalizeBaseUrl(import.meta.env.VITE_IPFS_API || "YOUR_API_URL");
  const UPLOAD_KEY = String(import.meta.env.VITE_UPLOAD_API_KEY || "").trim();
  const hasUploadKey = Boolean(UPLOAD_KEY);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  // ✅ IMPORTANT: client should follow the current chain
  const publicClient = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();

  const isSupportedChain = chainId === bsc.id || chainId === relixTestnet.id;

  const network = useMemo(() => {
    if (chainId === bsc.id) return { name: "BNB Chain", subtitle: "Mainnet", symbol: "BNB" };
    if (chainId === relixTestnet.id)
      return { name: "Relix Chain", subtitle: "Testnet", symbol: relixTestnet.nativeCurrency.symbol };
    return { name: "Unsupported", subtitle: "", symbol: "-" };
  }, [chainId]);

  useEffect(() => {
    if (!pathname || !pathname.startsWith("/create")) return;

    setPageMeta({
      title: "Create Collection",
      description:
        "Deploy a new NFT collection on Rare NFT. Set name, symbol, royalties, and base URI.",
    });
    document.title = "Create Collection — Rare NFT";

    const t = setTimeout(() => {
      if (pathname.startsWith("/create")) {
        setPageMeta({
          title: "Create Collection",
          description:
            "Deploy a new NFT collection on Rare NFT. Set name, symbol, royalties, and base URI.",
        });
        document.title = "Create Collection — Rare NFT";
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

  // ===== Form =====
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [royaltyBps, setRoyaltyBps] = useState("500");

  // Base URI auto-filled after image upload (still optional)
  const [baseURI, setBaseURI] = useState("");

  // ===== Collection Image (UI-only) =====
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUris, setImageUris] = useState(null); // { ipfsUri, gatewayUrl }

  // ===== UI State =====
  const [status, setStatus] = useState("");
  const [errorBox, setErrorBox] = useState("");
  const [deploying, setDeploying] = useState(false);

  // phase: "idle" | "upload" | "wallet" | "pending" | "indexing"
  const [chainPhase, setChainPhase] = useState("idle");

  // result receipt
  const [created, setCreated] = useState(null); // { collection, txHash }

  // copy feedback
  const [copiedKey, setCopiedKey] = useState("");
  const copiedTimerRef = useRef(null);
  const flashCopied = useCallback((key) => {
    setCopiedKey(key);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedKey(""), 1200);
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  // abort controller for upload
  const uploadAbortRef = useRef(null);

  const {
    data: onchainCollections,
    refetch: refetchCollections,
    isLoading: loadingCollections,
    isFetching: fetchingCollections,
  } = useReadContract({
    abi: FactoryAbi,
    address: factoryAddress || undefined,
    functionName: "getCollections",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!factoryAddress && isSupportedChain,
      refetchInterval: 8000,
    },
  });

  const preview = useMemo(() => {
    const cleanName = name.trim() || "My Collection";
    const cleanSymbol = symbol.trim() || "NFT";
    const cleanDesc =
      description.trim() ||
      "A collection deployed on the selected network. You can mint NFTs into this collection.";
    const bps = clampInt(royaltyBps || 0, 0, 1000);

    return {
      name: cleanName,
      symbol: cleanSymbol,
      description: cleanDesc,
      royaltyBps: bps,
      baseURI: baseURI.trim() || "(not set)",
      imageIpfs: imageUris?.ipfsUri || "(not set)",
    };
  }, [name, symbol, description, royaltyBps, baseURI, imageUris]);

  // ✅ FIX: upload key is NOT required to deploy (image is optional)
  const submitBlockers = useMemo(() => {
    const blockers = [];
    if (!isConnected) blockers.push("Wallet is not connected.");
    if (!isSupportedChain) blockers.push("Unsupported network. Switch to BNB Chain or Relix Testnet.");
    if (!factoryAddress) blockers.push("Factory address is missing for this chain.");
    if (!publicClient) blockers.push("Public client is not ready (check wagmi config).");
    if (preview.name.trim().length < 2) blockers.push("Name must be at least 2 characters.");
    if (preview.symbol.trim().length < 2) blockers.push("Symbol must be at least 2 characters.");
    return blockers;
  }, [isConnected, isSupportedChain, factoryAddress, publicClient, preview.name, preview.symbol]);

  const canDeploy = submitBlockers.length === 0 && !deploying && !imageUploading;

  // cleanup preview URL
  useEffect(() => {
    return () => {
      try {
        if (imagePreview) URL.revokeObjectURL(imagePreview);
      } catch {}
    };
  }, [imagePreview]);

  // reset on chain change (keep success panel? up to you; sekarang ikut reset error/status saja)
  useEffect(() => {
    setStatus("");
    setErrorBox("");
    setChainPhase("idle");

    try {
      uploadAbortRef.current?.abort?.();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId]);

  const resetForm = useCallback(() => {
    setName("");
    setSymbol("");
    setDescription("");
    setRoyaltyBps("500");
    setBaseURI("");
    setStatus("");
    setErrorBox("");
    setImageFile(null);
    setImageUris(null);

    setCopiedKey("");
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);

    try {
      uploadAbortRef.current?.abort?.();
    } catch {}

    try {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    } catch {}
    setImagePreview("");
  }, [imagePreview]);

  function onPickImageFile(file) {
    setErrorBox("");
    setStatus("");

    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      setErrorBox("Only image files are allowed.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrorBox(`Max image size is ${MAX_IMAGE_MB}MB.`);
      return;
    }

    setImageFile(file);
    setImageUris(null);
    setBaseURI("");

    try {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    } catch {}
    setImagePreview(URL.createObjectURL(file));
  }

  function buildUploadHeaders(extra = {}) {
    const h = { ...extra };
    if (hasUploadKey) h["x-api-key"] = UPLOAD_KEY;
    return h;
  }

  async function handleUploadCollectionImage() {
    setErrorBox("");
    setStatus("");

    try {
      if (!imageFile) {
        setErrorBox("Please select an image first.");
        return;
      }
      if (!hasUploadKey) {
        setErrorBox("Upload key is not set. Please set VITE_UPLOAD_API_KEY to enable image upload.");
        return;
      }

      // abort previous upload
      try {
        uploadAbortRef.current?.abort?.();
      } catch {}
      const ac = new AbortController();
      uploadAbortRef.current = ac;

      setChainPhase("upload");
      setImageUploading(true);
      setStatus("Uploading collection image to IPFS...");

      const imageUrl = joinUrl(IPFS_API, "/ipfs/image");

      const fd = new FormData();
      fd.append("file", imageFile);

      const r = await fetchWithTimeout(
        imageUrl,
        {
          method: "POST",
          headers: buildUploadHeaders(),
          body: fd,
          signal: ac.signal,
        },
        45_000
      );

      const out = await safeJson(r);
      if (!out.ok) {
        throw new Error(explainUploadFail(out.status, out.raw, out.json, imageUrl, hasUploadKey));
      }

      const ipfsUri = out.json?.ipfsUri;
      const gatewayUrl = out.json?.gatewayUrl;

      if (!ipfsUri) throw new Error(`Invalid IPFS response: missing ipfsUri.\nURL: ${imageUrl}`);

      setImageUris({ ipfsUri, gatewayUrl: gatewayUrl || "" });
      setBaseURI(ipfsUri);
      setStatus("Image uploaded. Base URI updated.");
    } catch (e) {
      setStatus("");
      setErrorBox(pickErr(e));
    } finally {
      setImageUploading(false);
      setChainPhase("idle");
      try {
        uploadAbortRef.current?.abort?.();
      } catch {}
    }
  }

  async function handleDeploy() {
    setErrorBox("");
    setStatus("");
    setCreated(null);

    try {
      if (!canDeploy) {
        setErrorBox(`Cannot deploy. ${submitBlockers.join(" | ")}`);
        return;
      }

      const name_ = preview.name.trim();
      const symbol_ = preview.symbol.trim();
      const royaltyReceiver_ = address;
      const royaltyBps_ = clampInt(royaltyBps || 0, 0, 1000);
      const baseURI_ = baseURI.trim(); // can be empty

      setDeploying(true);

      setChainPhase("wallet");
      setStatus("Open your wallet to confirm...");

      const txHash = await writeContractAsync({
        abi: FactoryAbi,
        address: factoryAddress,
        functionName: "createCollection",
        args: [name_, symbol_, royaltyReceiver_, BigInt(royaltyBps_), baseURI_],
      });

      setChainPhase("pending");
      setStatus("Waiting for blockchain confirmation...");

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      setChainPhase("indexing");
      setStatus("Finalizing and indexing...");

      let collection = null;
      for (const log of receipt.logs || []) {
        try {
          const decoded = decodeEventLog({
            abi: FactoryAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded?.eventName === "CollectionCreated") {
            collection = decoded.args?.collection;
            break;
          }
        } catch {}
      }

      let collectionChecksum = null;
      try {
        if (collection && isAddress(collection)) collectionChecksum = getAddress(collection);
      } catch {}

      setCreated({ collection: collectionChecksum || collection || null, txHash });
      setStatus(
        collection
          ? "Collection deployed successfully."
          : "Deployed, but collection address was not decoded."
      );

      await refetchCollections?.();

      // store UI meta for CreateNft dropdown
      if (collectionChecksum) {
        try {
          const key = storageKeyForCollectionMeta(chainId, collectionChecksum);
          localStorage.setItem(
            key,
            JSON.stringify({
              name: name_,
              symbol: symbol_,
              description: description.trim(),
              imageIpfs: imageUris?.ipfsUri || "",
              imageGateway: imageUris?.gatewayUrl || "",
            })
          );
        } catch {}
      }

      // optional list
      if (collectionChecksum && address) {
        try {
          const key = `collections.${chainId}.${String(address).toLowerCase()}`;
          const prev = JSON.parse(localStorage.getItem(key) || "[]");
          const next = Array.from(new Set([collectionChecksum, ...prev]));
          localStorage.setItem(key, JSON.stringify(next));
        } catch {}
      }

      resetForm();
    } catch (e) {
      setStatus("");
      setErrorBox(pickErr(e));
    } finally {
      setDeploying(false);
      setChainPhase("idle");
    }
  }

  const isBusy = deploying || imageUploading;
  const hasUploadedImage = !!imageUris?.ipfsUri;

  const modalOpen = chainPhase !== "idle";
  const modalTitle = "Processing";
  const modalContext = "Create Collection";

  const modalText =
    chainPhase === "upload"
      ? "Uploading image to IPFS..."
      : chainPhase === "wallet"
      ? "Open your wallet to confirm..."
      : chainPhase === "pending"
      ? "Waiting for blockchain confirmation..."
      : chainPhase === "indexing"
      ? "Finalizing and indexing..."
      : "Please wait...";

  const modalShowVideo =
    chainPhase === "upload" || chainPhase === "pending" || chainPhase === "indexing";

  const modalPhase =
    chainPhase === "wallet"
      ? "wallet"
      : chainPhase === "indexing"
      ? "indexing"
      : "pending";

  return (
    <>
      <BlockchainLoadingModal
        open={modalOpen}
        title={modalTitle}
        context={modalContext}
        phase={modalPhase}
        text={modalText}
        showVideo={modalShowVideo}
      />

      <div className="space-y-6">
        <Card className="p-5 md:p-7 relative overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

          <div className="text-[11px] font-semibold tracking-[0.25em] text-sky-600 uppercase">
            Create Collection
          </div>
          <h1 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight">
            Deploy a New NFT Collection
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-2xl">
            Recommended flow: deploy a collection first, then mint NFTs into it.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge>
              {network.name} {network.subtitle}
            </Badge>

            {!isSupportedChain ? (
              <Badge className="border-red-200 bg-red-50 text-red-700">
                Unsupported network
              </Badge>
            ) : null}

            <span className="text-xs text-slate-500">
              Next:{" "}
              <Link to="/create" className="font-semibold text-sky-700 hover:text-sky-800">
                Create NFT
              </Link>
            </span>

            <span className="text-xs text-slate-500">
              Wallet:{" "}
              <span className="font-semibold text-slate-900">
                {address ? shortAddress(address) : "Not connected"}
              </span>
            </span>
          </div>

          <div className="mt-3 text-[11px] text-slate-500 space-y-1">
            <div>
              IPFS base: <span className="font-mono text-slate-700">{IPFS_API}</span>
              <span className="mx-2">·</span>
              Key: <span className="font-semibold text-slate-900">{hasUploadKey ? "ON" : "OFF"}</span>
            </div>
          </div>
        </Card>

        {created?.txHash ? (
          <Card className="p-5 md:p-6 border border-emerald-200 bg-emerald-50/50">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold tracking-[0.25em] uppercase text-emerald-700">
                  Success
                </div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">
                  Collection deployment receipt
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  Use this collection address when minting NFTs.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setCreated(null)} disabled={isBusy}>
                  Dismiss
                </Button>
                <Button onClick={() => refetchCollections?.()} disabled={isBusy || fetchingCollections}>
                  {fetchingCollections ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldRow
                label="Transaction"
                value={created.txHash}
                actions={
                  <>
                    <Button
                      variant="outline"
                      className="h-8 px-3"
                      onClick={async () => {
                        const ok = await copyText(created.txHash);
                        if (ok) flashCopied("tx_copy");
                      }}
                    >
                      {copiedKey === "tx_copy" ? "Copied" : "Copy"}
                    </Button>
                    {explorerTxUrl(chainId, created.txHash) ? (
                      <a
                        className="text-[12px] font-semibold text-emerald-700 underline"
                        href={explorerTxUrl(chainId, created.txHash)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </a>
                    ) : null}
                  </>
                }
              />

              <FieldRow
                label="Collection"
                value={created.collection || "(not decoded)"}
                actions={
                  created.collection ? (
                    <>
                      <Button
                        variant="outline"
                        className="h-8 px-3"
                        onClick={async () => {
                          const ok = await copyText(created.collection);
                          if (ok) flashCopied("addr_copy");
                        }}
                      >
                        {copiedKey === "addr_copy" ? "Copied" : "Copy"}
                      </Button>
                      {explorerAddressUrl(chainId, created.collection) ? (
                        <a
                          className="text-[12px] font-semibold text-emerald-700 underline"
                          href={explorerAddressUrl(chainId, created.collection)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Explorer
                        </a>
                      ) : null}
                    </>
                  ) : null
                }
              />
            </div>
          </Card>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5 md:p-6">
            <div className="text-sm font-extrabold text-slate-900">Collection Details</div>

            <div className="mt-4 grid gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1">Name</div>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Relix Genesis"
                  disabled={isBusy}
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1">Symbol</div>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="e.g. RGN"
                  disabled={isBusy}
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1">Description (UI only)</div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A short description about this collection..."
                  disabled={isBusy}
                  className="w-full min-h-[110px] rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:ring-2 focus:ring-sky-400/60 disabled:opacity-60"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1">
                  Collection Image (optional, max {MAX_IMAGE_MB}MB)
                </div>

                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isBusy}
                    onChange={(e) => onPickImageFile(e.target.files?.[0])}
                  />

                  <div
                    className={cn(
                      "rounded-3xl border border-dashed border-slate-200 bg-slate-50",
                      "p-4 cursor-pointer hover:bg-slate-100 transition",
                      isBusy && "opacity-60 pointer-events-none"
                    )}
                  >
                    <div className="aspect-[16/9] rounded-2xl overflow-hidden bg-white border border-slate-200">
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="Collection Preview"
                          className="h-full w-full object-cover select-none"
                          draggable={false}
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-sm text-slate-500">
                          Click to upload collection image
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {imageFile?.name || "No image selected"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {imageFile ? `${Math.round(imageFile.size / 1024)} KB` : "PNG / JPG recommended"}
                        </div>
                      </div>

                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                        {MAX_IMAGE_MB}MB max
                      </span>
                    </div>
                  </div>
                </label>

                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={handleUploadCollectionImage}
                    disabled={!imageFile || imageUploading || deploying || hasUploadedImage}
                    title={!hasUploadKey ? "Set VITE_UPLOAD_API_KEY to enable upload" : ""}
                  >
                    {hasUploadedImage ? "Uploaded" : imageUploading ? "Uploading..." : "Upload Image to IPFS"}
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setImageFile(null);
                      setImageUris(null);
                      setBaseURI("");
                      try {
                        if (imagePreview) URL.revokeObjectURL(imagePreview);
                      } catch {}
                      setImagePreview("");
                    }}
                    disabled={isBusy || (!imageFile && !imagePreview && !imageUris)}
                  >
                    Clear Image
                  </Button>
                </div>

                {!hasUploadKey ? (
                  <div className="mt-2 text-[11px] text-amber-700">
                    Upload key is OFF. You can still deploy, but image upload needs VITE_UPLOAD_API_KEY.
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-1">Royalty (BPS)</div>
                  <Input
                    value={royaltyBps}
                    onChange={(e) => setRoyaltyBps(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="500 = 5%"
                    disabled={isBusy}
                  />
                  <div className="mt-1 text-[11px] text-slate-500">Recommended: 0–1000 (0–10%).</div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-1">Base URI</div>
                  <Input value={baseURI} placeholder="Auto-filled after image upload" readOnly disabled />
                  <div className="mt-1 text-[11px] text-slate-500">
                    Optional. Auto-filled after uploading the collection image.
                  </div>
                </div>
              </div>
            </div>

            {submitBlockers.length ? (
              <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-xs font-extrabold text-amber-900">Fix before deploy</div>
                <ul className="mt-2 list-disc pl-5 text-xs text-amber-900/90 space-y-1">
                  {submitBlockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {errorBox ? (
              <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4">
                <div className="text-xs font-extrabold text-red-800">Error</div>
                <div className="mt-1 text-xs text-red-800 whitespace-pre-wrap">{errorBox}</div>
              </div>
            ) : null}

            {status ? (
              <div className="mt-4 text-xs text-slate-600">
                Status: <span className="font-semibold text-slate-900">{status}</span>
              </div>
            ) : null}

            <div className="mt-5 flex flex-col sm:flex-row gap-2">
              <Button className="w-full sm:w-auto" onClick={handleDeploy} disabled={!canDeploy}>
                {deploying ? "Deploying..." : "Deploy Collection"}
              </Button>

              <Button variant="outline" className="w-full sm:w-auto" onClick={resetForm} disabled={isBusy}>
                Reset
              </Button>
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-xs font-semibold text-slate-700">Your Collections (on-chain)</div>
                <Button
                  variant="outline"
                  className="h-9 px-3"
                  onClick={() => refetchCollections?.()}
                  disabled={isBusy || !isConnected || !isSupportedChain || !factoryAddress || fetchingCollections}
                >
                  {fetchingCollections ? "Refreshing..." : "Refresh"}
                </Button>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-3">
                {!isConnected ? (
                  <div className="text-xs text-slate-500">Connect your wallet to load collections.</div>
                ) : !isSupportedChain ? (
                  <div className="text-xs text-slate-500">Switch to a supported network.</div>
                ) : loadingCollections ? (
                  <div className="text-xs text-slate-500">Loading...</div>
                ) : (onchainCollections?.length || 0) === 0 ? (
                  <div className="text-xs text-slate-500">No collections found yet.</div>
                ) : (
                  <div className="space-y-2">
                    {onchainCollections.map((c) => (
                      <div key={c} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 break-all">{c}</div>
                          {explorerAddressUrl(chainId, c) ? (
                            <a
                              className="text-[11px] font-semibold text-sky-700 underline"
                              href={explorerAddressUrl(chainId, c)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Explorer
                            </a>
                          ) : null}
                        </div>

                        <Button
                          variant="outline"
                          className="h-8 px-3"
                          onClick={async () => {
                            const ok = await copyText(c);
                            if (ok) flashCopied(`list_${c}`);
                          }}
                          disabled={isBusy}
                        >
                          {copiedKey === `list_${c}` ? "Copied" : "Copy"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-5 md:p-6">
            <div className="text-sm font-extrabold text-slate-900">Preview</div>

            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold tracking-[0.22em] uppercase text-slate-500">
                {preview.symbol}
              </div>

              <div className="mt-2 text-xl font-extrabold text-slate-900">{preview.name}</div>
              <p className="mt-2 text-sm text-slate-600">{preview.description}</p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">
                    Royalty
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-slate-900">
                    {(preview.royaltyBps / 100).toFixed(2)}%
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">
                    Network
                  </div>
                  <div className="mt-1 text-sm font-extrabold text-slate-900">
                    {network.name} {network.subtitle}
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <FieldRow label="Base URI" value={preview.baseURI} mono={false} />
              </div>

              <div className="mt-3">
                <FieldRow label="Collection Image (IPFS)" value={preview.imageIpfs} />
              </div>
            </div>

            <div className="mt-4 text-xs text-slate-500">
              The collection image and description are displayed in the interface only. On-chain deployment
              includes the collection name, symbol, royalty recipient, royalty rate (bps), and base URI.
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export { CreateCollectionPage as CreateCollection };
