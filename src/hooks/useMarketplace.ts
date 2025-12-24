// src/hooks/useMarketplace.ts
import { useChainId, useReadContract, useWriteContract } from "wagmi";
import { RELIX_MARKETPLACE_ABI } from "../contracts/relixMarketplaceAbi";
import { RELIX_MARKETPLACE_ADDRESS } from "../contracts/relixMarketplaceAddress";

declare global {
  interface Window {
    __RELIX_MARKETPLACE__?: Record<number, `0x${string}`>;
  }
}

type AddressMap = Record<number, `0x${string}`>;

function getMarketplaceAddress(chainId: number, map?: AddressMap) {
  const fromRuntime =
    typeof window !== "undefined" && window.__RELIX_MARKETPLACE__
      ? window.__RELIX_MARKETPLACE__[chainId]
      : undefined;

  const fromInjected = map?.[chainId];
  const fromStatic = (RELIX_MARKETPLACE_ADDRESS as AddressMap)?.[chainId];

  return (fromRuntime || fromInjected || fromStatic) as `0x${string}` | undefined;
}

export function useMarketplace(opts?: { addressMap?: AddressMap }) {
  const chainId = useChainId();
  const address = getMarketplaceAddress(Number(chainId || 0), opts?.addressMap);

  const { writeContractAsync, isPending } = useWriteContract();

  function requireAddress() {
    if (!address) {
      // Keep this generic for OSS (no internal chain hints)
      throw new Error("Marketplace is not available on the current network.");
    }
    return address;
  }

  /**
   * READ: listing by id
   * Note: This is a hook; it must be called unconditionally inside a component.
   */
  function useListing(listingId?: bigint) {
    return useReadContract({
      abi: RELIX_MARKETPLACE_ABI,
      address,
      functionName: "listings",
      args: listingId ? [listingId] : undefined,
      query: { enabled: Boolean(address && listingId) },
    });
  }

  /**
   * READ: nextListingId
   */
  function useNextListingId() {
    return useReadContract({
      abi: RELIX_MARKETPLACE_ABI,
      address,
      functionName: "nextListingId",
      query: { enabled: Boolean(address) },
    });
  }

  // ACTION: buy
  async function buy(listingId: bigint, amount: bigint, totalNativeToSend?: bigint) {
    return writeContractAsync({
      abi: RELIX_MARKETPLACE_ABI,
      address: requireAddress(),
      functionName: "buy",
      args: [listingId, amount],
      value: totalNativeToSend,
    });
  }

  // ACTION: list ERC721
  async function listERC721(
    nft: `0x${string}`,
    tokenId: bigint,
    price: bigint,
    payToken: `0x${string}`
  ) {
    return writeContractAsync({
      abi: RELIX_MARKETPLACE_ABI,
      address: requireAddress(),
      functionName: "listERC721",
      args: [nft, tokenId, price, payToken],
    });
  }

  // ACTION: list ERC1155
  async function listERC1155(
    nft: `0x${string}`,
    tokenId: bigint,
    amount: bigint,
    price: bigint,
    payToken: `0x${string}`
  ) {
    return writeContractAsync({
      abi: RELIX_MARKETPLACE_ABI,
      address: requireAddress(),
      functionName: "listERC1155",
      args: [nft, tokenId, amount, price, payToken],
    });
  }

  // ACTION: withdraw native
  async function withdrawNative() {
    return writeContractAsync({
      abi: RELIX_MARKETPLACE_ABI,
      address: requireAddress(),
      functionName: "withdrawNative",
      args: [],
    });
  }

  // ACTION: withdraw erc20
  async function withdrawERC20(token: `0x${string}`) {
    return writeContractAsync({
      abi: RELIX_MARKETPLACE_ABI,
      address: requireAddress(),
      functionName: "withdrawERC20",
      args: [token],
    });
  }

  return {
    chainId,
    address,
    isPending,
    useListing,
    useNextListingId,
    buy,
    listERC721,
    listERC1155,
    withdrawNative,
    withdrawERC20,
  };
}
