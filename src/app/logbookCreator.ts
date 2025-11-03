import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { input, confirm } from "@inquirer/prompts";
import { AnchorService } from "../services/anchorService";
import { ChainManager } from "../utils/chain";
import { hashContent, buildPayload } from "../utils/hash";

/**
 * Handles interactive creation and blockchain anchoring of logbook entries.
 * Manages text editor integration and cryptographic proof generation.
 */
export class LogbookCreator {
  constructor(
    private readonly anchorService: AnchorService,
    private readonly logbookName: string,
    private readonly chainManager: ChainManager,
  ) {}

  /**
   * Interactive entry creation workflow.
   * Prompts for name, opens editor, confirms, and anchors to blockchain.
   */
  async create(): Promise<void> {
    try {
      const entryName = await this.promptEntryName();
      const content = await this.promptContent();
      const confirmed = await this.confirmCreation(entryName, content);

      if (!confirmed) {
        console.log("\n❌ Creation cancelled\n");
        return;
      }

      await this.saveAndAnchor(entryName, content);
    } catch (err: any) {
      console.error("\n❌ Error:", err.message);
      throw err;
    }
  }

  private async promptEntryName(): Promise<string> {
    const currentCount = this.chainManager.getEntries().length;
    const prefix = String(currentCount + 1).padStart(4, '0');

    const userInput = await input({
      message: `📝 Entry name (will be prefixed with ${prefix}_):`,
      validate: (value: string) => {
        if (!value.trim()) return "Name cannot be empty";
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
          return "Name must contain only letters, numbers, _ or -";
        }
        return true;
      },
    });

    const finalName = `${prefix}_${userInput}`;
    const entryDir = path.join(this.chainManager.getLogbookDir(), finalName);

    if (fs.existsSync(entryDir)) {
      throw new Error("Entry with this name already exists");
    }

