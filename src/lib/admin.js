// src/lib/admin.js
export const ADMIN_WALLET = "Your_Wallet_Address";

export function isAdmin(addr) {
  return String(addr || "").toLowerCase() === String(ADMIN_WALLET).toLowerCase();
}
