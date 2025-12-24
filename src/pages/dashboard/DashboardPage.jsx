// src/pages/dashboard/DashboardPage.jsx
/* cspell:ignore wagmi ipfsUri gatewayUrl nonce JWT CID webp */
import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";

import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { cn } from "../../lib/cn";

/* ---------------------------------------------
  CONFIG (Open-source safe)
  - Uses .env.example key: VITE_BANNER_API
  - Optional runtime override via window.__BANNER_API__
---------------------------------------------- */
const RAW_API_BASE =
  (typeof window !== "undefined" && window.__BANNER_API__) ||
  import.meta?.env?.VITE_BANNER_API ||
  "";

// normalize (trim + remove trailing slash)
const API_BASE = String(RAW_API_BASE || "")
  .trim()
  .replace(/\/+$/, "");

// LocalStorage key (legacy compatible)
const LS_KEY = "admin.banner.latest";
const SLOT_COUNT = 4;

/* ---------------------------------------------
  SMALL HELPERS
---------------------------------------------- */
function shortAddress(addr) {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

async function safeJson(res) {
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text), raw: text };
  } catch {
    return { ok: res.ok, status: res.status, json: null, raw: text };
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || "").trim());
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "-";
  }
}

function kb(n) {
  const v = Number(n || 0);
  if (!v) return "0 KB";
  return `${Math.max(1, Math.round(v / 1024))} KB`;
}

function clampSlot(n) {
  const v = Number(n || 1);
  if (v < 1) return 1;
  if (v > SLOT_COUNT) return SLOT_COUNT;
  return v;
}

function emptySlot(slot) {
  return {
    slot,
    title: "",
    link: "",
    uploaded: null, // { cid, ipfsUri, gatewayUrl, filename, size, type, title, link, uploadedAt }
    updatedAt: 0,
  };
}

function normalizeSlots(arr) {
  const slots = Array.from({ length: SLOT_COUNT }).map((_, i) => emptySlot(i + 1));
  const inArr = Array.isArray(arr) ? arr : [];
  for (const it of inArr) {
    const s = clampSlot(it?.slot);
    slots[s - 1] = {
      ...slots[s - 1],
      slot: s,
      title: String(it?.title || ""),
      link: String(it?.link || ""),
      uploaded: it?.uploaded || null,
      updatedAt: Number(it?.updatedAt || 0) || 0,
    };
  }
  return slots;
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      return {
        selectedSlot: 1,
        slots: Array.from({ length: SLOT_COUNT }).map((_, i) => emptySlot(i + 1)),
      };
    }

    const obj = JSON.parse(raw);

    // v2 format: { selectedSlot, slots: [...] }
    if (obj && typeof obj === "object" && Array.isArray(obj.slots)) {
      return {
        selectedSlot: clampSlot(obj.selectedSlot || 1),
        slots: normalizeSlots(obj.slots),
      };
    }

    // legacy format: { title, link, uploaded, updatedAt }
    if (obj && typeof obj === "object" && !Array.isArray(obj.slots)) {
      const slots = Array.from({ length: SLOT_COUNT }).map((_, i) => emptySlot(i + 1));
      slots[0] = {
        slot: 1,
        title: String(obj.title || ""),
        link: String(obj.link || ""),
        uploaded: obj.uploaded || null,
        updatedAt: Number(obj.updatedAt || 0) || 0,
      };
      return { selectedSlot: 1, slots };
    }
  } catch {
    /* noop */
  }

  return {
    selectedSlot: 1,
    slots: Array.from({ length: SLOT_COUNT }).map((_, i) => emptySlot(i + 1)),
  };
}

function saveLocalState(state) {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        selectedSlot: clampSlot(state.selectedSlot),
        slots: normalizeSlots(state.slots),
        v: 2,
        savedAt: Date.now(),
      })
    );
  } catch {
    /* noop */
  }
}

