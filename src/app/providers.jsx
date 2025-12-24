import React from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { bscCustom, relixTestnet } from "../lib/chains";

const queryClient = new QueryClient();

const SCAN_API_BASE =
  (typeof window !== "undefined" && window.__RARE_SCAN_API_BASE__) ||
  import.meta.env.VITE_SCAN_API_BASE ||
  "INSERT_YOUR_SCAN_API_BASE_HERE";

/**
 * Open-source friendly providers:
 * - No hard dependency that crashes builds for OSS users.
 * - Uses an env/runtime value when available, otherwise falls back to a placeholder.
 *
 * If you want strict mode for production only:
 * - Replace the placeholder with "" and throw when missing.
 */
const wagmiConfig = createConfig({
  // Custom chains (multicall3 + RPC proxy support)
  chains: [bscCustom, relixTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    // BSC via backend proxy
    [bscCustom.id]: http(`${SCAN_API_BASE}/rpc/bsc`),

    // Relix direct RPC
    [relixTestnet.id]: http(relixTestnet.rpcUrls.default.http[0]),
  },
  ssr: false,
});

export function Providers({ children }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
