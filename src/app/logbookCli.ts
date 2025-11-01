import { select, input } from "@inquirer/prompts";
import { validateConfig } from "../utils/config";
import { AnchorService } from "../services/anchorService";
import { BlockchainSyncService } from "../services/blockchainSyncService";
import { ChainManager } from "../utils/chain";
import { LogbookCreator } from "./logbookCreator";
import { LogbookExporter } from "./logbookExporter";
import { LogbookVerifier } from "./logbookVerifier";
import { LogbookReconstructor } from "./logbookReconstructor";

/**
 * Interactive CLI for blockchain-anchored logbook management.
 * Provides menu-driven interface for creating, verifying, and managing logbooks.
 */
export class LogbookCli {
  private anchorService!: AnchorService;
  private syncService!: BlockchainSyncService;
  private config!: ReturnType<typeof validateConfig>;
  private currentLogbook: string | null = null;

  /**
   * Application entry point. Initializes services and starts main menu.
   */
  async run(): Promise<void> {
    try {
      this.config = validateConfig();

      this.anchorService = new AnchorService(
        this.config.rpcUrl,
        this.config.payerPrivateKey,
        this.config.contractAddress,
        this.config.explorerUrl,
      );

      this.syncService = new BlockchainSyncService(this.anchorService);

      await this.showWelcome();
      await this.showMainMenu();
    } catch (err: any) {
      console.error("\n❌  Fatal error:", err.message);
      process.exit(1);
    }
  }

  private async showWelcome(): Promise<void> {
    console.clear();
    console.log("\n" + "=".repeat(60));
    console.log("    🔗  LOGBOOK ANCHOR - Onchain-Logbook System       ");
    console.log("=".repeat(60));

    try {
      const balance = await this.anchorService.getBalance();
      console.log(`\nWallet: ${this.anchorService.payerAddress}`);
      console.log(`Balance: ${balance} ETH`);
    } catch (err: any) {
      console.log(`\nWallet: ${this.anchorService.payerAddress}`);
      console.log(`Balance: ⚠️  Unable to fetch (RPC error)`);
      console.log(`Error: ${err.message}`);
    }

    console.log(`Contract: ${this.config.contractAddress}`);
    console.log("=".repeat(60) + "\n");
  }

  private async showMainMenu(): Promise<void> {
    while (true) {
      const choice = await select({
        message: "MAIN MENU",
        choices: [
          { name: "📚  List logbooks", value: "list" },
          { name: "📝  Select/Create logbook", value: "select" },
          { name: "✅  Verify logbook (import)", value: "verify" },
          { name: "🔄  Reconstruct logbook from contract", value: "reconstruct" },
          { name: "👋  Exit", value: "exit" },
        ],
      });

      switch (choice) {
        case "list":
          await this.listLogbooks();
          break;
        case "select":
          await this.selectOrCreateLogbook();
          return;
        case "verify":
          await this.verifyLogbook();
          break;
        case "reconstruct":
          await this.reconstructFromContract();
          break;
        case "exit":
          console.log("\n👋  Goodbye!\n");
          process.exit(0);
      }
    }
  }

  private async showLogbookMenu(): Promise<void> {
    if (!this.currentLogbook) {
      console.log("\n❌  No logbook selected\n");
      return;
    }

    const chainManager = new ChainManager(this.currentLogbook);
    const entries = chainManager.getEntries();
    const count = await this.anchorService.getEntryCount(this.currentLogbook);

    console.log(`\n📚  LOGBOOK: ${this.currentLogbook}`);
    console.log("=".repeat(60));
    console.log(`Local entries: ${entries.length}`);
    console.log(`On-chain entries: ${count}`);
    console.log("=".repeat(60) + "\n");

    while (true) {
      const choice = await select({
        message: "Logbook Operations",
        choices: [
          { name: "➕  Create new entry", value: "create" },
          { name: "📋  List entries", value: "list" },
          { name: "📦  Export logbook", value: "export" },
          { name: "🔍  Validate on-chain", value: "validate" },
          { name: "⬅️  Back to main menu", value: "back" },
        ],
      });

      switch (choice) {
        case "create":
          await this.createEntry();
          break;
        case "list":
          await this.listEntries();
          break;
        case "export":
          await this.exportLogbook();
          break;
        case "validate":
          await this.validateOnChain();
          break;
        case "back":
          this.currentLogbook = null;
          console.clear();
          await this.showWelcome();
          await this.showMainMenu();
          return;
      }
    }
  }

