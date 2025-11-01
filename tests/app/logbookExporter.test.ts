import { LogbookExporter } from "../../src/app/logbookExporter";
import { ChainManager } from "../../src/utils/chain";
import { TestHelpers } from "../helpers/testHelpers";
import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";

const { confirm } = require("@inquirer/prompts");

describe("LogbookExporter", () => {
  let chainManager: ChainManager;
  let exporter: LogbookExporter;
  let testDir: string;
  let logbookName: string;

  beforeEach(() => {
    jest.clearAllMocks();
    testDir = TestHelpers.createTempDir();
    process.env.LOGBOOK_ROOT = testDir;
    logbookName = "test-logbook";

    const logbookDir = path.join(testDir, logbookName);
    fs.mkdirSync(logbookDir, { recursive: true });

    chainManager = new ChainManager(logbookName);
    exporter = new LogbookExporter(
      chainManager,
      logbookName,
      "0xTestWallet",
      Number(process.env.CHAIN_ID!),
      testDir
    );
  });

  afterEach(() => {
    TestHelpers.cleanupTempDir(testDir);
  });

  describe("export() - Main flow", () => {
    beforeEach(() => {
      TestHelpers.createMockChain(chainManager, 3);
    });

    it("should cancel export when user declines confirmation", async () => {
      confirm.mockResolvedValueOnce(false);

      const result = await exporter.export();

      expect(result).toBeUndefined();
      expect(confirm).toHaveBeenCalledTimes(1);

      const exportsDir = path.join(testDir, "exports");
      expect(fs.existsSync(exportsDir)).toBe(false);
    });

    it("should create export when user confirms", async () => {
      confirm.mockResolvedValueOnce(true);

      await exporter.export();

      expect(confirm).toHaveBeenCalledTimes(1);

      const exportsDir = path.join(testDir, "exports");
      expect(fs.existsSync(exportsDir)).toBe(true);

      const files = fs.readdirSync(exportsDir);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^test-logbook_\d{8}_\d{6}\.zip$/);
    });

    it("should create exports directory if it doesn't exist", async () => {
      confirm.mockResolvedValueOnce(true);

      const exportsDir = path.join(testDir, "exports");
      expect(fs.existsSync(exportsDir)).toBe(false);

      await exporter.export();

      expect(fs.existsSync(exportsDir)).toBe(true);
    });
  });

  describe("ZIP file structure", () => {
    beforeEach(() => {
      TestHelpers.createMockChain(chainManager, 3);
      confirm.mockResolvedValue(true);
    });

    it("should contain metadata.json", async () => {
      await exporter.export();

      const exportsDir = path.join(testDir, "exports");
      const files = fs.readdirSync(exportsDir);
      const zipPath = path.join(exportsDir, files[0]);

      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();
      const hasMetadata = entries.some(e => e.entryName === "metadata.json");

      expect(hasMetadata).toBe(true);
    });

    it("should contain all entries content", async () => {
      await exporter.export();

      const exportsDir = path.join(testDir, "exports");
      const files = fs.readdirSync(exportsDir);
      const zipPath = path.join(exportsDir, files[0]);

      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();

      const contentFiles = entries.filter(e =>
        e.entryName.startsWith("entries/") && e.entryName.endsWith("/entry.txt")
      );

      expect(contentFiles.length).toBe(3);
    });

    it("should have valid metadata structure", async () => {
      await exporter.export();

      const exportsDir = path.join(testDir, "exports");
      const files = fs.readdirSync(exportsDir);
      const zipPath = path.join(exportsDir, files[0]);

      const zip = new AdmZip(zipPath);
      const logbookData = JSON.parse(zip.readAsText("metadata.json"));

      expect(logbookData.metadata).toHaveProperty("logbookName");
      expect(logbookData.metadata).toHaveProperty("exportDate");
      expect(logbookData.metadata).toHaveProperty("totalEntries");
      expect(logbookData.metadata.logbookName).toBe(logbookName);
      expect(logbookData.metadata.totalEntries).toBe(3);
    });

    it("should include all chain data for each entry", async () => {
      await exporter.export();

      const exportsDir = path.join(testDir, "exports");
      const files = fs.readdirSync(exportsDir);
      const zipPath = path.join(exportsDir, files[0]);

      const zip = new AdmZip(zipPath);
      const metadata = JSON.parse(zip.readAsText("metadata.json"));

      metadata.entries.forEach((entry: any) => {
        expect(entry).toHaveProperty("name");
        expect(entry).toHaveProperty("entryHash");
        expect(entry).toHaveProperty("previousHash");
        expect(entry).toHaveProperty("txHash");
        expect(entry).toHaveProperty("timestamp");
        expect(entry).toHaveProperty("blockNumber");
      });
    });

    it("should embed actual content for each entry", async () => {
      await exporter.export();

      const exportsDir = path.join(testDir, "exports");
      const files = fs.readdirSync(exportsDir);
      const zipPath = path.join(exportsDir, files[0]);

      const zip = new AdmZip(zipPath);
      const metadata = JSON.parse(zip.readAsText("metadata.json"));

      metadata.entries.forEach((entry: any, index: number) => {
        expect(entry).toHaveProperty("content");
        expect(entry.content).toContain(`Test entry ${index}`);
      });
    });
  });

  describe("File naming", () => {
    beforeEach(() => {
      TestHelpers.createMockChain(chainManager, 2);
      confirm.mockResolvedValue(true);
    });

    it("should use timestamp format YYYYMMDD_HHMMSS", async () => {
      await exporter.export();

      const exportsDir = path.join(testDir, "exports");
      const files = fs.readdirSync(exportsDir);

      expect(files[0]).toMatch(/^test-logbook_\d{8}_\d{6}\.zip$/);
    });

    it("should create unique filenames for consecutive exports", async () => {
      await exporter.export();
      await TestHelpers.delay(1100);
      await exporter.export();

      const exportsDir = path.join(testDir, "exports");
      const files = fs.readdirSync(exportsDir);

      expect(files.length).toBe(2);
      expect(files[0]).not.toBe(files[1]);
    });
  });

  describe("Content integrity", () => {
    beforeEach(() => {
      TestHelpers.createMockChain(chainManager, 3);
      confirm.mockResolvedValue(true);
    });

    it("should preserve exact content without modification", async () => {
      const entries = chainManager.getEntries();
      const originalContent = entries.map(e => {
        const entryPath = path.join(chainManager.getLogbookDir(), e.name, "entry.txt");
        return fs.readFileSync(entryPath, "utf-8");
      });

      await exporter.export();

      const exportsDir = path.join(testDir, "exports");
      const files = fs.readdirSync(exportsDir);
      const zipPath = path.join(exportsDir, files[0]);

      const zip = new AdmZip(zipPath);
      const metadata = JSON.parse(zip.readAsText("metadata.json"));

      metadata.entries.forEach((entry: any, index: number) => {
        expect(entry.content).toBe(originalContent[index]);
      });
    });

    it("should maintain correct hash for each entry", async () => {
      await exporter.export();

      const exportsDir = path.join(testDir, "exports");
      const files = fs.readdirSync(exportsDir);
      const zipPath = path.join(exportsDir, files[0]);

      const zip = new AdmZip(zipPath);
      const metadata = JSON.parse(zip.readAsText("metadata.json"));

      metadata.entries.forEach((entry: any) => {
        const computedHash = TestHelpers.hashContent(entry.content);
        expect(entry.entryHash).toBe(computedHash);
      });
    });

    it("should preserve chain linkage in export", async () => {
      await exporter.export();

      const exportsDir = path.join(testDir, "exports");
      const files = fs.readdirSync(exportsDir);
      const zipPath = path.join(exportsDir, files[0]);

      const zip = new AdmZip(zipPath);
      const metadata = JSON.parse(zip.readAsText("metadata.json"));

      for (let i = 1; i < metadata.entries.length; i++) {
        const current = metadata.entries[i];
        const previous = metadata.entries[i - 1];
        expect(current.previousHash).toBe(previous.entryHash);
      }
    });
  });

  describe("Large exports", () => {
    it("should handle export with 50 entries", async () => {
      TestHelpers.createMockChain(chainManager, 50);
      confirm.mockResolvedValue(true);

      await exporter.export();

      const exportsDir = path.join(testDir, "exports");
      const files = fs.readdirSync(exportsDir);
      const zipPath = path.join(exportsDir, files[0]);

      const zip = new AdmZip(zipPath);
      const metadata = JSON.parse(zip.readAsText("metadata.json"));

      expect(metadata.entries.length).toBe(50);
    });

    it("should handle large content per entry (>10KB)", async () => {
      TestHelpers.createMockChain(chainManager, 1);

      const entries = chainManager.getEntries();
      const largeContent = "X".repeat(15000);
      const entryPath = path.join(chainManager.getLogbookDir(), entries[0].name, "entry.txt");
      fs.writeFileSync(entryPath, largeContent, "utf-8");

      confirm.mockResolvedValue(true);

      await exporter.export();

      const exportsDir = path.join(testDir, "exports");
      const files = fs.readdirSync(exportsDir);
      const zipPath = path.join(exportsDir, files[0]);

      const zip = new AdmZip(zipPath);
      const metadata = JSON.parse(zip.readAsText("metadata.json"));

      expect(metadata.entries[0].content.length).toBe(15000);
    });
  });

  describe("Error handling", () => {
    it("should handle missing content file gracefully", async () => {
      TestHelpers.createMockChain(chainManager, 2);

      const entries = chainManager.getEntries();
      const entryPath = path.join(chainManager.getLogbookDir(), entries[0].name, "entry.txt");
      fs.unlinkSync(entryPath);

      confirm.mockResolvedValue(true);

      await expect(exporter.export()).rejects.toThrow();
    });
  });
});
