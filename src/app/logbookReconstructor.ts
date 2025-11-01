import * as fs from "fs";
import * as path from "path";
import { input } from "@inquirer/prompts";
import { BlockchainSyncService } from "../services/blockchainSyncService";
import { ChainManager } from "../utils/chain";
import { ChainEntry } from "../types";
import { createMerkleTree, getMerkleRoot } from "../utils/merkle";

/**
 * Reconstructs logbook structure from blockchain contract data.
 * Creates placeholder entries with restoration instructions when original content unavailable.
 */
export class LogbookReconstructor {
  constructor(private readonly syncService: BlockchainSyncService) {}

  private async checkLocalIntegrity(logbookName: string): Promise<{
    needsReconstruction: boolean;
    contractEntries?: any[];
  }> {
    const result = await this.syncService.syncFromContract(logbookName);
    if (!result.success || result.entries.length === 0) {
      return { needsReconstruction: false };
    }

    if (!ChainManager.logbookExists(logbookName)) {
      return { needsReconstruction: true, contractEntries: result.entries };
    }

    const chainManager = new ChainManager(logbookName);
    const localChain = chainManager.getEntries();

    if (localChain.length === 0) {
      return { needsReconstruction: true, contractEntries: result.entries };
    }

    const hasPlaceholders = localChain.some((e) => e.txHash === "reconstructed");
    if (hasPlaceholders) {
      return { needsReconstruction: true, contractEntries: result.entries };
    }

    const lastLocal = localChain[localChain.length - 1];
    const lastContract = result.entries[result.entries.length - 1];

    const needsReconstruction =
      localChain.length !== result.entries.length || lastLocal.entryHash !== lastContract.entryHash;

    return {
      needsReconstruction,
      contractEntries: result.entries,
    };
  }

  /**
   * Reconstruction workflow:
   * 1. Fetches entries from contract
   * 2. Rebuilds chain.json with Merkle roots
   * 3. Creates placeholder entry files
   * 4. Validates reconstructed chain
   */
  async reconstruct(): Promise<void> {
    console.log("\n🔄 RECONSTRUCT FROM CONTRACT\n");

    const logbookName = await this.promptLogbookName();
    const check = await this.checkLocalIntegrity(logbookName);

    if (!check.needsReconstruction) {
      console.log("✓ Local chain is already valid and up-to-date");
      console.log("ℹ️  No reconstruction needed\n");
      return;
    }

    console.log(`\nReconstructing logbook: ${logbookName}`);
    console.log("This will rebuild chain.json and create placeholder entries\n");

    const entries = check.contractEntries!;

    if (entries.length === 0) {
      console.log("⚠️  No entries found on-chain for this logbook\n");
      return;
    }

    console.log("\n🔨 Rebuilding local structure...");

    const chainManager = new ChainManager(logbookName);

    const chainEntries: ChainEntry[] = entries.map((entry, index) => {
      const allHashes = entries.slice(0, index + 1).map((e: any) => e.entryHash);
      const tree = createMerkleTree(allHashes);
      const merkleRoot = getMerkleRoot(tree);

      return {
        name: entry.name,
        entryHash: entry.entryHash,
        previousHash: entry.previousHash,
        txHash: "reconstructed",
        timestamp: entry.timestamp,
        blockNumber: entry.blockNumber,
        merkleRoot,
      };
    });

    chainManager.reconstruct(chainEntries);

    const logbookDir = ChainManager.getLogbookDir(logbookName);

    for (const entry of entries) {
      const entryDir = path.join(logbookDir, entry.name);
      const entryPath = path.join(entryDir, "entry.txt");

      if (!fs.existsSync(entryPath)) {
        if (!fs.existsSync(entryDir)) {
          fs.mkdirSync(entryDir, { recursive: true });
        }

        const placeholder = [
          "PLACEHOLDER - Original content not available",
          "",
          `Entry hash: ${entry.entryHash}`,
          `Timestamp: ${new Date(entry.timestamp * 1000).toISOString()}`,
          `Block: ${entry.blockNumber}`,
          "",
          "To restore:",
          "1. Locate backup",
          "2. Replace this file",
          "3. Verify hash matches",
        ].join("\n");

        fs.writeFileSync(entryPath, placeholder, "utf-8");
      }
    }

    console.log("✓ chain.json reconstructed");
    console.log(`✓ ${entries.length} entries created`);

    const validation = chainManager.validateChain();

    if (validation.valid) {
      console.log("\n✓ Chain validation: VALID");
    } else {
      const errorsText = validation.errors.map((e) => `- ${e}`).join("\n");
      console.log("\n✓ Chain validation: INVALID\n" + errorsText);
    }

    console.log("\n✅ Reconstruction complete");
    console.log("⚠️  Restore original files from backup\n");
  }

  private async promptLogbookName(): Promise<string> {
    return input({
      message: "📚 Logbook name to reconstruct:",
      validate: (value: string) => {
        if (!value.trim()) return "Name cannot be empty";
        if (!/^[a-zA-Z0-9_-]+$/.test(value.trim())) {
          return "Name must contain only letters, numbers, _ or -";
        }
        return true;
      },
      transformer: (value: string) => value.trim(),
    });
  }
}