  private async listLogbooks(): Promise<void> {
    const localLogbooks = ChainManager.listLogbooks();
    const onChainLogbooks = await this.anchorService.getLogbookNames();

    const allNames = new Set([...localLogbooks, ...onChainLogbooks]);
    const entryCounts = new Map<string, number>();

    for (const name of allNames) {
      entryCounts.set(name, await this.anchorService.getEntryCount(name));
    }

    const localSet = new Set(localLogbooks);
    const onChainSet = new Set(onChainLogbooks);

    console.log("\n📚  LOCAL LOGBOOKS\n");
    if (localLogbooks.length === 0) {
      console.log("  No local logbooks found\n");
    } else {
      for (const name of localLogbooks) {
        const chainManager = new ChainManager(name);
        const localCount = chainManager.getEntries().length;
        const onChainCount = entryCounts.get(name) || 0;

        const syncStatus = onChainCount === localCount ? "✓" : "⚠️";
        console.log(`  ${syncStatus}  ${name} (${localCount} local, ${onChainCount} on-chain)`);
      }
      console.log("");
    }

    const onlyOnChain = onChainLogbooks.filter((name) => !localSet.has(name));
    if (onlyOnChain.length > 0) {
      console.log("⛓️  ON-CHAIN ONLY\n");
      onlyOnChain.forEach((name) => {
        console.log(`  • ${name} (${entryCounts.get(name)} entries)`);
      });
      console.log("\n  💡  Use 'Reconstruct from contract' to restore locally\n");
    }

    const onlyLocal = localLogbooks.filter((name) => !onChainSet.has(name));
    if (onlyLocal.length > 0) {
      console.log("💾  LOCAL ONLY\n");
      onlyLocal.forEach((name) => {
        console.log(`  • ${name}`);
      });
      console.log("\n  ⚠️  Not anchored on-chain yet\n");
    }

    if (allNames.size === 0) {
      console.log("No logbooks found. Create one to get started!\n");
    }
  }

  private async selectOrCreateLogbook(): Promise<void> {
    const name = await input({
      message: "📚  Logbook name:",
      validate: (value: string) => {
        if (!value.trim()) return "Name cannot be empty";
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
          return "Name: letters, numbers, _ or - only";
        }
        return true;
      },
    });

    const exists = ChainManager.logbookExists(name);
    const count = await this.anchorService.getEntryCount(name);

    if (!exists && count === 0) {
      const confirm = await input({
        message: `⚠️  Logbook doesn't exist. Create a new logbook? (y/n):`,
        validate: (value: string) => {
          const v = value.toLowerCase().trim();
          if (v !== "y" && v !== "n") return "Please enter 'y' or 'n'";
          return true;
        },
      });

      if (confirm.toLowerCase().trim() !== "y") {
        console.log("\n❌  Creation cancelled\n");
        await this.showMainMenu();
        return;
      }

      console.log(`\n✨  Creating new logbook: ${name}`);
      new ChainManager(name);
    } else if (!exists && count > 0) {
      console.log(`\n🔥  Logbook exists on-chain but not locally`);
      console.log(`Use "Reconstruct from contract" to restore it`);
      return;
    } else {
      console.log(`\n✓ Logbook selected: ${name}`);
    }

    this.currentLogbook = name;
    console.clear();
    await this.showWelcome();
    await this.showLogbookMenu();
  }

  private async createEntry(): Promise<void> {
    if (!this.currentLogbook) return;

    const chainManager = new ChainManager(this.currentLogbook);
    const creator = new LogbookCreator(this.anchorService, this.currentLogbook, chainManager);

    await creator.create();
  }

  private async listEntries(): Promise<void> {
    if (!this.currentLogbook) return;

    const chainManager = new ChainManager(this.currentLogbook);
    const entries = chainManager.getEntries();

    if (entries.length === 0) {
      console.log("\n🔭  No entries found\n");
      return;
    }

    console.log("\n📄  ENTRIES\n");
    console.log("=".repeat(60));

    entries.forEach((entry, index) => {
      console.log(`[${index}] ${entry.name}`);
      console.log(`    Hash: ${entry.entryHash}`);
      console.log(`    Tx: ${entry.txHash}`);
      console.log(`    Block: ${entry.blockNumber}`);
      console.log("");
    });

    console.log("=".repeat(60));
  }

  private async exportLogbook(): Promise<void> {
    if (!this.currentLogbook) return;

    const chainManager = new ChainManager(this.currentLogbook);
    const exporter = new LogbookExporter(
      chainManager,
      this.currentLogbook,
      this.anchorService.payerAddress,
      this.config.chainId,
    );

    const zipPath = await exporter.export();
    if (!zipPath) return;
    console.log(`\n✅  Export saved: ${zipPath}\n`);
  }

  private async verifyLogbook(): Promise<void> {
    const verifier = new LogbookVerifier(this.anchorService);
    await verifier.verify();
  }

  private async reconstructFromContract(): Promise<void> {
    const reconstructor = new LogbookReconstructor(this.syncService);
    await reconstructor.reconstruct();
  }

  private async validateOnChain(): Promise<void> {
    if (!this.currentLogbook) return;

    console.log("\n🔍  Validating chain on contract...");

    const result = await this.syncService.validateOnChain(this.currentLogbook);

    console.log("\n" + "=".repeat(60));
    if (!result.valid && result.brokenAtIndex === 0) {
      console.log("\n🔭  No onchain entries found\n");
      return;
    }
    console.log(
      result.valid ? "✅  Chain is VALID" : `❌  Chain BROKEN at index ${result.brokenAtIndex}`,
    );
  }
}
