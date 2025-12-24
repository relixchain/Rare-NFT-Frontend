// src/components/admin/AdminGate.jsx
import React, { useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAccount } from "wagmi";
import { isAdmin } from "../../lib/admin";

export function AdminGate({ children }) {
  const { address } = useAccount();
  const loc = useLocation();

  const allowed = useMemo(() => isAdmin(address), [address]);

  if (!allowed) {
    return <Navigate to="/404" replace state={{ from: loc.pathname }} />;
  }

  return <>{children}</>;
}
