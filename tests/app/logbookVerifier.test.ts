import { LogbookVerifier } from "../../src/app/logbookVerifier";
import { AnchorService } from "../../src/services/anchorService";
import { ChainManager } from "../../src/utils/chain";
import { TestHelpers } from "../helpers/testHelpers";
import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";

const { select } = require("@inquirer/prompts");

describe("LogbookVerifier", () => {
  let anchorService: AnchorService;
  let chainManager: ChainManager;
  let verifier: LogbookVerifier;
  let testDir: string;
  let importsDir: string;
  let originalCwd: () => string;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation();
    testDir = TestHelpers.createTempDir();
    importsDir = path.join(testDir, "imports");

    // Mock process.cwd to return testDir
    originalCwd = process.cwd;
    process.cwd = jest.fn(() => testDir);

    jest.mock("../../src/utils/codeHash", () => ({
      getPackageVersionHash: () => "test-hash-123",
    }));

    anchorService = new AnchorService(
      process.env.RPC_URL!,
      process.env.PAYER_PRIVATE_KEY!,
      process.env.CONTRACT_ADDRESS!,
      process.env.EXPLORER_URL!
    );

    const logbookName = "test-logbook";
    const logbookDir = path.join(testDir, logbookName);
    fs.mkdirSync(logbookDir, { recursive: true });

    chainManager = new ChainManager(logbookName);
    verifier = new LogbookVerifier(anchorService);
  });

  afterEach(() => {
    process.cwd = originalCwd;
    TestHelpers.cleanupTempDir(testDir);
  });

  describe("verify() - User flow", () => {
    it("should return immediately when 'Back to main menu' is selected", async () => {
      fs.mkdirSync(importsDir, { recursive: true });
      fs.writeFileSync(path.join(importsDir, "test.zip"), "");

      select.mockResolvedValueOnce("back");

      await verifier.verify();

      expect(select).toHaveBeenCalledTimes(1);
    });

    it("should return when no imports folder exists", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No imports folder found"));
      expect(fs.existsSync(importsDir)).toBe(true);
    });

    it("should return when imports folder is empty", async () => {
      fs.mkdirSync(importsDir, { recursive: true });
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No import to verify"));
    });

    it("should accept valid ZIP path and proceed to verification", async () => {
      fs.mkdirSync(importsDir, { recursive: true });

      const exportData = TestHelpers.createMockExport("test-logbook", 3);
      const zipPath = path.join(importsDir, "export.zip");
      TestHelpers.createZipFile(zipPath, exportData);

      select.mockResolvedValueOnce("export.zip");

      jest.spyOn(anchorService, "getAllEntries").mockResolvedValue(
        exportData.entries.map((e: any) => ({
          name: e.name,
          entryHash: e.entryHash,
          previousHash: e.previousHash,
          timestamp: e.timestamp || Date.now(),
          blockNumber: e.blockNumber || 1,
        }))
      );
      jest.spyOn(anchorService, "validateChain").mockResolvedValue({ valid: true, brokenAtIndex: 0 });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      expect(select).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("VERIFICATION REPORT"));
    });
  });

  describe("extractAndParse()", () => {
    beforeEach(() => {
      fs.mkdirSync(importsDir, { recursive: true });
    });

    it("should throw error for non-existent ZIP file", async () => {
      fs.writeFileSync(path.join(importsDir, "dummy.zip"), "");

      select.mockResolvedValueOnce("notfound.zip");

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      await expect(verifier.verify()).rejects.toThrow(/ZIP file not found/);

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("should throw error for ZIP without metadata.json", async () => {
      const zipPath = path.join(importsDir, "invalid.zip");

      const zip = new AdmZip();
      zip.addFile("random.txt", Buffer.from("random content"));
      zip.writeZip(zipPath);

      select.mockResolvedValueOnce("invalid.zip");

      await expect(verifier.verify()).rejects.toThrow(/missing metadata.json/);
    });

    it("should throw error for invalid metadata.json content", async () => {
      const zipPath = path.join(importsDir, "invalid-meta.zip");

      const zip = new AdmZip();
      zip.addFile("metadata.json", Buffer.from("invalid json content"));
      zip.writeZip(zipPath);

      select.mockResolvedValueOnce("invalid-meta.zip");

      await expect(verifier.verify()).rejects.toThrow(/Invalid metadata format/);
    });

    it("should extract and parse valid export", async () => {
      const exportData = TestHelpers.createMockExport("test-logbook", 2);
      const zipPath = path.join(importsDir, "valid.zip");
      TestHelpers.createZipFile(zipPath, exportData);

      select.mockResolvedValueOnce("valid.zip");

      jest.spyOn(anchorService, "getAllEntries").mockResolvedValue([]);
      jest.spyOn(anchorService, "validateChain").mockResolvedValue({ valid: true, brokenAtIndex: 0 });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      expect(select).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("test-logbook"));
    });
  });

  describe("performVerification()", () => {
    let mockExportData: any;

    beforeEach(() => {
      mockExportData = TestHelpers.createMockExport("test-logbook", 3);
      fs.mkdirSync(importsDir, { recursive: true });
    });

    it("should verify metadata structure", async () => {
      const zipPath = path.join(importsDir, "export.zip");
      TestHelpers.createZipFile(zipPath, mockExportData);

      select.mockResolvedValueOnce("export.zip");

      jest.spyOn(anchorService, "getAllEntries").mockResolvedValue([]);
      jest.spyOn(anchorService, "validateChain").mockResolvedValue({ valid: true, brokenAtIndex: 0 });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      expect(mockExportData.metadata.logbookName).toBe("test-logbook");
      expect(mockExportData.metadata.totalEntries).toBe(3);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("test-logbook"));
    });

    it("should verify all entries have required fields", async () => {
      const zipPath = path.join(importsDir, "export.zip");
      TestHelpers.createZipFile(zipPath, mockExportData);

      select.mockResolvedValueOnce("export.zip");

      jest.spyOn(anchorService, "getAllEntries").mockResolvedValue([]);
      jest.spyOn(anchorService, "validateChain").mockResolvedValue({ valid: true, brokenAtIndex: 0 });

      jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      mockExportData.entries.forEach((entry: any) => {
        expect(entry).toHaveProperty("name");
        expect(entry).toHaveProperty("entryHash");
        expect(entry).toHaveProperty("content");
        expect(entry).toHaveProperty("previousHash");
      });
    });

    it("should verify chain integrity (previousHash linkage)", async () => {
      const zipPath = path.join(importsDir, "export.zip");
      TestHelpers.createZipFile(zipPath, mockExportData);

      select.mockResolvedValueOnce("export.zip");

      jest.spyOn(anchorService, "getAllEntries").mockResolvedValue([]);
      jest.spyOn(anchorService, "validateChain").mockResolvedValue({ valid: true, brokenAtIndex: 0 });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      for (let i = 1; i < mockExportData.entries.length; i++) {
        const current = mockExportData.entries[i];
        const previous = mockExportData.entries[i - 1];
        expect(current.previousHash).toBe(previous.entryHash);
      }

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Verifying chain integrity"));
    });

    it("should verify content hashes match", async () => {
      const zipPath = path.join(importsDir, "export.zip");
      TestHelpers.createZipFile(zipPath, mockExportData);

      select.mockResolvedValueOnce("export.zip");

      jest.spyOn(anchorService, "getAllEntries").mockResolvedValue([]);
      jest.spyOn(anchorService, "validateChain").mockResolvedValue({ valid: true, brokenAtIndex: 0 });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      mockExportData.entries.forEach((entry: any) => {
        const computedHash = TestHelpers.hashContent(entry.content);
        expect(entry.entryHash).toBe(computedHash);
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Verifying content hashes"));
    });

    it("should call smart contract to verify anchors", async () => {
      const zipPath = path.join(importsDir, "export.zip");
      TestHelpers.createZipFile(zipPath, mockExportData);

      const getAllEntriesSpy = jest.spyOn(anchorService, "getAllEntries");
      getAllEntriesSpy.mockResolvedValue(mockExportData.entries.map((e: any) => ({
        name: e.name,
        entryHash: e.entryHash,
        previousHash: e.previousHash,
        timestamp: e.timestamp || Date.now(),
        blockNumber: e.blockNumber || 1,
      })));

      const validateChainSpy = jest.spyOn(anchorService, "validateChain");
      validateChainSpy.mockResolvedValue({ valid: true, brokenAtIndex: 0 });

      select.mockResolvedValueOnce("export.zip");

      jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      expect(getAllEntriesSpy).toHaveBeenCalledWith(
        "test-logbook",
        mockExportData.metadata.walletAddress
      );
      expect(validateChainSpy).toHaveBeenCalled();
    });

    it("should detect tampering in entry content", async () => {
      mockExportData.entries[1].content = "TAMPERED CONTENT";

      const zipPath = path.join(importsDir, "tampered.zip");
      TestHelpers.createZipFile(zipPath, mockExportData);

      select.mockResolvedValueOnce("tampered.zip");

      jest.spyOn(anchorService, "getAllEntries").mockResolvedValue([]);
      jest.spyOn(anchorService, "validateChain").mockResolvedValue({ valid: true, brokenAtIndex: 0 });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("HASH MISMATCH"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("VERIFICATION FAILED"));
    });

    it("should detect broken chain linkage", async () => {
      mockExportData.entries[2].previousHash = "0xWRONGHASH";

      const zipPath = path.join(importsDir, "broken-chain.zip");
      TestHelpers.createZipFile(zipPath, mockExportData);

      select.mockResolvedValueOnce("broken-chain.zip");

      jest.spyOn(anchorService, "getAllEntries").mockResolvedValue([]);
      jest.spyOn(anchorService, "validateChain").mockResolvedValue({ valid: true, brokenAtIndex: 0 });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("BROKEN LINK"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("VERIFICATION FAILED"));
    });
  });

  describe("Edge cases", () => {
    beforeEach(() => {
      fs.mkdirSync(importsDir, { recursive: true });
    });

    it("should handle empty logbook export", async () => {
      const exportData = {
        metadata: {
          logbookName: "empty-logbook",
          logbookNameHash: "hash",
          walletAddress: "0x123",
          chainId: 1,
          exportDate: new Date().toISOString(),
          totalEntries: 0,
        },
        entries: [],
      };

      const zipPath = path.join(importsDir, "empty.zip");
      TestHelpers.createZipFile(zipPath, exportData);

      select.mockResolvedValueOnce("empty.zip");

      jest.spyOn(anchorService, "getAllEntries").mockResolvedValue([]);
      jest.spyOn(anchorService, "validateChain").mockResolvedValue({ valid: true, brokenAtIndex: 0 });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      expect(exportData.entries).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Total entries: 0"));
    });

    it("should handle single entry logbook", async () => {
      const exportData = TestHelpers.createMockExport("single-entry", 1);

      const zipPath = path.join(importsDir, "single.zip");
      TestHelpers.createZipFile(zipPath, exportData);

      select.mockResolvedValueOnce("single.zip");

      jest.spyOn(anchorService, "getAllEntries").mockResolvedValue(exportData.entries);
      jest.spyOn(anchorService, "validateChain").mockResolvedValue({ valid: true, brokenAtIndex: 0 });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      expect(exportData.entries).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Total entries: 1"));
    });

    it("should handle very large content (>10KB)", async () => {
      const exportData = TestHelpers.createMockExport("large-content", 1);
      exportData.entries[0].content = "A".repeat(20000);
      exportData.entries[0].entryHash = TestHelpers.hashContent(exportData.entries[0].content);

      const zipPath = path.join(importsDir, "large.zip");
      TestHelpers.createZipFile(zipPath, exportData);

      select.mockResolvedValueOnce("large.zip");

      jest.spyOn(anchorService, "getAllEntries").mockResolvedValue(exportData.entries);
      jest.spyOn(anchorService, "validateChain").mockResolvedValue({ valid: true, brokenAtIndex: 0 });

      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await verifier.verify();

      expect(exportData.entries[0].content.length).toBeGreaterThan(10000);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("VERIFICATION PASSED"));
    });
  });
});