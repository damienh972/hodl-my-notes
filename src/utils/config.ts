import { isAddress } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * Application configuration interface.
 */
export interface AppConfig {
  rpcUrl: string;
  payerPrivateKey: string;
  explorerUrl: string;
  contractAddress: string;
  chainId: number;
}

/**
 * Validates and loads configuration from environment variables.
 *
 * @returns Validated configuration object
 * @throws {Error} If required variables missing or contract address invalid
 */
export function validateConfig(): AppConfig {
  const required = ["RPC_URL", "PAYER_PRIVATE_KEY", "EXPLORER_URL", "CONTRACT_ADDRESS", "CHAIN_ID"];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        `Please copy .env.example to .env and configure it.`,
    );
  }

  const contractAddress = process.env.CONTRACT_ADDRESS!;
  if (!isAddress(contractAddress)) {
    throw new Error(`Invalid contract address`);
  }

  return {
    rpcUrl: process.env.RPC_URL!,
    payerPrivateKey: process.env.PAYER_PRIVATE_KEY!,
    explorerUrl: process.env.EXPLORER_URL!,
    contractAddress: process.env.CONTRACT_ADDRESS!,
    chainId: parseInt(process.env.CHAIN_ID!, 10),
  };
}
