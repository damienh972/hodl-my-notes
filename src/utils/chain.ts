import * as fs from "fs";
import * as path from "path";
import { ChainData, ChainEntry } from "../types";
import { createMerkleTree, getMerkleRoot } from "./merkle";
import { hashContent } from "./hash";

const GENESIS_HASH = hashContent("genesis");

/**
 * Manages local logbook chain data with cryptographic integrity.
 * Handles chain.json persistence, entry validation, and Merkle tree computation.
 */
export class ChainManager {
  private data: ChainData;
  private logbookName: string;
  private chainFile: string;
  private logbookDir: string;

  /**
   * @throws {Error} If logbook name is empty
   */
  constructor(logbookName: string) {
    if (!logbookName || logbookName.trim() === "") {
      throw new Error("Logbook name cannot be empty");
    }

    this.logbookName = logbookName;
    this.logbookDir = ChainManager.getLogbookDir(logbookName);
    this.chainFile = path.join(this.logbookDir, "chain.json");
    this.ensureLogbookDirectory();
    this.data = this.loadOrCreateChain();
  }

  private ensureLogbookDirectory(): void {
    if (!fs.existsSync(this.logbookDir)) {
      fs.mkdirSync(this.logbookDir, { recursive: true });
    }
  }

  /**
   * Loads existing chain.json or creates a new genesis chain.
   *
   * @returns Chain data object
   * @throws {Error} If chain.json is corrupted or has invalid structure
   */
  private loadOrCreateChain(): ChainData {
    if (fs.existsSync(this.chainFile)) {
      try {
        const content = fs.readFileSync(this.chainFile, "utf8");
        const data = JSON.parse(content);

        if (!data.logbookName || !Array.isArray(data.entries)) {
          throw new Error("Invalid chain.json structure");
        }

        return data;
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error(`Corrupted chain.json: ${error.message}`);
        }
        throw error;
      }
    }

    const genesisChain: ChainData = {
      logbookName: this.logbookName,
      entries: [],
    };

    this.saveChainData(genesisChain);
    return genesisChain;
  }

  private saveChainData(data: ChainData): void {
    try {
      fs.writeFileSync(this.chainFile, JSON.stringify(data, null, 2), "utf8");
    } catch (error: any) {
      throw new Error(`Failed to save chain data: ${error.message}`);
    }
  }

  private save(): void {
    this.saveChainData(this.data);
  }

  /**
   * Adds a new entry to the chain with Merkle root computation.
   *
   * @param entryHash - 0x-prefixed hex hash
   * @param txHash - 0x-prefixed 64-char hex transaction hash
   * @returns The created chain entry with computed Merkle root
   * @throws {Error} If hash formats, timestamp, or block number are invalid
   */
  addEntry(
    name: string,
    entryHash: string,
    txHash: string,
    timestamp: number,
    blockNumber: number,
  ): ChainEntry {
    if (!entryHash || typeof entryHash !== "string" || !entryHash.match(/^0x[0-9a-fA-F]+$/)) {
      throw new Error(
        "Invalid entry hash format: must start with 0x and contain only hex characters",
      );
    }
    if (!txHash || typeof txHash !== "string" || !txHash.match(/^0x[0-9a-fA-F]{64}$/)) {
      throw new Error("Invalid transaction hash format: must be 0x followed by 64 hex characters");
    }
    if (typeof timestamp !== "number" || timestamp < 0) {
      throw new Error("Timestamp must be a positive number");
    }
    if (typeof blockNumber !== "number" || blockNumber < 0) {
      throw new Error("Block number must be a positive number");
    }

    const previousHash =
      this.data.entries.length > 0
        ? this.data.entries[this.data.entries.length - 1].entryHash
        : GENESIS_HASH;

    const allHashes = this.data.entries.map((e) => e.entryHash);
    allHashes.push(entryHash);
    const tree = createMerkleTree(allHashes);
    const merkleRoot = getMerkleRoot(tree);

    const entry: ChainEntry = {
      name,
      entryHash,
      previousHash,
      txHash,
      timestamp,
      blockNumber,
      merkleRoot,
    };

    this.data.entries.push(entry);
    this.save();

    return entry;
  }

  /**
   * Returns a copy of all entries to prevent external modifications.
   */
  getEntries(): ChainEntry[] {
    return [...this.data.entries];
  }

  /**
   * Gets the most recent entry in the chain.
   */
  getLastEntry(): ChainEntry | null {
    return this.data.entries.length > 0 ? this.data.entries[this.data.entries.length - 1] : null;
  }

  /**
   * Validates chain integrity by checking:
   * - Genesis hash on first entry
   * - previousHash linkage
   * - Content hash matches for all entry files
   *
   * @returns Validation result with detailed error messages
   */
  validateChain(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.data.entries.length === 0) {
      return { valid: true, errors: [] };
    }

    if (this.data.entries[0].previousHash !== GENESIS_HASH) {
      errors.push(`First entry must have genesis previousHash (${GENESIS_HASH})`);
    }

    for (let i = 1; i < this.data.entries.length; i++) {
      const prev = this.data.entries[i - 1];
      const curr = this.data.entries[i];

      if (curr.previousHash !== prev.entryHash) {
        errors.push(
          `Chain broken at index ${i}: previousHash mismatch (expected ${prev.entryHash}, got ${curr.previousHash})`,
        );
      }
    }

    for (let i = 0; i < this.data.entries.length; i++) {
      const entry = this.data.entries[i];
      const entryPath = path.join(this.logbookDir, entry.name, "entry.txt");

      if (!fs.existsSync(entryPath)) {
        errors.push(`Entry file not found: ${entryPath}`);
        continue;
      }

      try {
        const content = fs.readFileSync(entryPath, "utf8");
        const computedHash = hashContent(content);

        if (computedHash !== entry.entryHash) {
          errors.push(
            `Content hash mismatch for entry ${entry.name}: expected ${entry.entryHash}, computed ${computedHash}`,
          );
        }
      } catch (error: any) {
        errors.push(`Failed to read entry ${entry.name}: ${error.message}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Clears all entries from the chain.
   */
  clear(): void {
    this.data = { logbookName: this.logbookName, entries: [] };
    this.save();
  }

  /**
   * Replaces entire chain with provided entries (used for reconstruction).
   */
  reconstruct(entries: ChainEntry[]): void {
    this.data = { logbookName: this.logbookName, entries };
    this.save();
  }

  /**
   * Gets the absolute path to a logbook directory.
   *
   * @remarks Uses LOGBOOK_ROOT env var or defaults to cwd/logbooks
   */
  static getLogbookDir(logbookName: string): string {
    const root = process.env.LOGBOOK_ROOT || path.join(process.cwd(), "logbooks");
    return path.join(root, logbookName);
  }

  /**
   * Lists all logbook names in the root directory.
   */
  static listLogbooks(): string[] {
    const root = process.env.LOGBOOK_ROOT || path.join(process.cwd(), "logbooks");

    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
      return [];
    }

    return fs.readdirSync(root).filter((name) => {
      const stat = fs.statSync(path.join(root, name));
      return stat.isDirectory();
    });
  }

  /**
   * Checks if a logbook directory exists locally.
   */
  static logbookExists(logbookName: string): boolean {
    const logbookDir = ChainManager.getLogbookDir(logbookName);
    return fs.existsSync(logbookDir);
  }

  getLogbookDir(): string {
    return this.logbookDir;
  }
}
