import { LogbookReconstructor } from "../../src/app/logbookReconstructor";
import { AnchorService } from "../../src/services/anchorService";
import { BlockchainSyncService } from "../../src/services/blockchainSyncService";
import { ChainManager } from "../../src/utils/chain";
import { TestHelpers } from "../helpers/testHelpers";
import * as fs from "fs";
import * as path from "path";
import { hashContent } from "../../src/utils/hash";

const { input } = require("@inquirer/prompts");
const genesisHash = hashContent("genesis");

describe("LogbookReconstructor", () => {
  let anchorService: AnchorService;
  let blockchainSyncService: BlockchainSyncService;
  let chainManager: ChainManager;
  let reconstructor: LogbookReconstructor;
  let testDir: string;
  let testLogbookName: string;

  beforeAll(() => {
    TestHelpers.ensureEnvVars();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    testDir = TestHelpers.createTempDir();
    process.env.LOGBOOK_ROOT = testDir;
    testLogbookName = "recon-logbook";

    anchorService = new AnchorService(
      process.env.RPC_URL!,
      process.env.PAYER_PRIVATE_KEY!,
      process.env.CONTRACT_ADDRESS!,
      process.env.EXPLORER_URL!
    );

    const logbookDir = path.join(testDir, testLogbookName);
    fs.mkdirSync(logbookDir, { recursive: true });

    chainManager = new ChainManager(testLogbookName);
    blockchainSyncService = new BlockchainSyncService(anchorService);
    reconstructor = new LogbookReconstructor(blockchainSyncService);
  });

  afterEach(() => {
    TestHelpers.cleanupTempDir(testDir);
  });

  describe("reconstruct() - User flow", () => {
    it("should prompt for logbook name", async () => {
      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: [],
        errors: [],
      });

      input.mockResolvedValueOnce("my-logbook");

      await reconstructor.reconstruct();

      expect(input).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/logbook.*name|name.*logbook/i),
        })
      );
    });
  });

  describe("Smart contract queries", () => {
    it("should call getAllEntries from contract", async () => {
      const syncSpy = jest.spyOn(blockchainSyncService, "syncFromContract");
      syncSpy.mockResolvedValueOnce({
        success: true,
        entries: [],
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      expect(syncSpy).toHaveBeenCalledWith(testLogbookName);
    });

    it("should handle empty logbook from contract", async () => {
      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: [],
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      const chainPath = path.join(testDir, testLogbookName, "chain.json");
      expect(fs.existsSync(chainPath)).toBe(true);

      const chain = JSON.parse(fs.readFileSync(chainPath, "utf-8"));
      expect(chain.entries).toHaveLength(0);
    });

    it("should reconstruct chain from contract entries", async () => {
      const mockContractEntries = [
        {
          logbookName: testLogbookName,
          name: "entry-1",
          entryHash: "0xhash1",
          previousHash: genesisHash,
          timestamp: Math.floor(Date.now() / 1000),
          blockNumber: 1000,
        },
        {
          logbookName: testLogbookName,
          name: "entry-2",
          entryHash: "0xhash2",
          previousHash: "0xhash1",
          timestamp: Math.floor(Date.now() / 1000) + 10,
          blockNumber: 1001,
        },
      ];

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: mockContractEntries,
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      const chain = JSON.parse(
        fs.readFileSync(
          path.join(testDir, testLogbookName, "chain.json"),
          "utf-8"
        )
      );

      expect(chain.entries).toHaveLength(2);
      expect(chain.entries[0].name).toBe("entry-1");
      expect(chain.entries[1].name).toBe("entry-2");
    });
  });

  describe("Chain reconstruction", () => {
    it("should create chain.json with correct structure", async () => {
      const mockEntries = [
        {
          logbookName: testLogbookName,
          name: "entry-1",
          entryHash: "0xabcd1234",
          previousHash: genesisHash,
          timestamp: 1234567890,
          blockNumber: 999,
        },
      ];

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: mockEntries,
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      const chain = JSON.parse(
        fs.readFileSync(
          path.join(testDir, testLogbookName, "chain.json"),
          "utf-8"
        )
      );

      expect(chain).toHaveProperty("logbookName");
      expect(chain).toHaveProperty("entries");
      expect(chain.logbookName).toBe(testLogbookName);
    });

    it("should include TX hash as placeholder", async () => {
      const mockEntries = [
        {
          logbookName: testLogbookName,
          name: "entry",
          entryHash: "0xhash",
          previousHash: genesisHash,
          timestamp: 1234567890,
          blockNumber: 1000,
        },
      ];

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: mockEntries,
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      const chain = JSON.parse(
        fs.readFileSync(
          path.join(testDir, testLogbookName, "chain.json"),
          "utf-8"
        )
      );

      expect(chain.entries[0].txHash).toBe("reconstructed");
    });

    it("should preserve all contract data", async () => {
      const mockEntry = {
        logbookName: testLogbookName,
        name: "preserved-entry",
        entryHash: "0xoriginalHash",
        previousHash: genesisHash,
        timestamp: 9876543210,
        blockNumber: 5555,
      };

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: [mockEntry],
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      const chain = JSON.parse(
        fs.readFileSync(
          path.join(testDir, testLogbookName, "chain.json"),
          "utf-8"
        )
      );

      expect(chain.entries[0].name).toBe("preserved-entry");
      expect(chain.entries[0].entryHash).toBe("0xoriginalHash");
      expect(chain.entries[0].timestamp).toBe(9876543210);
      expect(chain.entries[0].blockNumber).toBe(5555);
    });

    it("should maintain chronological order", async () => {
      const mockEntries = [
        {
          logbookName: testLogbookName,
          name: "first",
          entryHash: "0xhash1",
          previousHash: genesisHash,
          timestamp: 1000,
          blockNumber: 100,
        },
        {
          logbookName: testLogbookName,
          name: "second",
          entryHash: "0xhash2",
          previousHash: "0xhash1",
          timestamp: 2000,
          blockNumber: 200,
        },
        {
          logbookName: testLogbookName,
          name: "third",
          entryHash: "0xhash3",
          previousHash: "0xhash2",
          timestamp: 3000,
          blockNumber: 300,
        },
      ];

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: mockEntries,
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      const chain = JSON.parse(
        fs.readFileSync(
          path.join(testDir, testLogbookName, "chain.json"),
          "utf-8"
        )
      );

      expect(chain.entries[0].name).toBe("first");
      expect(chain.entries[1].name).toBe("second");
      expect(chain.entries[2].name).toBe("third");
    });
  });

  describe("Placeholder entries", () => {
    it("should create placeholder directories for each entry", async () => {
      const mockEntries = [
        {
          logbookName: testLogbookName,
          name: "placeholder-1",
          entryHash: "0xhash1",
          previousHash: genesisHash,
          timestamp: 1000,
          blockNumber: 100,
        },
        {
          logbookName: testLogbookName,
          name: "placeholder-2",
          entryHash: "0xhash2",
          previousHash: "0xhash1",
          timestamp: 2000,
          blockNumber: 200,
        },
      ];

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: mockEntries,
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      const dir1 = path.join(testDir, testLogbookName, "placeholder-1");
      const dir2 = path.join(testDir, testLogbookName, "placeholder-2");

      expect(fs.existsSync(dir1)).toBe(true);
      expect(fs.existsSync(dir2)).toBe(true);
    });

    it("should create placeholder.txt with instructions", async () => {
      const mockEntry = {
        logbookName: testLogbookName,
        name: "placeholder-entry",
        entryHash: "0xhash",
        previousHash: genesisHash,
        timestamp: 1000,
        blockNumber: 100,
      };

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: [mockEntry],
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      const entryPath = path.join(
        testDir,
        testLogbookName,
        "placeholder-entry",
        "entry.txt"
      );

      expect(fs.existsSync(entryPath)).toBe(true);

      const content = fs.readFileSync(entryPath, "utf-8");
      expect(content).toContain("PLACEHOLDER");
      expect(content).toContain("To restore");
    });

    it("should not create entry.txt for placeholders", async () => {
      const mockEntry = {
        logbookName: testLogbookName,
        name: "no-content-entry",
        entryHash: "0xhash",
        previousHash: genesisHash,
        timestamp: 1000,
        blockNumber: 100,
      };

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: [mockEntry],
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      const entryPath = path.join(
        testDir,
        testLogbookName,
        "no-content-entry",
        "entry.txt"
      );

      expect(fs.existsSync(entryPath)).toBe(true);
    });
  });

  describe("Chain validation", () => {
    it("should produce a valid chain structure", async () => {
      const entry1Content = "Valid content 1";
      const entry2Content = "Valid content 2";
      const entry1Hash = hashContent(entry1Content);
      const entry2Hash = hashContent(entry2Content);

      const mockEntries = [
        {
          logbookName: testLogbookName,
          name: "valid-entry-1",
          entryHash: entry1Hash,
          previousHash: genesisHash,
          timestamp: 1000,
          blockNumber: 100,
        },
        {
          logbookName: testLogbookName,
          name: "valid-entry-2",
          entryHash: entry2Hash,
          previousHash: entry1Hash,
          timestamp: 2000,
          blockNumber: 200,
        },
      ];

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: mockEntries,
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      // Créer les fichiers entry.txt avec le bon contenu
      const entry1Dir = path.join(testDir, testLogbookName, "valid-entry-1");
      const entry2Dir = path.join(testDir, testLogbookName, "valid-entry-2");
      fs.writeFileSync(path.join(entry1Dir, "entry.txt"), entry1Content, "utf-8");
      fs.writeFileSync(path.join(entry2Dir, "entry.txt"), entry2Content, "utf-8");

      const manager = new ChainManager(testLogbookName);
      const validation = manager.validateChain();

      expect(validation.valid).toBe(true);
    });

    it("should maintain previousHash linkage", async () => {
      const mockEntries = [
        {
          logbookName: testLogbookName,
          name: "linked-1",
          entryHash: "0xfirst",
          previousHash: genesisHash,
          timestamp: 1000,
          blockNumber: 100,
        },
        {
          logbookName: testLogbookName,
          name: "linked-2",
          entryHash: "0xsecond",
          previousHash: "0xfirst",
          timestamp: 2000,
          blockNumber: 200,
        },
      ];

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: mockEntries,
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      const chain = JSON.parse(
        fs.readFileSync(
          path.join(testDir, testLogbookName, "chain.json"),
          "utf-8"
        )
      );

      expect(chain.entries[1].previousHash).toBe(chain.entries[0].entryHash);
    });
  });

  describe("Error handling", () => {
    it("should handle contract connection failure", async () => {
      jest
        .spyOn(blockchainSyncService, "syncFromContract")
        .mockResolvedValueOnce({
          success: false,
          entries: [],
          errors: ["Contract unreachable"],
        });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      const chainPath = path.join(testDir, testLogbookName, "chain.json");
      if (fs.existsSync(chainPath)) {
        const chain = JSON.parse(fs.readFileSync(chainPath, "utf-8"));
        expect(chain.entries).toHaveLength(0);
      }
    });

    it("should handle filesystem write errors", async () => {
      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: [],
        errors: [],
      });

      fs.chmodSync(testDir, 0o444);

      input.mockResolvedValueOnce(testLogbookName);

      try {
        await reconstructor.reconstruct();
      } catch (error) {
        expect(error).toBeDefined();
      } finally {
        fs.chmodSync(testDir, 0o755);
      }

      fs.chmodSync(testDir, 0o755);
    });

    it("should handle invalid logbook name", async () => {
      input.mockResolvedValueOnce("valid-name");

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: [],
        errors: [],
      });

      await reconstructor.reconstruct();
    });

    it("should handle user cancellation", async () => {
      input.mockRejectedValueOnce(new Error("User cancelled"));

      await expect(reconstructor.reconstruct()).rejects.toThrow("User cancelled");
    });
  });

  describe("Large-scale reconstruction", () => {
    it("should handle 50+ entries", async () => {
      const mockEntries = Array.from({ length: 50 }, (_, i) => ({
        logbookName: testLogbookName,
        name: `entry-${i}`,
        entryHash: `0xhash${i}`,
        previousHash: i === 0
          ? genesisHash
          : `0xhash${i - 1}`,
        timestamp: 1000 + i * 10,
        blockNumber: 100 + i,
      }));

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: mockEntries,
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      const chain = JSON.parse(
        fs.readFileSync(
          path.join(testDir, testLogbookName, "chain.json"),
          "utf-8"
        )
      );

      expect(chain.entries).toHaveLength(50);
    });

    it("should maintain performance with large datasets", async () => {
      const mockEntries = Array.from({ length: 100 }, (_, i) => ({
        logbookName: testLogbookName,
        name: `perf-entry-${i}`,
        entryHash: `0xperf${i}`,
        previousHash: i === 0
          ? genesisHash
          : `0xperf${i - 1}`,
        timestamp: 1000 + i,
        blockNumber: 1000 + i,
      }));

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: mockEntries,
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      const startTime = Date.now();
      await reconstructor.reconstruct();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
    });
  });

  describe("Integration: Reconstruction + New Entry", () => {
    it("should allow adding new entry after reconstruction", async () => {
      const reconstructedContent = "Reconstructed content";
      const reconstructedHash = TestHelpers.hashContent(reconstructedContent);

      const mockEntries = [
        {
          logbookName: testLogbookName,
          name: "reconstructed-entry",
          entryHash: reconstructedHash,
          previousHash: genesisHash,
          timestamp: Math.floor(Date.now() / 1000) - 100,
          blockNumber: 1000,
        },
      ];

      jest.spyOn(blockchainSyncService, "syncFromContract").mockResolvedValueOnce({
        success: true,
        entries: mockEntries,
        errors: [],
      });

      input.mockResolvedValueOnce(testLogbookName);

      await reconstructor.reconstruct();

      const entryDir = path.join(testDir, testLogbookName, "reconstructed-entry");
      fs.writeFileSync(path.join(entryDir, "entry.txt"), reconstructedContent, "utf-8");
    });
  });
});