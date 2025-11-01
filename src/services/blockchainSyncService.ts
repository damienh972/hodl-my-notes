import { AnchorService } from "./anchorService";
import { SyncResult } from "../types";

/**
 * Service for synchronizing logbook data between local storage and blockchain.
 */
export class BlockchainSyncService {
  constructor(private anchorService: AnchorService) {}

  /**
   * Fetches all entries from the blockchain for a logbook.
   *
   * @returns Success status, entries array, and any errors
   */
  async syncFromContract(logbookName: string): Promise<SyncResult> {
    const errors: string[] = [];

    try {
      console.log(`\n🔍 Fetching entries for logbook "${logbookName}"...`);
      const ocLogbooks = await this.anchorService.getLogbookNames();

      if (!ocLogbooks.includes(logbookName)) {
        console.log(`⚠️  Logbook "${logbookName}" not found on-chain.`);
        return {
          success: true,
          entries: [],
          errors: [],
        };
      }
      const entries = await this.anchorService.getAllEntries(logbookName);

      console.log(`✓ Found ${entries.length} entries on-chain`);

      return {
        success: true,
        entries,
        errors: [],
      };
    } catch (err: any) {
      errors.push(`Sync failed: ${err.message}`);
      return {
        success: false,
        entries: [],
        errors,
      };
    }
  }

  /**
   * Validates logbook chain integrity using contract validation.
   */
  async validateOnChain(
    logbookName: string,
    address?: string,
  ): Promise<{
    valid: boolean;
    brokenAtIndex: number;
  }> {
    try {
      return await this.anchorService.validateChain(logbookName, address);
    } catch (err: any) {
      console.error("Validation error:", err.message);
      return { valid: false, brokenAtIndex: 0 };
    }
  }

  /**
   * Formats sync result into human-readable summary.
   */
  getSyncSummary(result: SyncResult): string {
    const lines = [
      "Contract Sync Summary",
      "=".repeat(50),
      `Status: ${result.success ? "✓ Success" : "✗ Failed"}`,
      `Entries found: ${result.entries.length}`,
    ];

    if (result.errors.length > 0) {
      lines.push("\nErrors:");
      result.errors.forEach((err) => lines.push(`  - ${err}`));
    }

    return lines.join("\n");
  }
}