function apiUrl(path) {
  const p = String(path || "").startsWith("/") ? String(path || "") : `/${path}`;
  return `${API_BASE}${p}`;
}

async function trySaveBannerConfig({ token, slot, title, link, ipfsUri, gatewayUrl }) {
  const body = {
    title: title || "",
    link: link || "",
    image: ipfsUri || "",
    imageGateway: gatewayUrl || "",
    active: true,
  };

  // 1) Preferred endpoint: /admin/banner/slot/:slot
  try {
    const r = await fetch(apiUrl(`/admin/banner/slot/${slot}`), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (r.ok) return { ok: true, mode: "slot" };
  } catch {
    /* noop */
  }

  // 2) Legacy endpoint: /banner (slot 1 only)
  if (slot === 1) {
    try {
      const r = await fetch(apiUrl("/banner"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (r.ok) return { ok: true, mode: "legacy" };
    } catch {
      /* noop */
    }
  }

  return { ok: false };
}

async function fetchBannerJson() {
  if (!API_BASE) return null;
  try {
    const r = await fetch(apiUrl("/banner.json"), { method: "GET" });
    const j = await safeJson(r);
    if (!j.ok) return null;
    return j.json;
  } catch {
    return null;
  }
}

/* ---------------------------------------------
  PAGE
  - Open-source safe: no admin wallet list in client.
  - Access control must be enforced by the API.
---------------------------------------------- */
export function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const hasApi = Boolean(API_BASE);

  // If API not configured, show friendly setup instructions (safe for OSS)
  if (!hasApi) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-0 py-10">
        <Card className="p-6 md:p-7 rounded-3xl">
          <div className="text-[11px] font-semibold tracking-[0.25em] uppercase text-slate-500">
            Admin Console
          </div>
          <h1 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            This page requires a configured Banner API base URL. For open-source builds, set it via{" "}
            <span className="font-mono">VITE_BANNER_API</span>.
          </p>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">Setup</div>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-slate-700">
              <li>
                Copy <span className="font-mono">.env.example</span> →{" "}
                <span className="font-mono">.env.local</span>
              </li>
              <li>
                Fill: <span className="font-mono">VITE_BANNER_API</span>
              </li>
              <li>Restart dev server</li>
            </ul>
          </div>

          <div className="mt-4 text-xs text-slate-500">
            Current: <span className="font-mono">(not set)</span>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <DashboardPageInner
      address={address}
      isConnected={isConnected}
      signMessageAsync={signMessageAsync}
    />
  );
}

function DashboardPageInner({ address, isConnected, signMessageAsync }) {
  const [token, setToken] = useState(() => sessionStorage.getItem("admin_jwt") || "");
  const authed = Boolean(token);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  const initial = useMemo(() => loadLocalState(), []);
  const [selectedSlot, setSelectedSlot] = useState(() => clampSlot(initial.selectedSlot || 1));
  const [slots, setSlots] = useState(() => {
    return initial.slots || Array.from({ length: SLOT_COUNT }).map((_, i) => emptySlot(i + 1));
  });

  const activeSlot = useMemo(() => {
    return slots[clampSlot(selectedSlot) - 1] || emptySlot(selectedSlot);
  }, [slots, selectedSlot]);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");

  const [bannerTitle, setBannerTitle] = useState(() => activeSlot.title || "");
  const [bannerLink, setBannerLink] = useState(() => activeSlot.link || "");
  const [uploaded, setUploaded] = useState(() => activeSlot.uploaded || null);

  const copiedTimerRef = useRef(null);
  const [copiedKey, setCopiedKey] = useState("");
  const flashCopied = useCallback((key) => {
    setCopiedKey(key);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedKey(""), 1100);
  }, []);

  // Keep slot form in sync when slot changes
  useEffect(() => {
    const s = slots[clampSlot(selectedSlot) - 1] || emptySlot(selectedSlot);
    setBannerTitle(s.title || "");
    setBannerLink(s.link || "");
    setUploaded(s.uploaded || null);
    setErr("");
    setStatus("");
    setFile(null);

    try {
      if (preview) URL.revokeObjectURL(preview);
    } catch {
      /* noop */
    }
    setPreview("");

    saveLocalState({ selectedSlot, slots });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlot]); // intentionally only reacts to slot changes

  useEffect(() => {
    saveLocalState({ selectedSlot, slots });
  }, [selectedSlot, slots]);

  // Hydrate from server banner.json (best-effort)
  useEffect(() => {
    (async () => {
      const server = await fetchBannerJson();
      if (!server) return;

      // New format: { ok: true, slots: [...] }
      if (server?.ok && Array.isArray(server?.slots)) {
        setSlots((prev) => {
          const next = normalizeSlots(prev);

          for (const it of server.slots) {
            const s = clampSlot(it?.slot);
            const idx = s - 1;

            const serverUpdatedAt = Number(it?.updatedAt || it?.uploadedAt || 0) || 0;
            const localUpdatedAt = Number(next[idx]?.updatedAt || 0) || 0;

            const localEmpty = !(
              next[idx]?.uploaded?.gatewayUrl ||
              next[idx]?.uploaded?.ipfsUri ||
              next[idx]?.uploaded?.cid
            );

            if (serverUpdatedAt > localUpdatedAt || localEmpty) {
              const gateway = String(it?.imageGateway || it?.gatewayUrl || "");
              const ipfsUri = String(it?.image || it?.ipfsUri || "");

              next[idx] = {
                ...next[idx],
                slot: s,
                title: String(it?.title || ""),
                link: String(it?.link || ""),
                uploaded:
                  gateway || ipfsUri
                    ? {
                        cid: "",
                        ipfsUri,
                        gatewayUrl: gateway,
                        filename: "",
                        size: 0,
                        type: "",
                        title: String(it?.title || ""),
                        link: String(it?.link || ""),
                        uploadedAt: serverUpdatedAt || 0,
                      }
                    : next[idx].uploaded,
                updatedAt: serverUpdatedAt || localUpdatedAt,
              };
            }
          }

          return next;
        });
        return;
      }

      // Legacy format: { ok: true, title, link, image, imageGateway, updatedAt }
      if (server?.ok && !Array.isArray(server?.slots)) {
        setSlots((prev) => {
          const next = normalizeSlots(prev);

          const serverUpdatedAt = Number(server?.updatedAt || 0) || 0;
          const localUpdatedAt = Number(next[0]?.updatedAt || 0) || 0;

          const localEmpty = !(
            next[0]?.uploaded?.gatewayUrl ||
            next[0]?.uploaded?.ipfsUri ||
            next[0]?.uploaded?.cid
          );

          if (serverUpdatedAt > localUpdatedAt || localEmpty) {
            next[0] = {
              ...next[0],
              slot: 1,
              title: String(server?.title || ""),
              link: String(server?.link || ""),
              uploaded:
                server?.imageGateway || server?.image
                  ? {
                      cid: "",
                      ipfsUri: String(server?.image || ""),
                      gatewayUrl: String(server?.imageGateway || ""),
                      filename: "",
                      size: 0,
                      type: "",
                      title: String(server?.title || ""),
                      link: String(server?.link || ""),
                      uploadedAt: serverUpdatedAt || 0,
                    }
                  : next[0].uploaded,
              updatedAt: serverUpdatedAt || localUpdatedAt,
            };
          }

          return next;
        });
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (preview) URL.revokeObjectURL(preview);
      } catch {
        /* noop */
      }
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, [preview]);

  function updateSlotLocal(slot, patch) {
    setSlots((prev) => {
      const next = normalizeSlots(prev);
      const idx = clampSlot(slot) - 1;
      next[idx] = {
        ...next[idx],
        ...patch,
        slot: clampSlot(slot),
        updatedAt: Date.now(),
      };
      return next;
    });
  }

  function saveLocalCurrent() {
    updateSlotLocal(selectedSlot, {
      title: bannerTitle.trim(),
      link: bannerLink.trim(),
      uploaded: uploaded || null,
    });
    setStatus("Saved locally.");
    setErr("");
  }

  function clearPicked() {
    setFile(null);
    try {
      if (preview) URL.revokeObjectURL(preview);
    } catch {
      /* noop */
    }
    setPreview("");
  }

  function onPickFile(f) {
    setErr("");
    setStatus("");

    if (!f) return;
    if (!f.type?.startsWith("image/")) {
      setErr("Only image files are allowed.");
      return;
    }

    setFile(f);
    try {
      if (preview) URL.revokeObjectURL(preview);
    } catch {
      /* noop */
    }
    setPreview(URL.createObjectURL(f));
  }

  async function adminLogin() {
    setErr("");
    setStatus("");
    if (!isConnected || !address) return setErr("Connect wallet first.");

    try {
      setBusy(true);
      setStatus("Requesting nonce...");

      const r1 = await fetch(apiUrl(`/auth/admin/nonce?address=${address}`));
      const j1 = await safeJson(r1);
      if (!j1.ok) throw new Error(j1.json?.error || j1.raw || "Nonce request failed.");

      setStatus("Sign the message in your wallet...");
      const signature = await signMessageAsync({ message: j1.json.message });

      setStatus("Verifying...");
      const r2 = await fetch(apiUrl("/auth/admin/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, signature, nonce: j1.json.nonce }),
      });

      const j2 = await safeJson(r2);
      if (!j2.ok) throw new Error(j2.json?.error || j2.raw || "Verification failed.");

      sessionStorage.setItem("admin_jwt", j2.json.token);
      setToken(j2.json.token);
      setStatus("Logged in.");
    } catch (e) {
      setErr(String(e?.message || e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem("admin_jwt");
    setToken("");
    setStatus("Logged out.");
    setErr("");
  }

  async function uploadBanner() {
    setErr("");
    setStatus("");

    if (!file) return setErr("Select an image first.");
    if (!authed) return setErr("Log in first.");

    const link = bannerLink.trim();
    if (link && !isHttpUrl(link)) return setErr("Link must start with http:// or https://");

    try {
      setBusy(true);
      setStatus(`Uploading banner (slot ${selectedSlot}) to IPFS...`);

      const fd = new FormData();
      fd.append("file", file);

      const r = await fetch(apiUrl("/ipfs/image"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const j = await safeJson(r);
      if (!j.ok) throw new Error(j.json?.error || j.raw || "Upload failed.");

      const nextUploaded = {
        cid: j.json?.cid || "",
        ipfsUri: j.json?.ipfsUri || (j.json?.cid ? `ipfs://${j.json.cid}` : ""),
        gatewayUrl: j.json?.gatewayUrl || "",
        filename: file?.name || "",
        size: file?.size || 0,
        type: file?.type || "",
        title: bannerTitle.trim(),
        link,
        uploadedAt: Date.now(),
      };

      updateSlotLocal(selectedSlot, {
        title: bannerTitle.trim(),
        link,
        uploaded: nextUploaded,
      });

      setUploaded(nextUploaded);
      setStatus("Uploaded (saved locally).");
      clearPicked();

      setStatus("Uploaded. Syncing banner config...");
      const saved = await trySaveBannerConfig({
        token,
        slot: clampSlot(selectedSlot),
        title: bannerTitle.trim(),
        link,
        ipfsUri: nextUploaded.ipfsUri,
        gatewayUrl: nextUploaded.gatewayUrl,
      });

      if (saved.ok) {
        setStatus(
          saved.mode === "slot"
            ? `Synced to server (slot ${selectedSlot}).`
            : "Synced to server (legacy)."
        );
      } else {
        setStatus("Uploaded (saved locally). Server sync not supported or unavailable.");
      }
    } catch (e) {
      setErr(String(e?.message || e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function clearSlot() {
    setErr("");
    setStatus("");
    if (!authed) return setErr("Log in first.");

    const slot = clampSlot(selectedSlot);
    updateSlotLocal(slot, { ...emptySlot(slot) });
    setBannerTitle("");
    setBannerLink("");
    setUploaded(null);
    clearPicked();
    setStatus(`Slot ${slot} cleared locally.`);

    // best-effort: server clear (optional)
    try {
      const r = await fetch(apiUrl(`/admin/banner/slot/${slot}/clear`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setStatus(`Slot ${slot} cleared on server.`);
    } catch {
      /* noop */
    }
  }

  const canUpload = authed && Boolean(file) && !busy;

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-0 py-8">
      <Card className="p-6 md:p-7 rounded-3xl relative overflow-hidden mb-5">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.25em] uppercase text-sky-600">
              Admin Console
            </div>
            <h1 className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">
              Dashboard
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Banner manager — {SLOT_COUNT} slots (1500×500) + optional click link.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge>Wallet</Badge>
              <span className="text-xs text-slate-600">
                <span className="font-mono text-slate-900">
                  {address ? shortAddress(address) : "-"}
                </span>
              </span>

              {authed ? (
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  Session Active
                </Badge>
              ) : (
                <Badge className="border-amber-200 bg-amber-50 text-amber-800">
                  Login Required
                </Badge>
              )}

              {/* Open-source safe: show configured API base only (no hardcoded secrets). */}
              <span className="text-[11px] text-slate-500">
                API: <span className="font-mono text-slate-700">{API_BASE}</span>
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge className="border-slate-200 bg-white text-slate-700">Slot</Badge>
              {Array.from({ length: SLOT_COUNT }).map((_, i) => {
                const s = i + 1;
                const has = Boolean(
                  slots[i]?.uploaded?.gatewayUrl || slots[i]?.uploaded?.ipfsUri || slots[i]?.uploaded?.cid
                );
                const active = s === selectedSlot;
                return (
                  <Button
                    key={s}
                    variant={active ? "default" : "outline"}
                    className={cn("h-8 px-3", active ? "" : "bg-white")}
                    disabled={busy}
                    onClick={() => setSelectedSlot(s)}
                  >
                    #{s}
                    {has ? <span className="ml-2 text-[11px] opacity-80">●</span> : null}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!authed ? (
              <Button disabled={busy} onClick={adminLogin}>
                {busy ? "Working..." : "Login (Sign)"}
              </Button>
            ) : (
              <Button variant="outline" disabled={busy} onClick={logout}>
                Logout
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card className="p-4 rounded-3xl">
          <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">
            Session
          </div>
          <div className="mt-2 text-lg font-extrabold text-slate-900">
            {authed ? "Active" : "Inactive"}
          </div>
          <div className="mt-2 text-xs text-slate-500">Nonce → sign → verify → JWT</div>
        </Card>

        <Card className="p-4 rounded-3xl">
          <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">
            Selected Slot
          </div>
          <div className="mt-2 text-lg font-extrabold text-slate-900">#{selectedSlot}</div>
          <div className="mt-2 text-xs text-slate-500">
            Last update:{" "}
            <span className="font-semibold text-slate-700">
              {activeSlot?.updatedAt ? fmtTime(activeSlot.updatedAt) : "-"}
            </span>
          </div>
        </Card>

        <Card className="p-4 rounded-3xl">
          <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">
            Slots Filled
          </div>
          <div className="mt-2 text-lg font-extrabold text-slate-900">
            {slots.filter((s) => s?.uploaded?.gatewayUrl || s?.uploaded?.ipfsUri || s?.uploaded?.cid).length}/
            {SLOT_COUNT}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Local cache: <span className="font-mono">{LS_KEY}</span>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-3 p-4 rounded-3xl">
          <div className="text-[11px] font-semibold tracking-[0.25em] uppercase text-slate-500">
            Admin Menu
          </div>

          <div className="mt-3 grid gap-2">
            <div className="rounded-2xl border border-sky-200 bg-linear-to-r from-sky-50 via-white to-indigo-50 px-3 py-3">
              <div className="text-sm font-extrabold text-slate-900">Banner Manager</div>
              <div className="text-xs text-slate-600">Slots #1–#{SLOT_COUNT}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {slots.map((s) => {
              const has = Boolean(s?.uploaded?.gatewayUrl || s?.uploaded?.ipfsUri || s?.uploaded?.cid);
              const isSel = s.slot === selectedSlot;
              return (
                <button
                  key={s.slot}
                  className={cn(
                    "text-left rounded-2xl border px-3 py-3 transition",
                    isSel ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"
                  )}
                  disabled={busy}
                  onClick={() => setSelectedSlot(s.slot)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-extrabold text-slate-900">Slot #{s.slot}</div>
                    <span
                      className={cn(
                        "text-[11px] font-semibold px-2 py-0.5 rounded-full border",
                        has
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      )}
                    >
                      {has ? "Set" : "Empty"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600 truncate">
                    {s.title?.trim() ? s.title.trim() : "No title"}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">{s.updatedAt ? fmtTime(s.updatedAt) : "-"}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-700">Rules</div>
            <ul className="mt-2 text-xs text-slate-600 list-disc pl-5 space-y-1">
              <li>Banner size: 1500×500 (3:1)</li>
              <li>Link optional (banner clickable)</li>
              <li>Upload requires JWT session</li>
              <li>Slot selection controls save/preview</li>
            </ul>
          </div>
        </Card>

        <div className="lg:col-span-9 space-y-4">
          <Card className="p-5 md:p-6 rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-slate-900">Banner Preview</div>
                <div className="text-xs text-slate-500">
                  Slot <span className="font-semibold text-slate-700">#{selectedSlot}</span> — Aspect{" "}
                  <span className="font-semibold text-slate-700">1500×500 (3:1)</span>
                </div>
              </div>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                3:1
              </span>
            </div>

            <div className="mt-4">
              <label className="block">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                />

                <div
                  className={cn(
                    "rounded-3xl border border-dashed border-slate-200 bg-slate-50",
                    "p-4 cursor-pointer hover:bg-slate-100 transition"
                  )}
                >
                  <div className="aspect-3/1 rounded-2xl overflow-hidden bg-white border border-slate-200">
                    {preview ? (
                      <img
                        src={preview}
                        alt="Banner preview"
                        className="h-full w-full object-cover select-none"
                        draggable={false}
                      />
                    ) : uploaded?.gatewayUrl ? (
                      <img
                        src={uploaded.gatewayUrl}
                        alt="Last banner"
                        className="h-full w-full object-cover select-none"
                        draggable={false}
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-sm text-slate-500">
                        Click to choose image
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {file?.name || uploaded?.filename || "No file selected"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {file
                          ? `${kb(file.size)} • ${file.type || "image/*"}`
                          : uploaded?.size
                          ? `${kb(uploaded.size)} (last uploaded)`
                          : "PNG / JPG / WEBP recommended"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="h-9 px-3"
                        disabled={!file || busy}
                        onClick={(e) => {
                          e.preventDefault();
                          clearPicked();
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>
              </label>
            </div>
          </Card>

          <Card className="p-5 md:p-6 rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-slate-900">Banner Settings</div>
                <div className="text-xs text-slate-500">Slot #{selectedSlot} — set title + click link, then upload.</div>
              </div>

              {authed ? (
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Session Active</Badge>
              ) : (
                <Badge className="border-amber-200 bg-amber-50 text-amber-800">Login Required</Badge>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <div className="text-xs font-semibold text-slate-600">Title (optional)</div>
                <Input
                  value={bannerTitle}
                  onChange={(e) => setBannerTitle(e.target.value)}
                  placeholder="e.g. Multichain Marketplace"
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-xs font-semibold text-slate-600">Click Link (optional)</div>
                <Input value={bannerLink} onChange={(e) => setBannerLink(e.target.value)} placeholder="https://..." />
                <div className="mt-1 text-[11px] text-slate-500">
                  Must start with <span className="font-mono">http://</span> or{" "}
                  <span className="font-mono">https://</span>.
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs text-slate-500">
                Upload endpoint: <span className="font-mono text-slate-700">{apiUrl("/ipfs/image")}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!authed ? (
                  <Button disabled={busy} onClick={adminLogin}>
                    {busy ? "Working..." : "Login (Sign)"}
                  </Button>
                ) : (
                  <Button disabled={!canUpload} onClick={uploadBanner}>
                    {busy ? "Uploading..." : file ? `Upload Slot #${selectedSlot}` : "Select File"}
                  </Button>
                )}

                <Button variant="outline" disabled={busy} onClick={saveLocalCurrent}>
                  Save (local)
                </Button>

                <Button variant="outline" disabled={busy || !authed} onClick={clearSlot}>
                  Clear Slot
                </Button>
              </div>
            </div>

            {(uploaded?.gatewayUrl && (uploaded.link || bannerLink.trim())) ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-700">Click Preview</div>
                <a
                  href={uploaded.link || bannerLink.trim()}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 underline"
                >
                  Open link <span className="text-xs opacity-70">→</span>
                </a>
              </div>
            ) : null}
          </Card>

          {uploaded ? (
            <Card className="p-5 md:p-6 rounded-3xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold text-slate-900">
                    Slot #{selectedSlot} — Last Upload Details
                  </div>
                  <div className="text-xs text-slate-500">Copy CID / IPFS / Gateway quickly.</div>
                </div>
                {uploaded.gatewayUrl ? (
                  <a
                    href={uploaded.gatewayUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-sky-700 underline"
                  >
                    Open Gateway
                  </a>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">CID</div>
                  <div className="mt-1 text-sm font-mono text-slate-900 break-all">{uploaded.cid || "-"}</div>
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      className="h-8 px-3"
                      onClick={async () => {
                        const ok = await copyText(uploaded.cid || "");
                        if (ok) flashCopied("cid");
                      }}
                    >
                      {copiedKey === "cid" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">IPFS URI</div>
                  <div className="mt-1 text-sm font-mono text-slate-900 break-all">{uploaded.ipfsUri || "-"}</div>
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      className="h-8 px-3"
                      onClick={async () => {
                        const ok = await copyText(uploaded.ipfsUri || "");
                        if (ok) flashCopied("ipfs");
                      }}
                    >
                      {copiedKey === "ipfs" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>

                <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">Gateway URL</div>
                  <div className="mt-1 text-sm font-mono text-slate-900 break-all">{uploaded.gatewayUrl || "-"}</div>
                </div>

                <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[11px] font-semibold tracking-[0.22em] uppercase text-slate-500">Config</div>
                  <div className="mt-2 text-sm text-slate-900">
                    <div>
                      <span className="font-semibold">Title:</span> {uploaded.title || "-"}
                    </div>
                    <div className="mt-1">
                      <span className="font-semibold">Link:</span>{" "}
                      <span className="break-all">{uploaded.link || "-"}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      UploadedAt:{" "}
                      <span className="font-semibold text-slate-700">
                        {uploaded.uploadedAt ? fmtTime(uploaded.uploadedAt) : "-"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ) : null}

          {(status || err) ? (
            <div className="space-y-2">
              {status ? (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  Status: <span className="font-semibold text-slate-900">{status}</span>
                </div>
              ) : null}
              {err ? (
                <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap">
                  {err}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
