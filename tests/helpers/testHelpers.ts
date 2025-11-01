import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ChainManager } from "../../src/utils/chain";
import { validateConfig } from "../../src/utils/config";
import { hashContent as hashUtil } from "../../src/utils/hash";
import AdmZip from "adm-zip";

export class TestHelpers {
  static ensureEnvVars(): void {
    try {
      validateConfig();
    } catch (err: any) {
      throw new Error(
        `Test environment not configured: ${err.message}`
      );
    }
  }

  static createTempDir(): string {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "logbook-test-"));
    return tempDir;
  }

  static cleanupTempDir(dir: string): void {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  static hashContent(content: string): string {
    return hashUtil(content);
  }

  static createTestContent(index: number): string {
    return `Test entry ${index}\nContent created at ${new Date().toISOString()}\nUnique ID: ${Math.random()}`;
  }

  static createMockChain(
    chainManager: ChainManager,
    count: number,
    namePrefix: string = "entry"
  ): void {
    for (let i = 0; i < count; i++) {
      const entryName = `${namePrefix}-${i}`;
      const content = this.createTestContent(i);
      const entryHash = this.hashContent(content);
      const txHash = "0x" + i.toString().padStart(64, "0");
      const timestamp = Math.floor(Date.now() / 1000) + i;
      const blockNumber = 1000 + i;

      chainManager.addEntry(entryName, entryHash, txHash, timestamp, blockNumber);

      const entryDir = path.join(chainManager.getLogbookDir(), entryName);
      fs.mkdirSync(entryDir, { recursive: true });
      fs.writeFileSync(path.join(entryDir, "entry.txt"), content, "utf-8");
    }
  }

  static createMockExport(logbookName: string, entryCount: number): any {
    const entries = [];
    let previousHash = this.hashContent("genesis");

    for (let i = 0; i < entryCount; i++) {
      const content = this.createTestContent(i);
      const entryHash = this.hashContent(content);

      entries.push({
        index: i,
        name: `entry-${i}`,
        entryHash,
        previousHash,
        txHash: "0x" + i.toString().padStart(64, "0"),
        timestamp: Math.floor(Date.now() / 1000) + i,
        blockNumber: 1000 + i,
        content,
        merkleRoot: "0x" + "0".repeat(64),
      });

      previousHash = entryHash;
    }

    const ethers = require("ethers");
    const logbookNameHash = ethers.keccak256(ethers.toUtf8Bytes(logbookName));

    return {
      metadata: {
        version: "1.0.0",
        logbookName,
        logbookNameHash,
        exportDate: new Date().toISOString(),
        totalEntries: entryCount,
        walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        chainId: 31337,
        codeHash: "test-code-hash-" + Date.now(),
      },
      entries,
    };
  }

  static createZipFile(zipPath: string, exportData: any): void {
    const zip = new AdmZip();

    zip.addFile(
      "metadata.json",
      Buffer.from(JSON.stringify(exportData, null, 2), "utf-8")
    );

    exportData.entries.forEach((entry: any) => {
      const entryPath = `entries/${entry.entryName}/entry.txt`;
      zip.addFile(entryPath, Buffer.from(entry.content, "utf-8"));
    });

    zip.writeZip(zipPath);
  }


  static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static randomHex(length: number): string {
    const chars = "0123456789abcdef";
    let result = "0x";
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  static createMockContractEntry(
    logbookName: string,
    entryName: string,
    index: number
  ): any {
    const content = this.createTestContent(index);
    const entryHash = this.hashContent(content);
    const previousHash =
      index === 0
        ? "0x0000000000000000000000000000000000000000000000000000000000000000"
        : this.hashContent(this.createTestContent(index - 1));

    return {
      logbookName,
      entryName,
      entryHash,
      previousHash,
      timestamp: Math.floor(Date.now() / 1000) + index,
      blockNumber: 1000 + index,
    };
  }

  static verifyChainIntegrity(chainManager: ChainManager): boolean {
    const validation = chainManager.validateChain();
    return validation.valid;
  }

  static hashesMatch(hash1: string, hash2: string): boolean {
    return hash1.toLowerCase() === hash2.toLowerCase();
  }

  static fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  static readFile(filePath: string): string {
    return fs.readFileSync(filePath, "utf-8");
  }

  static countFiles(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0;
    return fs.readdirSync(dirPath).length;
  }

  static getFileSize(filePath: string): number {
    return fs.statSync(filePath).size;
  }

  static ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  static mockTransactionReceipt(txHash: string, blockNumber: number): any {
    return {
      transactionHash: txHash,
      blockNumber,
      confirmations: 1,
      status: 1,
      gasUsed: BigInt(21000),
    };
  }

  static isValidHex(value: string, length?: number): boolean {
    const pattern = length
      ? new RegExp(`^0x[a-fA-F0-9]{${length}}$`)
      : /^0x[a-fA-F0-9]+$/;
    return pattern.test(value);
  }

  static isValidTimestamp(timestamp: number): boolean {
    return timestamp > 0 && timestamp <= Math.floor(Date.now() / 1000);
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }
}