    return finalName;
  }

  private async promptContent(): Promise<string> {
    const tmpFile = `/tmp/logbook-entry-${Date.now()}.txt`;
    const editor = process.env.EDITOR || "vi";

    return this.openEditorOrFallback(editor, tmpFile);
  }

  private async openEditorOrFallback(editor: string, tmpFile: string): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`\n✍️  Opening ${editor} editor... (save and exit to continue)\n`);

      const editorProcess = spawn(editor, [tmpFile], { stdio: "inherit" });

      editorProcess.on("error", (err: any) => {
        if (err.code === "ENOENT") {
          this.handleEditorNotFound(editor, resolve, reject);
        } else {
          reject(err);
        }
      });

      editorProcess.on("exit", (code: number) => {
        this.handleEditorExit(code, tmpFile, resolve, reject);
      });
    });
  }

  private handleEditorNotFound(
    editor: string,
    resolve: (value: string) => void,
    reject: (reason?: any) => void,
  ): void {
    console.log(`\n⚠️  ${editor} not found. Using direct input instead.\n`);
    console.log("Type your content (type 'END' alone on a new line to finish):\n");

    const lines: string[] = [];
    const stdin = process.stdin;

    stdin.setEncoding("utf8");
    stdin.resume();

    let buffer = "";

    const onData = (chunk: string) => {
      buffer += chunk;
      const parts = buffer.split("\n");

      buffer = parts.pop() || "";

      for (const line of parts) {
        if (line.trim() === "END") {
          stdin.pause();
          stdin.removeListener("data", onData);
          resolve(lines.join("\n"));
          return;
        }
        lines.push(line);
      }
    };

    stdin.on("data", onData);

    const timeout = setTimeout(() => {
      stdin.pause();
      stdin.removeListener("data", onData);
      reject(new Error("Input timeout - no END marker received"));
    }, 300000);

    stdin.once("end", () => {
      clearTimeout(timeout);
      stdin.removeListener("data", onData);
      resolve(lines.join("\n"));
    });
  }

  private handleEditorExit(
    code: number,
    tmpFile: string,
    resolve: (value: string) => void,
    reject: (reason?: any) => void,
  ): void {
    if (code === 0) {
      try {
        const content = fs.readFileSync(tmpFile, "utf-8");
        fs.unlinkSync(tmpFile);
        resolve(content);
      } catch (err) {
        reject(err);
      }
    } else {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
      reject(new Error("Editor closed without saving"));
    }
  }

  private async confirmCreation(name: string, content: string): Promise<boolean> {
    console.log("\n" + "=".repeat(50));
    console.log("PREVIEW");
    console.log("=".repeat(50));
    console.log(`Logbook: ${this.logbookName}`);
    console.log(`Entry: ${name}`);
    console.log(`Length: ${content.length} characters`);
    console.log(`Preview: ${content.substring(0, 100)}${content.length > 100 ? "..." : ""}`);
    console.log("=".repeat(50));

    return confirm({
      message: "✔ Confirm and anchor?",
      default: false,
    });
  }

  private async saveAndAnchor(entryName: string, content: string): Promise<void> {
    const entryHash = hashContent(content);
    const scriptHash = hashContent(buildPayload(entryName, entryHash));
    const previousEntry = this.chainManager.getLastEntry();
    const previousHash = previousEntry ? previousEntry.entryHash : hashContent("genesis");

    const { getPackageVersionHash } = await import("../utils/codeHash");
    const codeHash = getPackageVersionHash();

    console.log("\n⛓️  ANCHORING TO BLOCKCHAIN\n");
    console.log(`Logbook: ${this.logbookName}`);
    console.log(`Payer: ${this.anchorService.payerAddress}`);
    console.log(`Entry hash: ${entryHash.slice(0, 16)}...`);
    console.log(`Previous: ${previousHash.slice(0, 16)}...`);
    console.log(`Code version: ${codeHash.slice(0, 16)}...`);

    const result = await this.anchorService.anchorEntry(
      this.logbookName,
      entryName,
      entryHash,
      previousHash,
    );

    const receipt = await this.anchorService["provider"].getTransactionReceipt(result.txHash);

    const chainEntry = this.chainManager.addEntry(
      entryName,
      entryHash,
      result.txHash,
      Math.floor(Date.now() / 1000),
      receipt!.blockNumber,
    );

    this.saveFiles(
      entryName,
      content,
      entryHash,
      scriptHash,
      previousHash,
      result.txHash,
      result.explorerTxUrl,
      chainEntry.merkleRoot,
      codeHash,
    );

    console.log("\n✅ SUCCESS\n");
    console.log(`Transaction: ${result.txHash}`);
    console.log(`Explorer: ${result.explorerTxUrl}`);
    console.log(`Merkle root: ${chainEntry.merkleRoot}`);
    console.log(`\nLog saved to: logbooks/${this.logbookName}/${entryName}/\n`);
  }

  private saveFiles(
    entryName: string,
    content: string,
    entryHash: string,
    scriptHash: string,
    previousHash: string,
    txHash: string,
    explorerUrl: string,
    merkleRoot: string,
    codeHash: string,
  ): void {
    const entryDir = path.join(this.chainManager.getLogbookDir(), entryName);

    if (!fs.existsSync(entryDir)) {
      fs.mkdirSync(entryDir, { recursive: true });
    }

    fs.writeFileSync(path.join(entryDir, "entry.txt"), content, "utf-8");

    const proofLines = [
      "LOGBOOK ANCHOR PROOF",
      "=".repeat(50),
      `Logbook: ${this.logbookName}`,
      `Entry name: ${entryName}`,
      `Entry SHA256: ${entryHash}`,
      `Script SHA256: ${scriptHash}`,
      `Merkle root: ${merkleRoot}`,
      `Previous hash: ${previousHash}`,
      `Code version hash: ${codeHash}`,
      `Transaction: ${txHash}`,
      `Explorer: ${explorerUrl}`,
      "",
      "VERIFICATION STEPS:",
      "1. Verify entry.txt hash matches Entry SHA256",
      "2. Verify code version matches (package.json)",
      "3. Query contract: getAllEntries(wallet, logbookName)",
      "4. Validate chain: validateChain(wallet, logbookName)",
      "5. Check Merkle proof against root in chain.json",
    ];

    fs.writeFileSync(path.join(entryDir, "proof.txt"), proofLines.join("\n"), "utf-8");
  }
}
