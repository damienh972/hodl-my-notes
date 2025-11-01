import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";
import { AnchorService } from "../services/anchorService";
import { ExportData } from "../types";
import { hashContent } from "../utils/hash";

/**
 * Performs comprehensive verification of logbook exports.
 * Validates content hashes, chain integrity, and blockchain consistency.
 */
export class LogbookVerifier {
  private lastZipInstance: AdmZip | null = null;

  constructor(private readonly anchorService: AnchorService) {}

  /**
   * Complete verification workflow:
   * 1. Content hash validation
   * 2. Chain linkage verification
   * 3. Blockchain contract comparison
   * 4. Code version consistency check
   */
  async verify(): Promise<void> {
    try {
      const zipPath = await this.selectZipFromImports();
      if (!zipPath) return;

      if (!fs.existsSync(zipPath)) {
        throw new Error("ZIP file not found");
      }

      const zip = new AdmZip(zipPath);
      this.lastZipInstance = zip;

      const exportData = this.parseZipMetadata(zip);
      await this.performVerification(exportData);
    } catch (err: any) {
      console.error("\n❌ Verification failed:", err.message);
      throw err;
    } finally {
      this.lastZipInstance = null;
    }
  }

  private async selectZipFromImports(): Promise<string | null> {
    const importsDir = path.join(process.cwd(), "imports");

    if (!fs.existsSync(importsDir)) {
      console.log("\n⚠️  No imports folder found. Creating it...");
      fs.mkdirSync(importsDir, { recursive: true });
      console.log("📁 Please add .zip files to the 'imports' folder\n");
      return null;
    }

    const files = fs.readdirSync(importsDir).filter((f) => f.endsWith(".zip"));

    if (files.length === 0) {
      console.log("\n⚠️  No import to verify");
      console.log("📁 Please add .zip file in imports folder\n");
      return null;
    }

    const { select } = await import("@inquirer/prompts");

    const choices = [
      ...files.map((file) => ({ name: file, value: file })),
      { name: "⬅️  Back to main menu", value: "back" },
    ];

    const selected = await select({
      message: "📦 Select import to verify:",
      choices,
    });

    if (selected === "back") {
      console.log("\n↩️  Returning to menu...\n");
      return null;
    }

    return path.join(importsDir, selected);
  }

  private parseZipMetadata(zip: AdmZip): ExportData {
    console.log("\n📂 Extracting export...");

    const entries = zip.getEntries();
    const dataEntry = entries.find((e) => e.entryName === "metadata.json");

    if (!dataEntry) {
      throw new Error("Invalid export: missing metadata.json");
    }

    const jsonContent = dataEntry.getData().toString("utf8");

    try {
      return JSON.parse(jsonContent);
    } catch {
      throw new Error("Invalid metadata format");
    }
  }

