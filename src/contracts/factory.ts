import type { Abi } from "viem";
import FactoryJson from "./abi/RelixCollectionFactory.json";
import { FACTORY_ADDRESS_BY_CHAIN } from "./addresses";

export const FactoryAbi = FactoryJson as unknown as Abi;

export function getFactoryAddress(chainId: number): `0x${string}` {
  const addr = FACTORY_ADDRESS_BY_CHAIN[chainId];
  if (!addr) throw new Error(`Factory address not set for chainId=${chainId}`);
  return addr;
}
