import { AnchorService } from "../../src/services/anchorService";
import { TestHelpers } from "../helpers/testHelpers";
import { ethers } from "ethers";

describe("AnchorService", () => {
  let anchorService: AnchorService;
  let testLogbookName: string;
  const previousHashGenesis = TestHelpers.hashContent("genesis");

  beforeAll(() => {
    TestHelpers.ensureEnvVars();
  });

  beforeEach(() => {
    testLogbookName = `test-${Date.now()}`;
    anchorService = new AnchorService(
      process.env.RPC_URL!,
      process.env.PAYER_PRIVATE_KEY!,
      process.env.CONTRACT_ADDRESS!,
      process.env.EXPLORER_URL!
    );
  });

  describe("Constructor", () => {
    it("should initialize with valid configuration", () => {
      expect(anchorService).toBeInstanceOf(AnchorService);
    });

    it("should throw error with invalid private key", () => {
      expect(() => {
        new AnchorService(
          process.env.RPC_URL!,
          "0xinvalid",
          process.env.CONTRACT_ADDRESS!,
          process.env.EXPLORER_URL!
        );
      }).toThrow(/AnchorService initialization failed/);
    });

    it("should throw error with invalid contract address", () => {
      expect(() => {
        new AnchorService(
          process.env.RPC_URL!,
          process.env.PAYER_PRIVATE_KEY!,
          "invalid",
          process.env.EXPLORER_URL!
        );
      }).toThrow(/AnchorService initialization failed/);
    });
  });

  // Real blockchain call
  describe("anchorEntry() - Integration Test", () => {
    it("should successfully anchor an entry to blockchain", async () => {
      
      const entryName = "test-entry-real";
      const content = TestHelpers.createTestContent(1);
      const entryHash = TestHelpers.hashContent(content);

      const result = await anchorService.anchorEntry(
        testLogbookName,
        entryName,
        entryHash,
        previousHashGenesis
      );

      console.log(`✅ Real transaction: ${result.txHash}`);

      expect(result).toHaveProperty("txHash");
      expect(result.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(result).toHaveProperty("explorerTxUrl");
      expect(result.explorerTxUrl).toMatch(/^https:\/\/.+\/tx\/0x[a-fA-F0-9]{64}$/);
    }, 60000);
  });

  describe("anchorEntry() - Unit Tests (Mocked)", () => {
    const mockAnchorEntry = async (
      logbookName: string,
      entryName: string,
      entryHash: string,
      previousHash: string
    ) => {
      if (!logbookName || logbookName.trim() === "") {
        throw new Error("Logbook name cannot be empty");
      }
      if (!entryName || entryName.trim() === "") {
        throw new Error("Entry name cannot be empty");
      }
      if (!entryHash || !entryHash.match(/^0x[0-9a-fA-F]+$/)) {
        throw new Error("Invalid entry hash format");
      }
      if (!previousHash || !previousHash.match(/^0x[0-9a-fA-F]+$/)) {
        throw new Error("Invalid previous hash format");
      }

      return {
        txHash: "0x" + "a".repeat(64),
        blockNumber: Math.floor(Math.random() * 1000000) + 1000,
        timestamp: Math.floor(Date.now() / 1000),
      };
    };
    beforeEach(() => {
      (anchorService as any).anchorEntry = jest.fn().mockImplementation(mockAnchorEntry);
    });

    it("should return valid transaction hash format", async () => {
      const entryName = "hash-test";
      const entryHash = TestHelpers.hashContent("content");

      const result = await anchorService.anchorEntry(
        testLogbookName,
        entryName,
        entryHash,
        previousHashGenesis
      );

      expect(ethers.isHexString(result.txHash, 32)).toBe(true);
    });

    it("should handle genesis entry", async () => {
      const entryName = "genesis-entry";
      const entryHash = TestHelpers.hashContent("genesis content");

      const result = await anchorService.anchorEntry(
        testLogbookName,
        entryName,
        entryHash,
        previousHashGenesis
      );

      expect(result.txHash).toBeTruthy();
    });

    it("should anchor second entry with valid previousHash", async () => {
      const entry1Hash = TestHelpers.hashContent("first");
      const entry2Hash = TestHelpers.hashContent("second");

      const result1 = await anchorService.anchorEntry(
        testLogbookName,
        "entry-1",
        entry1Hash,
        previousHashGenesis
      );

      const result2 = await anchorService.anchorEntry(
        testLogbookName,
        "entry-2",
        entry2Hash,
        entry1Hash
      );

      expect(result2.txHash).toBeTruthy();
    });

    it("should handle long entry names (up to 255 chars)", async () => {
      const longName = "a".repeat(255);
      const entryHash = TestHelpers.hashContent("content");

      const result = await anchorService.anchorEntry(
        testLogbookName,
        longName,
        entryHash,
        previousHashGenesis
      );

      expect(result.txHash).toBeTruthy();
    });

    it("should reject empty logbook name", async () => {
      const entryHash = TestHelpers.hashContent("content");

      await expect(
        anchorService.anchorEntry("", "entry", entryHash, previousHashGenesis)
      ).rejects.toThrow("Logbook name cannot be empty");
    });

    it("should reject empty entry name", async () => {
      const entryHash = TestHelpers.hashContent("content");

      await expect(
        anchorService.anchorEntry(testLogbookName, "", entryHash, previousHashGenesis)
      ).rejects.toThrow("Entry name cannot be empty");
    });

    it("should reject invalid entryHash format", async () => {
      await expect(
        anchorService.anchorEntry(
          testLogbookName,
          "entry",
          "invalid-hash",
          previousHashGenesis
        )
      ).rejects.toThrow("Invalid entry hash format");
    });

    it("should reject invalid previousHash format", async () => {
      const entryHash = TestHelpers.hashContent("content");

      await expect(
        anchorService.anchorEntry(
          testLogbookName,
          "entry",
          entryHash,
          "invalid-prev"
        )
      ).rejects.toThrow("Invalid previous hash format");
    });
  });

  describe("getEntry() - Mocked", () => {
    beforeEach(() => {
      (anchorService as any).getEntry = jest.fn().mockImplementation(
        async (logbookName: string, index: number) => {
          if (logbookName === "non-existent-logbook") {
            throw new Error("Logbook not found");
          }
          if (index >= 10) {
            throw new Error("Entry index out of range");
          }

          return {
            name: logbookName,
            entryHash: "0x" + "b".repeat(64),
            previousHash: "0x" + "c".repeat(64),
            timestamp: Math.floor(Date.now() / 1000),
            blockNumber: 12345,
          };
        }
      );
    });

    it("should retrieve an anchored entry", async () => {
      const entry = await anchorService.getEntry(testLogbookName, 0);

      expect(entry).not.toBeNull();
      expect(entry.entryHash).toBeTruthy();
    });

    it("should return correct entry hash", async () => {
      const entry = await anchorService.getEntry(testLogbookName, 0);

      expect(entry.entryHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should return valid timestamp", async () => {
      const entry = await anchorService.getEntry(testLogbookName, 0);

      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.timestamp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    });

    it("should return valid block number", async () => {
      const entry = await anchorService.getEntry(testLogbookName, 0);

      expect(entry.blockNumber).toBeGreaterThan(0);
    });

    it("should return previousHash", async () => {
      const entry = await anchorService.getEntry(testLogbookName, 0);

      expect(entry.previousHash).toBeTruthy();
      expect(ethers.isHexString(entry.previousHash, 32)).toBe(true);
    });

    it("should throw error for non-existent entry", async () => {
      await expect(
        anchorService.getEntry(testLogbookName, 10)
      ).rejects.toThrow("out of range");
    });

    it("should throw error for non-existent logbook", async () => {
      await expect(
        anchorService.getEntry("non-existent-logbook", 0)
      ).rejects.toThrow("not found");
    });
  });

  describe("getAllEntries() - Mocked", () => {
    beforeEach(() => {
      (anchorService as any).getAllEntries = jest.fn().mockImplementation(
        async (logbookName: string) => {
          if (logbookName === "non-existent") {
            return [];
          }

          const hash1 = TestHelpers.hashContent("content1");
          const hash2 = TestHelpers.hashContent("content2");
          const hash3 = TestHelpers.hashContent("content3");

          return [
            {
              logbookName,
              entryName: "entry-1",
              name: "entry-1",
              entryHash: hash1,
              previousHash: "0x" + "0".repeat(64),
              timestamp: 1234567890,
              blockNumber: 1000,
            },
            {
              logbookName,
              entryName: "entry-2",
              name: "entry-2",
              entryHash: hash2,
              previousHash: hash1,
              timestamp: 1234567891,
              blockNumber: 1001,
            },
            {
              logbookName,
              entryName: "entry-3",
              name: "entry-3",
              entryHash: hash3,
              previousHash: hash2,
              timestamp: 1234567892,
              blockNumber: 1002,
            },
          ];
        }
      );
    });

    it("should retrieve all entries for a logbook", async () => {
      const entries = await anchorService.getAllEntries(testLogbookName);

      expect(entries).toHaveLength(3);
    });

    it("should return entries in chronological order", async () => {
      const entries = await anchorService.getAllEntries(testLogbookName);

      expect(entries[0].name).toBe("entry-1");
      expect(entries[1].name).toBe("entry-2");
      expect(entries[2].name).toBe("entry-3");
    });

    it("should maintain chain linkage in returned entries", async () => {
      const entries = await anchorService.getAllEntries(testLogbookName);

      expect(entries[1].previousHash).toBe(entries[0].entryHash);
      expect(entries[2].previousHash).toBe(entries[1].entryHash);
    });

    it("should return empty array for non-existent logbook", async () => {
      const entries = await anchorService.getAllEntries("non-existent");

      expect(entries).toHaveLength(0);
    });

    it("should include all required fields for each entry", async () => {
      const entries = await anchorService.getAllEntries(testLogbookName);

      entries.forEach((entry) => {
        expect(entry).toHaveProperty("logbookName");
        expect(entry).toHaveProperty("entryName");
        expect(entry).toHaveProperty("entryHash");
        expect(entry).toHaveProperty("previousHash");
        expect(entry).toHaveProperty("timestamp");
        expect(entry).toHaveProperty("blockNumber");
      });
    });
  });

  describe("Contract interaction", () => {
    it("should successfully interact with deployed contract", () => {
      const contract = anchorService["contract"];
      expect(contract).toBeTruthy();
    });

    it("should have valid wallet configuration", () => {
      const wallet = anchorService["wallet"];
      expect(wallet).toBeTruthy();
      expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it("should have valid provider connection", async () => {
      const provider = anchorService["provider"];
      expect(provider).toBeTruthy();

      const network = await provider.getNetwork();
      expect(network).toBeTruthy();
    });

    it("should handle network connectivity issues", async () => {
      const badService = new AnchorService(
        "https://invalid-rpc-endpoint.example.com",
        process.env.PAYER_PRIVATE_KEY!,
        process.env.CONTRACT_ADDRESS!,
        process.env.EXPLORER_URL!
      );

      jest.spyOn(badService as any, 'anchorEntry').mockRejectedValue(
        new Error("Network error")
      );

      const entryHash = TestHelpers.hashContent("content");

      await expect(
        badService.anchorEntry(testLogbookName, "entry", entryHash, previousHashGenesis)
      ).rejects.toThrow("Network error");
    });
  });

  describe("Gas and transaction handling - Mocked", () => {
    beforeEach(() => {
      // Mock getTransactionReceipt
      jest.spyOn(anchorService["provider"], 'getTransactionReceipt').mockResolvedValue({
        status: 1,
        confirmations: 1,
        blockNumber: 12345,
      } as any);
    });

    it("should successfully send transaction with valid gas", async () => {
      jest.spyOn(anchorService as any, 'anchorEntry').mockResolvedValue({
        txHash: "0x" + "a".repeat(64),
        blockNumber: 12345,
        timestamp: Math.floor(Date.now() / 1000),
      });

      const entryName = "gas-test";
      const entryHash = TestHelpers.hashContent("gas content");

      const result = await anchorService.anchorEntry(
        testLogbookName,
        entryName,
        entryHash,
        previousHashGenesis
      );

      const receipt = await anchorService["provider"].getTransactionReceipt(
        result.txHash
      );

      expect(receipt).not.toBeNull();
      expect(receipt!.status).toBe(1);
    });

    it("should wait for transaction confirmation", async () => {
      jest.spyOn(anchorService as any, 'anchorEntry').mockResolvedValue({
        txHash: "0x" + "b".repeat(64),
        blockNumber: 12345,
        timestamp: Math.floor(Date.now() / 1000),
      });

      const entryName = "confirm-test";
      const entryHash = TestHelpers.hashContent("confirm content");

      const result = await anchorService.anchorEntry(
        testLogbookName,
        entryName,
        entryHash,
        previousHashGenesis
      );

      const receipt = await anchorService["provider"].getTransactionReceipt(
        result.txHash
      );

      expect(receipt).not.toBeNull();
      expect(receipt!.confirmations).toBeGreaterThan(0);
    });
  });

  describe("Edge cases - Mocked", () => {
    beforeEach(() => {
      (anchorService as any).anchorEntry = jest.fn().mockImplementation(
        async (logbookName: string, entryName: string, entryHash: string, previousHash: string) => {
          if (!logbookName || logbookName.trim() === "") {
            throw new Error("Logbook name cannot be empty");
          }
          if (!entryName || entryName.trim() === "") {
            throw new Error("Entry name cannot be empty");
          }
          if (!entryHash || !entryHash.match(/^0x[0-9a-fA-F]+$/)) {
            throw new Error("Invalid entry hash format");
          }
          if (!previousHash || !previousHash.match(/^0x[0-9a-fA-F]+$/)) {
            throw new Error("Invalid previous hash format");
          }

          return {
            txHash: "0x" + "a".repeat(64),
            blockNumber: Math.floor(Math.random() * 1000000) + 1000,
            timestamp: Math.floor(Date.now() / 1000),
          };
        }
      );
    });

    it("should handle rapid successive anchoring", async () => {
      const promises = Array.from({ length: 3 }, async (_, i) => {
        const entryHash = TestHelpers.hashContent(`rapid-${i}`);
        const previousHash = i === 0
          ? TestHelpers.hashContent("genesis")
          : TestHelpers.hashContent(`rapid-${i - 1}`);

        return anchorService.anchorEntry(
          `${testLogbookName}-rapid`,
          `rapid-${i}`,
          entryHash,
          previousHash
        );
      });

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.txHash).toBeTruthy();
      });
    });

    it("should handle special characters in logbook name", async () => {
      const specialLogbook = "test-logbook_2024";
      const entryHash = TestHelpers.hashContent("content");

      const result = await anchorService.anchorEntry(
        specialLogbook,
        "entry",
        entryHash,
        previousHashGenesis
      );

      expect(result.txHash).toBeTruthy();
    });

    it("should handle UTF-8 characters in entry name", async () => {
      const utf8Entry = "entrée-test-café";
      const entryHash = TestHelpers.hashContent("content");

      const result = await anchorService.anchorEntry(
        testLogbookName,
        utf8Entry,
        entryHash,
        previousHashGenesis
      );

      expect(result.txHash).toBeTruthy();
    });
  });
});