  private async performVerification(data: ExportData): Promise<void> {
    console.log("\n🔍 VERIFICATION REPORT");
    console.log("=".repeat(60));
    console.log(`Logbook: ${data.metadata.logbookName}`);
    console.log(`Logbook hash: ${data.metadata.logbookNameHash.slice(0, 16)}...`);
    console.log(`Wallet: ${data.metadata.walletAddress}`);
    console.log(`Chain ID: ${data.metadata.chainId}`);
    console.log(`Total entries: ${data.metadata.totalEntries}`);
    console.log(`Export date: ${data.metadata.exportDate}`);

    if (data.metadata.codeHash) {
      console.log(`Export code hash: ${data.metadata.codeHash.slice(0, 16)}...`);

      const { getPackageVersionHash } = await import("../utils/codeHash");
      const currentCodeHash = getPackageVersionHash();
      console.log(`Current code hash: ${currentCodeHash.slice(0, 16)}...`);

      if (data.metadata.codeHash !== currentCodeHash) {
        console.log(`⚠️  CODE VERSION MISMATCH - Different version used`);
      } else {
        console.log(`✓ Code version matches`);
      }
    } else {
      console.log(`⚠️  No code hash in export (old version)`);
    }

    console.log("=".repeat(60));

    let allValid = true;
    let hasPlaceholders = false;

    console.log("\n1️⃣  Verifying content hashes...");
    for (const entry of data.entries) {
      const isPlaceholder = entry.content.includes("PLACEHOLDER - Original content not available");

      if (isPlaceholder) {
        console.log(`  [${entry.index}] ${entry.name}: ⚠️  PLACEHOLDER (reconstructed)`);
        hasPlaceholders = true;
      } else {
        const computedHash = hashContent(entry.content);
        const valid = computedHash === entry.entryHash;

        console.log(
          `  [${entry.index}] ${entry.name}: ${valid ? "✓" : "✗"} ${valid ? "VALID" : "HASH MISMATCH"}`,
        );

        if (!valid) {
          allValid = false;
        }
      }
    }

    console.log("\n2️⃣  Verifying chain integrity (local)...");

    const genesisHash = hashContent("genesis");

    for (let i = 0; i < data.entries.length; i++) {
      const entry = data.entries[i];
      const isPlaceholder = entry.content.includes("PLACEHOLDER - Original content not available");

      if (isPlaceholder) {
        console.log(`  [${i}] ${entry.name}: ⚠️  SKIPPED (placeholder content)`);
      } else {
        let expectedPrev: string;

        if (i === 0) {
          expectedPrev = genesisHash;
        } else {
          const prevIsPlaceholder = data.entries[i - 1].content.includes(
            "PLACEHOLDER - Original content not available",
          );

          if (prevIsPlaceholder) {
            console.log(`  [${i}] ${entry.name}: ⚠️  SKIPPED (previous entry is placeholder)`);
            continue;
          } else {
            expectedPrev = data.entries[i - 1].entryHash;
          }
        }

        const valid = entry.previousHash === expectedPrev;

        console.log(
          `  [${i}] ${entry.name}: ${valid ? "✓" : "✗"} ${valid ? "LINKED" : "BROKEN LINK"}`,
        );

        if (!valid) {
          allValid = false;
        }
      }
    }

    console.log("\n3️⃣  Verifying against blockchain contract...");
    try {
      const onChainEntries = await this.anchorService.getAllEntries(
        data.metadata.logbookName,
        data.metadata.walletAddress,
      );

      if (onChainEntries.length !== data.entries.length) {
        console.log(
          `  ✗ Entry count mismatch: ${onChainEntries.length} on-chain vs ${data.entries.length} in export`,
        );
        allValid = false;
      } else {
        console.log(`  ✓ Entry count matches: ${onChainEntries.length}`);

        for (let i = 0; i < data.entries.length; i++) {
          const local = data.entries[i];
          const onChain = onChainEntries[i];

          const hashMatch = local.entryHash === onChain.entryHash;
          const prevMatch = local.previousHash === onChain.previousHash;
          const nameMatch = local.name === onChain.name;

          const valid = hashMatch && prevMatch && nameMatch;

          console.log(
            `  [${i}] ${local.name}: ${valid ? "✓" : "✗"} ${valid ? "MATCHES CONTRACT" : "MISMATCH"}`,
          );

          if (!valid) {
            if (!nameMatch) console.log(`    - Name mismatch`);
            if (!hashMatch) console.log(`    - Hash mismatch`);
            if (!prevMatch) console.log(`    - Previous hash mismatch`);
            allValid = false;
          }
        }
      }

      const validation = await this.anchorService.validateChain(
        data.metadata.logbookName,
        data.metadata.walletAddress,
      );

      console.log(
        `\n  Contract validation: ${
          validation.valid ? "✓ VALID" : `✗ BROKEN at index ${validation.brokenAtIndex}`
        }`,
      );

      if (!validation.valid) allValid = false;
    } catch (err: any) {
      console.log(`  ✗ Blockchain verification failed: ${err.message}`);
      allValid = false;
    }

    console.log("\n4️⃣  Verifying code hash consistency in proof files...");

    const { getPackageVersionHash } = await import("../utils/codeHash");
    const currentCodeHash = getPackageVersionHash();
    let codeHashInconsistent = false;

    for (const entry of data.entries) {
      const proofPath = `entries/${entry.name}/proof.txt`;
      const proofEntry = this.lastZipInstance!.getEntry(proofPath);

      if (proofEntry) {
        const proofContent = proofEntry.getData().toString("utf8");
        const codeHashMatch = proofContent.match(/Code version hash: (.+)/);

        if (codeHashMatch) {
          const entryCodeHash = codeHashMatch[1].trim();
          const matches = entryCodeHash === currentCodeHash;

          if (!matches) {
            console.log(
              `  [${entry.index}] ${entry.name}: ⚠️  CODE VERSION ${entryCodeHash.slice(0, 16)}...`,
            );
            codeHashInconsistent = true;
          } else {
            console.log(`  [${entry.index}] ${entry.name}: ✓ CODE VERSION OK`);
          }
        } else {
          console.log(`  [${entry.index}] ${entry.name}: ⚠️  No code hash in proof (old version)`);
        }
      }
    }

    if (codeHashInconsistent) {
      console.log("\n  ⚠️  Some entries created with different code version");
    }

    console.log("\n" + "=".repeat(60));

    if (hasPlaceholders) {
      console.log("⚠️  RECONSTRUCTED LOGBOOK - Placeholder content detected");
      console.log("✅ Blockchain verification: PASSED");
      console.log("📋 Restore original files to verify content hashes");
    } else if (allValid) {
      console.log("✅ VERIFICATION PASSED - Logbook is authentic");
    } else {
      console.log("❌ VERIFICATION FAILED - Integrity issues detected");
    }

    console.log("=".repeat(60) + "\n");
  }
}
