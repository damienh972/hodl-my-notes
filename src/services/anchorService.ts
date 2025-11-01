import { ethers } from "ethers";
import { TxResult, BaseEntry, ValidationResult } from "../types";
import contractDatas from "../abis/logbookAnchor.json";

/**
 * Service for blockchain interactions with the LogbookAnchor smart contract.
 * Handles entry anchoring, chain validation, and logbook queries.
 */
export class AnchorService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private contract: ethers.Contract;
  private explorerUrl: string;

  /**
   * @throws {Error} If contract address is invalid or initialization fails
   */
  constructor(rpcUrl: string, privateKey: string, contractAddress: string, explorerUrl: string) {
    if (!ethers.isAddress(contractAddress)) {
      throw new Error(`AnchorService initialization failed: invalid contract address`);
    }

    try {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      this.contract = new ethers.Contract(contractAddress, contractDatas.output.abi, this.wallet);
      this.explorerUrl = explorerUrl;
    } catch (err) {
      throw new Error(`AnchorService initialization failed: ${(err as Error).message}`);
    }
  }

  get payerAddress(): string {
    return this.wallet.address;
  }

  /**
   * Anchors an entry to the blockchain.
   *
   * @param entryHash - 0x-prefixed 32-byte hex string
   * @param previousHash - Hash of previous entry or genesis hash
   * @returns Transaction hash and explorer URL
   * @throws {Error} If validation fails or transaction reverts
   */
  async anchorEntry(
    logbookName: string,
    entryName: string,
    entryHash: string,
    previousHash: string,
  ): Promise<TxResult> {
    if (!logbookName || logbookName.trim() === "") {
      throw new Error("Logbook name cannot be empty");
    }
    if (!entryName || entryName.trim() === "") {
      throw new Error("Entry name cannot be empty");
    }
    if (!entryHash || !entryHash.match(/^0x[0-9a-fA-F]{64}$/)) {
      throw new Error(`Invalid entryHash format: ${entryHash}`);
    }
    if (!previousHash || !previousHash.match(/^0x[0-9a-fA-F]{64}$/)) {
      throw new Error(`Invalid previousHash format: ${previousHash}`);
    }

    try {
      const tx = await this.contract.anchorEntry(logbookName, entryName, entryHash, previousHash);
      const receipt = await tx.wait(1);

      return {
        txHash: receipt.hash,
        explorerTxUrl: `${this.explorerUrl}/tx/${receipt.hash}`,
      };
    } catch (err: any) {
      throw new Error(`Anchor failed: ${err.message}`);
    }
  }

  /**
   * Retrieves all logbook names for an address.
   *
   * @param address - Defaults to payer address if not provided
   */
  async getLogbookNames(address?: string): Promise<string[]> {
    const addr = address || this.wallet.address;
    const names: string[] = await this.contract.getLogbookNames(addr);
    return names;
  }

  /**
   * Gets the number of entries in a logbook.
   */
  async getEntryCount(logbookName: string, address?: string): Promise<number> {
    const addr = address || this.wallet.address;
    const count = await this.contract.getEntryCount(addr, logbookName);
    return Number(count);
  }

  /**
   * Retrieves a single entry by index.
   */
  async getEntry(logbookName: string, index: number, address?: string): Promise<BaseEntry> {
    const addr = address || this.wallet.address;
    const entry = await this.contract.getEntry(addr, logbookName, index);

    return {
      name: entry[0],
      entryHash: entry[1],
      previousHash: entry[2],
      timestamp: Number(entry[3]),
      blockNumber: Number(entry[4]),
    };
  }

  /**
   * Retrieves all entries from a logbook using batched queries.
   *
   * @remarks Uses 100-entry batches for efficient retrieval
   */
  async getAllEntries(logbookName: string, address?: string): Promise<BaseEntry[]> {
    const addr = address || this.wallet.address;

    console.log("addr:", addr);
    console.log("logbookName:", logbookName);

    const totalBigInt = await this.contract.getEntryCount(addr, logbookName);
    const total = Number(totalBigInt);
    if (total === 0) return [];

    const BATCH_SIZE = 100;
    let results: BaseEntry[] = [];

    for (let start = 0; start < total; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE, total);
      const batch = await this.contract.getEntriesRange(addr, logbookName, start, end);
      results = results.concat(
        batch.map((e: any) => ({
          name: e.name,
          entryHash: e.entryHash,
          previousHash: e.previousHash,
          timestamp: Number(e.timestamp),
          blockNumber: Number(e.blockNumber),
        })),
      );
    }

    return results;
  }

  /**
   * Validates chain integrity on-chain.
   *
   * @returns Valid status and broken index (0 if valid)
   */
  async validateChain(logbookName: string, address?: string): Promise<ValidationResult> {
    const addr = address || this.wallet.address;
    const result = await this.contract.validateChain(addr, logbookName);

    return {
      valid: result[0],
      brokenAtIndex: Number(result[1]),
    };
  }

  /**
   * Gets wallet balance in ETH.
   */
  async getBalance(): Promise<string> {
    const balance = await this.provider.getBalance(this.wallet.address);
    return ethers.formatEther(balance);
  }
}
