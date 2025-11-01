import { ChainManager } from "../src/utils/chain";
import { hashContent } from "../src/utils/hash";
import { TestHelpers } from "./helpers/testHelpers";
import * as fs from "fs";
import * as path from "path";

describe("ChainManager", () => {
  let chainManager: ChainManager;
  let testDir: string;
  let logbookName: string;

  beforeEach(() => {
    testDir = TestHelpers.createTempDir();
    process.env.LOGBOOK_ROOT = testDir;
    logbookName = "test-logbook";

    const logbookDir = path.join(testDir, logbookName);
    fs.mkdirSync(logbookDir, { recursive: true });

    chainManager = new ChainManager(logbookName);
  });

  afterEach(() => {
    TestHelpers.cleanupTempDir(testDir);
  });

  describe("Constructor", () => {
    it("should initialize with valid logbook name", () => {
      expect(chainManager).toBeInstanceOf(ChainManager);
    });

    it("should create chain.json if it doesn't exist", () => {
      const chainPath = path.join(testDir, logbookName, "chain.json");
      expect(fs.existsSync(chainPath)).toBe(true);
    });

    it("should initialize with empty entries array", () => {
      const entries = chainManager.getEntries();
      expect(entries).toHaveLength(0);
    });

    it("should load existing chain.json", () => {
      TestHelpers.createMockChain(chainManager, 3);

      const newManager = new ChainManager(logbookName);
      const entries = newManager.getEntries();

      expect(entries).toHaveLength(3);
    });

    it("should throw error for invalid logbook name", () => {
      expect(() => {
        new ChainManager("");
      }).toThrow();
    });
  });

  describe("addEntry()", () => {
    it("should add new entry to chain", () => {
      const entryName = "entry";
      const entryHash = "0xabcdef1234567890";
      const txHash = "0x" + "a".repeat(64);
      const timestamp = Math.floor(Date.now() / 1000);
      const blockNumber = 1000;

      chainManager.addEntry(entryName, entryHash, txHash, timestamp, blockNumber);

      const entries = chainManager.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe(entryName);
    });

    it("should set previousHash to genesis for first entry", () => {
      const entryName = "first-entry";
      const entryHash = hashContent("entryHash");
      const txHash = "0x" + "a".repeat(64);
      const timestamp = Math.floor(Date.now() / 1000);
      const blockNumber = 1000;

      chainManager.addEntry(entryName, entryHash, txHash, timestamp, blockNumber);

      const entries = chainManager.getEntries();
      const genesisHash = hashContent("genesis");

      expect(entries[0].previousHash).toBe(genesisHash);
    });

    it("should link second entry to first entry", () => {
      const hash1 = hashContent("hash1");
      const hash2 = hashContent("hash2");
      const txHash = "0x" + "a".repeat(64);
      const timestamp = Math.floor(Date.now() / 1000);

      chainManager.addEntry("entry-1", hash1, txHash, timestamp, 1000);
      chainManager.addEntry("entry-2", hash2, txHash, timestamp + 10, 1001);

      const entries = chainManager.getEntries();

      expect(entries[1].previousHash).toBe(hash1);
    });

    it("should validate entry hash format", () => {
      expect(() => {
        chainManager.addEntry(
          "entry",
          "invalid-hash",
          "0x" + "d".repeat(64),
          Date.now(),
          1000
        );
      }).toThrow();
    });

    it("should validate transaction hash format", () => {
      expect(() => {
        chainManager.addEntry(
          "entry",
          "0xvalidhash",
          "invalid-tx",
          Date.now(),
          1000
        );
      }).toThrow();
    });

    it("should validate timestamp is positive", () => {
      expect(() => {
        chainManager.addEntry(
          "entry",
          "0xhash",
          "0x" + "e".repeat(64),
          -1,
          1000
        );
      }).toThrow();
    });

    it("should validate block number is positive", () => {
      expect(() => {
        chainManager.addEntry(
          "entry",
          "0xhash",
          "0x" + "f".repeat(64),
          Date.now(),
          -1
        );
      }).toThrow();
    });
  });

  describe("getLastEntry()", () => {
    it("should return null for empty chain", () => {
      const lastEntry = chainManager.getLastEntry();
      expect(lastEntry).toBeNull();
    });

    it("should return last entry for chain with one entry", () => {
      TestHelpers.createMockChain(chainManager, 1);

      const lastEntry = chainManager.getLastEntry();

      expect(lastEntry).not.toBeNull();
      expect(lastEntry!.name).toMatch(/entry-0/);
    });

    it("should return last entry for chain with multiple entries", () => {
      TestHelpers.createMockChain(chainManager, 5);

      const lastEntry = chainManager.getLastEntry();

      expect(lastEntry).not.toBeNull();
      expect(lastEntry!.name).toMatch(/entry-4/);
    });
  });

  describe("getEntries()", () => {
    it("should return empty array for new chain", () => {
      const entries = chainManager.getEntries();
      expect(entries).toEqual([]);
    });

    it("should return all entries in order", () => {
      TestHelpers.createMockChain(chainManager, 5);

      const entries = chainManager.getEntries();

      expect(entries).toHaveLength(5);
      entries.forEach((entry, index) => {
        expect(entry.name).toMatch(new RegExp(`entry-${index}`));
      });
    });

    it("should return shallow copy of entries", () => {
      TestHelpers.createMockChain(chainManager, 2);

      const entries1 = chainManager.getEntries();
      const entries2 = chainManager.getEntries();

      expect(entries1).not.toBe(entries2);
      expect(entries1).toEqual(entries2);
    });
  });

  describe("validateChain()", () => {
    it("should validate empty chain", () => {
      const validation = chainManager.validateChain();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should validate chain with single entry", () => {
      TestHelpers.createMockChain(chainManager, 1);

      const validation = chainManager.validateChain();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should validate chain with multiple entries", () => {
      TestHelpers.createMockChain(chainManager, 5);

      const validation = chainManager.validateChain();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should detect broken chain linkage", () => {
      TestHelpers.createMockChain(chainManager, 3);

      const entries = chainManager.getEntries();
      entries[2].previousHash = "0xWRONGHASH";

      const chainPath = path.join(testDir, logbookName, "chain.json");
      fs.writeFileSync(
        chainPath,
        JSON.stringify({ logbookName, createdAt: new Date().toISOString(), entries }),
        "utf-8"
      );

      const newManager = new ChainManager(logbookName);
      const validation = newManager.validateChain();

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it("should detect invalid content hash", () => {
      TestHelpers.createMockChain(chainManager, 2);

      const entries = chainManager.getEntries();
      const entryDir = path.join(testDir, logbookName, entries[0].name);
      fs.writeFileSync(path.join(entryDir, "entry.txt"), "TAMPERED CONTENT", "utf-8");

      const validation = chainManager.validateChain();

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes("hash mismatch"))).toBe(true);
    });

    it("should detect missing entry file", () => {
      TestHelpers.createMockChain(chainManager, 2);

      const entries = chainManager.getEntries();
      const entryPath = path.join(
        testDir,
        logbookName,
        entries[0].name,
        "entry.txt"
      );
      fs.unlinkSync(entryPath);

      const validation = chainManager.validateChain();

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes("not found"))).toBe(true);
    });

    it("should validate genesis previousHash for first entry", () => {
      TestHelpers.createMockChain(chainManager, 1);

      const entries = chainManager.getEntries();
      const genesisHash = hashContent("genesis");

      expect(entries[0].previousHash).toBe(genesisHash);

      const validation = chainManager.validateChain();
      expect(validation.valid).toBe(true);
    });
  });

  describe("getLogbookDir()", () => {
    it("should return correct logbook directory path", () => {
      const expectedPath = path.join(testDir, logbookName);
      const actualPath = chainManager.getLogbookDir();

      expect(actualPath).toBe(expectedPath);
    });

    it("should return existing directory", () => {
      const logbookDir = chainManager.getLogbookDir();

      expect(fs.existsSync(logbookDir)).toBe(true);
      expect(fs.statSync(logbookDir).isDirectory()).toBe(true);
    });
  });

  describe("File system integration", () => {
    it("should handle concurrent writes", () => {
      const promises = Array.from({ length: 5 }, (_, i) => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            const entryName = `concurrent-${i}`;
            const entryHash = TestHelpers.hashContent(`content-${i}`);
            const txHash = "0x" + i.toString().repeat(64).slice(0, 64);
            const timestamp = Math.floor(Date.now() / 1000) + i;
            const blockNumber = 1000 + i;

            chainManager.addEntry(entryName, entryHash, txHash, timestamp, blockNumber);
            resolve();
          }, Math.random() * 100);
        });
      });

      return Promise.all(promises).then(() => {
        const entries = chainManager.getEntries();
        expect(entries).toHaveLength(5);
      });
    });

    it("should recover from corrupted chain.json", () => {
      const chainPath = path.join(testDir, logbookName, "chain.json");
      fs.writeFileSync(chainPath, "invalid json", "utf-8");

      expect(() => {
        new ChainManager(logbookName);
      }).toThrow();
    });

    it("should handle read-only file system", () => {
      TestHelpers.createMockChain(chainManager, 1);

      const logbookDir = chainManager.getLogbookDir();
      const originalMode = fs.statSync(logbookDir).mode;

      try {
        fs.chmodSync(logbookDir, 0o444);

        expect(() => {
          chainManager.addEntry(
            "readonly-entry",
            "0xhash",
            "0x" + "a".repeat(64),
            Date.now(),
            1000
          );
        }).toThrow();
      } finally {
        try {
          fs.chmodSync(logbookDir, originalMode);
        } catch (e) {
          fs.chmodSync(logbookDir, 0o755);
        }
      }
    });
  });

  describe("Large-scale operations", () => {
    it("should handle 100 entries efficiently", () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        const entryHash = TestHelpers.hashContent(`content-${i}`);
        chainManager.addEntry(
          `entry-${i}`,
          entryHash,
          "0x" + i.toString().padStart(64, "0"),
          Math.floor(Date.now() / 1000) + i,
          1000 + i
        );
      }

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
      expect(chainManager.getEntries()).toHaveLength(100);
    });

    it("should validate large chain efficiently", () => {
      TestHelpers.createMockChain(chainManager, 100);

      const startTime = Date.now();
      const validation = chainManager.validateChain();
      const duration = Date.now() - startTime;

      expect(validation.valid).toBe(true);
      expect(duration).toBeLessThan(3000);
    });
  });

  describe("Edge cases", () => {
    it("should handle entry names with special characters", () => {
      const specialName = "entry-with_underscores-and-dashes";
      const entryHash = TestHelpers.hashContent("content");
      const txHash = "0x" + "a".repeat(64);
      const timestamp = Math.floor(Date.now() / 1000);

      chainManager.addEntry(specialName, entryHash, txHash, timestamp, 1000);

      const entries = chainManager.getEntries();
      const entry = entries.find(e => e.name === specialName);
      expect(entry).not.toBeNull();
      expect(entry!.name).toBe(specialName);
    });

    it("should handle very long entry names", () => {
      const longName = "a".repeat(255);
      const entryHash = TestHelpers.hashContent("content");
      const txHash = "0x" + "b".repeat(64);
      const timestamp = Math.floor(Date.now() / 1000);

      chainManager.addEntry(longName, entryHash, txHash, timestamp, 1000);

      const entries = chainManager.getEntries();
      const entry = entries.find(e => e.name === longName);
      expect(entry).not.toBeNull();
    });

    it("should handle timestamps at boundaries", () => {
      const timestamps = [0, 1, Date.now(), Number.MAX_SAFE_INTEGER];

      timestamps.forEach((ts, i) => {
        chainManager.addEntry(
          `entry-${i}`,
          TestHelpers.hashContent(`content-${i}`),
          "0x" + i.toString().padStart(64, "0"),
          ts,
          1000 + i
        );
      });

      expect(chainManager.getEntries()).toHaveLength(timestamps.length);
    });
  });
});
