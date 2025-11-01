jest.mock("child_process", () => {
  const actual = jest.requireActual("child_process");
  return {
    ...actual,
    spawn: jest.fn(),
  };
});

import { LogbookCreator } from "../../src/app/logbookCreator";
import { AnchorService } from "../../src/services/anchorService";
import { ChainManager } from "../../src/utils/chain";
import { TestHelpers } from "../helpers/testHelpers";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { EventEmitter } from "events";

const { input, confirm } = require("@inquirer/prompts");

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe("LogbookCreator", () => {
  let anchorService: AnchorService;
  let chainManager: ChainManager;
  let creator: LogbookCreator;
  let testDir: string;
  let logbookName: string;

  beforeAll(() => {
    TestHelpers.ensureEnvVars();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();

    testDir = TestHelpers.createTempDir();
    process.env.LOGBOOK_ROOT = testDir;
    logbookName = "test-logbook";

    anchorService = new AnchorService(
      process.env.RPC_URL!,
      process.env.PAYER_PRIVATE_KEY!,
      process.env.CONTRACT_ADDRESS!,
      process.env.EXPLORER_URL!
    );

    const logbookDir = path.join(testDir, logbookName);
    fs.mkdirSync(logbookDir, { recursive: true });

    chainManager = new ChainManager(logbookName);
    creator = new LogbookCreator(anchorService, logbookName, chainManager);

    (global as any).__mockEditorContent = "Default test content";

    jest.spyOn(anchorService, "anchorEntry").mockResolvedValue({
      txHash: "0x" + "a".repeat(64),
      explorerTxUrl: "https://explorer.example.com/tx/0x" + "a".repeat(64)
    });

    // Mock getTransactionReceipt
    jest.spyOn(anchorService["provider"], "getTransactionReceipt").mockResolvedValue({
      blockNumber: 12345,
      blockHash: "0x" + "b".repeat(64),
      transactionHash: "0x" + "a".repeat(64),
    } as any);

    mockSpawn.mockImplementation((cmd: string, args: readonly string[], options?: any) => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.stdin = new EventEmitter();
      mockProcess.kill = jest.fn();
      mockProcess.pid = 12345;

      const tmpFile = args[0];

      // Utiliser Promise.resolve().then() pour l'émission asynchrone
      Promise.resolve().then(() => {
        const content = (global as any).__mockEditorContent || "Default test content";
        fs.writeFileSync(tmpFile, content, 'utf-8');
        mockProcess.emit('exit', 0);
      });

      return mockProcess;
    });
  });

  afterEach(() => {
    TestHelpers.cleanupTempDir(testDir);
    delete (global as any).__mockEditorContent;
    delete (global as any).__mockEditorError;
  });

  const setEditorContent = (content: string) => {
    (global as any).__mockEditorContent = content;
  };

  describe("create() - User flow", () => {
    it("should cancel creation when user declines confirmation", async () => {
      input.mockResolvedValueOnce("test-entry");
      setEditorContent("Test content");
      confirm.mockResolvedValueOnce(false);

      await creator.create();

      expect(input).toHaveBeenCalledTimes(1);
      expect(confirm).toHaveBeenCalledTimes(1);

      const entries = chainManager.getEntries();
      expect(entries.length).toBe(0);
    });

    it("should create entry when user confirms", async () => {
      input.mockResolvedValueOnce("test-entry");
      setEditorContent("Test content for anchoring");
      confirm.mockResolvedValueOnce(true);

      await creator.create();

      const entries = chainManager.getEntries();
      expect(entries.length).toBe(1);
      expect(entries[0].name).toBe("test-entry");
    });

    it("should prompt with validation message for entry name", async () => {
      input.mockResolvedValueOnce("my-entry");
      setEditorContent("Content");
      confirm.mockResolvedValueOnce(false);

      await creator.create();

      expect(input).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Entry name"),
          validate: expect.any(Function),
        })
      );
    });

    it("should show confirmation with entry name and content preview", async () => {
      const entryName = "important-entry";
      const content = "This is important content";

      input.mockResolvedValueOnce(entryName);
      setEditorContent(content);
      confirm.mockResolvedValueOnce(false);

      await creator.create();

      expect(confirm).toHaveBeenCalled();
    });
  });

  describe("Entry name validation", () => {
    it("should reject empty entry name", async () => {
      input.mockImplementation(async (options: any) => {
        const result = options.validate("");
        expect(result).toMatch(/cannot be empty/i);
        throw new Error("Validation failed");
      });

      await expect(creator.create()).rejects.toThrow();
    });

    it("should reject entry name with invalid characters", async () => {
      input.mockImplementation(async (options: any) => {
        const result = options.validate("invalid/name");
        expect(result).toMatch(/only letters, numbers/i);
        throw new Error("Validation failed");
      });

      await expect(creator.create()).rejects.toThrow();
    });

    it("should accept valid entry names", async () => {
      const validNames = [
        "simple-name",
        "name_with_underscores",
        "name-123",
        "NameWithCaps",
      ];

      for (const name of validNames) {
        input.mockImplementation(async (options: any) => {
          const result = options.validate(name);
          expect(result).toBe(true);
          return name;
        });

        setEditorContent("Content");
        confirm.mockResolvedValue(false);

        await creator.create();
      }
    });

    it("should reject duplicate entry names", async () => {
      const entryName = "duplicate-entry";

      TestHelpers.createMockChain(chainManager, 1, entryName);

      input.mockImplementation(async (options: any) => {
        const result = options.validate(entryName);
        expect(result).toMatch(/already exists/i);
        throw new Error("Validation failed");
      });

      await expect(creator.create()).rejects.toThrow();
    });
  });

  describe("Content validation", () => {
    it("should accept content with newlines and formatting", async () => {
      const content = `Line 1
      
Line 2 with indent
  - Bullet point
  
Final line`;

      input.mockResolvedValueOnce("formatted-entry");
      setEditorContent(content);
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      const entries = chainManager.getEntries();
      const savedContent = fs.readFileSync(
        path.join(chainManager.getLogbookDir(), entries[0].name, "entry.txt"),
        "utf-8"
      );

      expect(savedContent).toBe(content);
    });
  });

  describe("Blockchain anchoring", () => {
    it("should anchor entry to smart contract", async () => {
      const anchorSpy = jest.spyOn(anchorService, "anchorEntry");

      input.mockResolvedValueOnce("anchored-entry");
      setEditorContent("Content to anchor");
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      expect(anchorSpy).toHaveBeenCalled();
    });

    it("should link entry to previous entry in chain", async () => {
      TestHelpers.createMockChain(chainManager, 1);

      const lastEntry = chainManager.getLastEntry();
      expect(lastEntry).not.toBeNull();

      const previousHash = lastEntry!.entryHash;

      const anchorSpy = jest.spyOn(anchorService, "anchorEntry");

      input.mockResolvedValueOnce("second-entry");
      setEditorContent("Second content");
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      expect(anchorSpy).toHaveBeenCalledWith(
        logbookName,
        "second-entry",
        expect.any(String),
        previousHash
      );
    });

    it("should use genesis hash for first entry", async () => {
      const anchorSpy = jest.spyOn(anchorService, "anchorEntry");

      input.mockResolvedValueOnce("first-entry");
      setEditorContent("First content");
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      const genesisHash = TestHelpers.hashContent("genesis");

      expect(anchorSpy).toHaveBeenCalledWith(
        logbookName,
        "first-entry",
        expect.any(String),
        genesisHash
      );
    });

    it("should store transaction hash in chain.json", async () => {
      input.mockResolvedValueOnce("tx-entry");
      setEditorContent("Content with tx");
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      const entries = chainManager.getEntries();
      expect(entries[0].txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should store block number in chain.json", async () => {
      input.mockResolvedValueOnce("block-entry");
      setEditorContent("Content with block");
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      const entries = chainManager.getEntries();
      expect(entries[0].blockNumber).toBeGreaterThan(0);
    });
  });

  describe("File system operations", () => {
    it("should create entry directory", async () => {
      input.mockResolvedValueOnce("dir-entry");
      setEditorContent("Content");
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      const entryDir = path.join(chainManager.getLogbookDir(), "dir-entry");
      expect(fs.existsSync(entryDir)).toBe(true);
      expect(fs.statSync(entryDir).isDirectory()).toBe(true);
    });

    it("should create entry.txt file", async () => {
      input.mockResolvedValueOnce("file-entry");
      setEditorContent("File content");
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      const entryFile = path.join(
        chainManager.getLogbookDir(),
        "file-entry",
        "entry.txt"
      );

      expect(fs.existsSync(entryFile)).toBe(true);
      expect(fs.readFileSync(entryFile, "utf-8")).toBe("File content");
    });

    it("should update chain.json", async () => {
      input.mockResolvedValueOnce("chain-entry");
      setEditorContent("Chain content");
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      const chainPath = path.join(chainManager.getLogbookDir(), "chain.json");
      expect(fs.existsSync(chainPath)).toBe(true);

      const chain = JSON.parse(fs.readFileSync(chainPath, "utf-8"));
      expect(chain.entries.length).toBe(1);
    });
  });

  describe("Chain validation", () => {
    it("should maintain valid chain after adding entry", async () => {
      TestHelpers.createMockChain(chainManager, 2);

      input.mockResolvedValueOnce("new-entry");
      setEditorContent("New content");
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      const validation = chainManager.validateChain();
      expect(validation.valid).toBe(true);
    });

    it("should correctly compute content hash", async () => {
      const content = "Content for hashing test";

      input.mockResolvedValueOnce("hash-entry");
      setEditorContent(content);
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      const entries = chainManager.getEntries();
      const expectedHash = TestHelpers.hashContent(content);

      expect(entries[0].entryHash).toBe(expectedHash);
    });
  });

  describe("Error handling", () => {
    it("should handle blockchain transaction failure", async () => {
      jest.spyOn(anchorService, "anchorEntry").mockRejectedValueOnce(
        new Error("Transaction failed")
      );

      input.mockResolvedValueOnce("fail-entry");
      setEditorContent("Content");
      confirm.mockResolvedValueOnce(true);

      await expect(creator.create()).rejects.toThrow("Transaction failed");

      const entries = chainManager.getEntries();
      expect(entries.length).toBe(0);
    });

    it("should propagate user cancellation errors", async () => {
      input.mockRejectedValueOnce(new Error("User cancelled"));

      await expect(creator.create()).rejects.toThrow("User cancelled");
    });
  });

  describe("Edge cases", () => {
    it("should handle very long entry names (255 chars)", async () => {
      const longName = "a".repeat(255);

      input.mockResolvedValueOnce(longName);
      setEditorContent("Content");
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      const entries = chainManager.getEntries();
      expect(entries[0].name).toBe(longName);
    });

    it("should handle very large content (>10KB)", async () => {
      const largeContent = "X".repeat(20000);

      input.mockResolvedValueOnce("large-entry");
      setEditorContent(largeContent);
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      const entries = chainManager.getEntries();
      const savedContent = fs.readFileSync(
        path.join(chainManager.getLogbookDir(), entries[0].name, "entry.txt"),
        "utf-8"
      );

      expect(savedContent).toBe(largeContent);
    });

    it("should handle special characters in content", async () => {
      const specialContent = "Content with emojis 🎉 and special chars: <>&\"'";

      input.mockResolvedValueOnce("special-entry");
      setEditorContent(specialContent);
      confirm.mockResolvedValueOnce(true);

      await creator.create();


      const entries = chainManager.getEntries();
      const savedContent = fs.readFileSync(
        path.join(chainManager.getLogbookDir(), entries[0].name, "entry.txt"),
        "utf-8"
      );

      expect(savedContent).toBe(specialContent);
    });
  });
});