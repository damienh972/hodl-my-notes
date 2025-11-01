import * as fs from "fs";
import * as path from "path";
import archiver from "archiver";
import { confirm } from "@inquirer/prompts";
import { ChainManager } from "../utils/chain";
import { ExportData } from "../types";
import { ethers } from "ethers";
import { hashContent } from "../utils/hash";

/**
 * Exports logbooks to timestamped ZIP archives with full metadata.
 * Includes entry content, proofs, and cryptographic metadata for verification.
 */
export class LogbookExporter {
  constructor(
    private chainManager: ChainManager,
    private logbookName: string,
    private walletAddress: string,
    private chainId: number,
    private exportDir?: string,
  ) {}

  /**
   * Creates timestamped ZIP export of logbook.
   *
   * @returns Path to created ZIP file or void if cancelled
   */
  async export(): Promise<string | void> {
    const entries = this.chainManager.getEntries();

    if (entries.length === 0) {
      console.log("No entries to export");
      return;
    }

    const shouldExport = await confirm({
      message: `Export ${entries.length} entries from "${this.logbookName}"?`,
      default: true,
    });

    if (!shouldExport) {
      console.log("Export cancelled");
      return;
    }

    console.log("\n📦 Creating export...");

    const logbookNameHash = ethers.keccak256(ethers.toUtf8Bytes(this.logbookName));

    const { getPackageVersionHash } = await import("../utils/codeHash");
    const codeHash = getPackageVersionHash();

    const logbookDir = ChainManager.getLogbookDir(this.logbookName);

    const exportData: ExportData = {
      metadata: {
        version: "1.0.0",
        logbookName: this.logbookName,
        logbookNameHash,
        exportDate: new Date().toISOString(),
        totalEntries: entries.length,
        walletAddress: this.walletAddress,
        chainId: this.chainId,
        codeHash,
      },
      entries: entries.map((entry, index) => {
        const entryPath = path.join(logbookDir, entry.name, "entry.txt");

        if (!fs.existsSync(entryPath)) {
          throw new Error(`Entry file not found: ${entryPath}`);
        }

        const content = fs.readFileSync(entryPath, "utf8");

        return {
          index,
          name: entry.name,
          content,
          entryHash: entry.entryHash,
          previousHash: entry.previousHash || hashContent("genesis"),
          txHash: entry.txHash,
          timestamp: entry.timestamp,
          blockNumber: entry.blockNumber,
          merkleRoot: entry.merkleRoot,
        };
      }),
    };

    const exportsDir = this.exportDir
      ? path.join(this.exportDir, "exports")
      : path.join(process.cwd(), "exports");

    fs.mkdirSync(exportsDir, { recursive: true });

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z/, "")
      .replace("T", "_")
      .slice(0, 15);

    const exportFilename = `${this.logbookName}_${timestamp}.zip`;
    const zipPath = path.join(exportsDir, exportFilename);

    await this.createZip(exportData, zipPath, entries, logbookDir);

    console.log(`✓ Export created: ${zipPath}`);
    return zipPath;
  }

  private async createZip(
    exportData: ExportData,
    zipPath: string,
    entries: any[],
    logbookDir: string,
  ): Promise<void> {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on("close", () => {
        console.log(`Archive created: ${archive.pointer()} bytes`);
        resolve();
      });

      output.on("error", reject);
      archive.on("error", reject);

      archive.pipe(output);

      archive.append(JSON.stringify(exportData, null, 2), {
        name: "metadata.json",
      });

      for (const entry of entries) {
        const entryDir = path.join(logbookDir, entry.name);
        const entryPath = path.join(entryDir, "entry.txt");
        const proofPath = path.join(entryDir, "proof.txt");

        if (fs.existsSync(entryPath)) {
          const entryContent = fs.readFileSync(entryPath);
          archive.append(entryContent, {
            name: `entries/${entry.name}/entry.txt`,
          });
        }

        if (fs.existsSync(proofPath)) {
          const proofContent = fs.readFileSync(proofPath);
          archive.append(proofContent, {
            name: `entries/${entry.name}/proof.txt`,
          });
        }
      }

      archive.finalize();
    });
  }
}
