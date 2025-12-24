import { NFTCard } from "./NFTCard";
import { cn } from "../../lib/cn";

export function NFTGrid({ items = [], className = "" }) {
  return (
    <div className={cn("grid gap-4", className)}>
      {items.map((it) => (
        <NFTCard
          key={`${it.chainId || it.chain || "x"}-${it.collection}-${it.tokenId}`}
          item={it}
        />
      ))}
    </div>
  );
}
