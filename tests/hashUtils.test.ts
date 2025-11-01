import { hashContent, buildPayload } from "../src/utils/hash";
import { TestHelpers } from "./helpers/testHelpers";

describe("Hash Utilities", () => {
  describe("hashContent()", () => {
    it("should return consistent hash for same content", () => {
      const content = "Test content for hashing";

      const hash1 = hashContent(content);
      const hash2 = hashContent(content);

      expect(hash1).toBe(hash2);
    });

    it("should return different hashes for different content", () => {
      const content1 = "Content A";
      const content2 = "Content B";

      const hash1 = hashContent(content1);
      const hash2 = hashContent(content2);

      expect(hash1).not.toBe(hash2);
    });

    it("should return hash in 0x prefixed format", () => {
      const content = "Sample content";
      const hash = hashContent(content);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should handle empty string", () => {
      const hash = hashContent("");

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should handle whitespace-only content", () => {
      const hash1 = hashContent("   ");
      const hash2 = hashContent("\n\t");

      expect(hash1).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(hash2).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(hash1).not.toBe(hash2);
    });

    it("should handle newlines in content", () => {
      const content = "Line 1\nLine 2\nLine 3";
      const hash = hashContent(content);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should handle special characters", () => {
      const content = "Special: !@#$%^&*()_+-=[]{}|;:',.<>?/`~";
      const hash = hashContent(content);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should handle UTF-8 characters", () => {
      const content = "UTF-8: émojis 🎉 spëcïal çhars: 日本語";
      const hash = hashContent(content);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should handle long content (>10KB)", () => {
      const longContent = "X".repeat(20000);
      const hash = hashContent(longContent);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should handle very long content (>1MB)", () => {
      const veryLongContent = "A".repeat(1500000);
      const hash = hashContent(veryLongContent);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should detect single character difference", () => {
      const content1 = "The quick brown fox";
      const content2 = "The quick brown Fox";

      const hash1 = hashContent(content1);
      const hash2 = hashContent(content2);

      expect(hash1).not.toBe(hash2);
    });

    it("should detect whitespace differences", () => {
      const content1 = "No space";
      const content2 = "No  space";

      const hash1 = hashContent(content1);
      const hash2 = hashContent(content2);

      expect(hash1).not.toBe(hash2);
    });

    it("should be case-sensitive", () => {
      const content1 = "lowercase";
      const content2 = "LOWERCASE";

      const hash1 = hashContent(content1);
      const hash2 = hashContent(content2);

      expect(hash1).not.toBe(hash2);
    });

    it("should use SHA-256 algorithm", () => {
      const content = "Test for SHA-256";
      const hash = hashContent(content);

      expect(hash.slice(2).length).toBe(64);
    });

    it("should match TestHelpers.hashContent", () => {
      const content = "Consistency check";

      const hash1 = hashContent(content);
      const hash2 = TestHelpers.hashContent(content);

      expect(hash1).toBe(hash2);
    });

    it("should handle numeric strings", () => {
      const content = "123456789";
      const hash = hashContent(content);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should handle JSON strings", () => {
      const jsonContent = JSON.stringify({ key: "value", number: 42 });
      const hash = hashContent(jsonContent);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should be deterministic across multiple calls", () => {
      const content = "Deterministic test";
      const hashes = Array.from({ length: 100 }, () => hashContent(content));

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(1);
    });
  });

  describe("buildPayload()", () => {
    it("should build valid string payload", () => {
      const entryName = "test-entry";
      const entryHash = "0x" + "a".repeat(64);

      const payload = buildPayload(entryName, entryHash);

      expect(typeof payload).toBe("string");
      expect(payload).toContain("logbook:");
      expect(payload).toContain(entryName);
      expect(payload).toContain(entryHash);
    });

    it("should follow logbook:name:hash format", () => {
      const entryName = "format-test";
      const entryHash = "0xhash123";

      const payload = buildPayload(entryName, entryHash);

      expect(payload).toBe(`logbook:${entryName}:${entryHash}`);
    });

    it("should handle different entry names", () => {
      const payload1 = buildPayload("entry1", "0xhash1");
      const payload2 = buildPayload("entry2", "0xhash2");

      expect(payload1).not.toBe(payload2);
      expect(payload1).toContain("entry1");
      expect(payload2).toContain("entry2");
    });

    it("should handle long entry names", () => {
      const longName = "a".repeat(255);
      const entryHash = "0x" + "2".repeat(64);

      const payload = buildPayload(longName, entryHash);

      expect(payload).toContain(longName);
      expect(payload).toMatch(/^logbook:/);
    });

    it("should handle special characters in entry name", () => {
      const specialName = "entry_with-special.chars";
      const entryHash = "0x" + "4".repeat(64);

      const payload = buildPayload(specialName, entryHash);

      expect(payload).toContain(specialName);
    });

    it("should produce consistent output for same inputs", () => {
      const entryName = "consistent";
      const entryHash = "0x" + "6".repeat(64);

      const payload1 = buildPayload(entryName, entryHash);
      const payload2 = buildPayload(entryName, entryHash);

      expect(payload1).toBe(payload2);
    });

    it("should handle short hash values", () => {
      const entryName = "short-hash";
      const shortHash = "0xabc";

      const payload = buildPayload(entryName, shortHash);

      expect(payload).toBe(`logbook:${entryName}:${shortHash}`);
    });

    it("should handle uppercase in hash", () => {
      const entryName = "upper-test";
      const upperHash = "0xABCDEF";

      const payload = buildPayload(entryName, upperHash);

      expect(payload).toContain(upperHash);
    });

    it("should create parseable payload", () => {
      const entryName = "parse-test";
      const entryHash = "0x123456";

      const payload = buildPayload(entryName, entryHash);
      const parts = payload.split(":");

      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe("logbook");
      expect(parts[1]).toBe(entryName);
      expect(parts[2]).toBe(entryHash);
    });

    it("should handle numeric entry names", () => {
      const entryName = "123456";
      const entryHash = "0xhash";

      const payload = buildPayload(entryName, entryHash);

      expect(payload).toBe(`logbook:${entryName}:${entryHash}`);
    });
  });

  describe("Hash validation", () => {

    it("should accept valid hash format", () => {
      const content = "Valid content";
      const hash = hashContent(content);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(hash.length).toBe(66);
    });
  });

  describe("Performance", () => {
    it("should hash small content quickly", () => {
      const content = "Small content";
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        hashContent(content);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000);
    });

    it("should hash large content efficiently", () => {
      const largeContent = "X".repeat(100000);
      const startTime = Date.now();

      hashContent(largeContent);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500);
    });

    it("should build payload quickly", () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        buildPayload(`entry-${i}`, `0xhash${i}`);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000);
    });
  });

  describe("Edge cases", () => {
    it("should handle null bytes in content", () => {
      const content = "Content with\x00null byte";
      const hash = hashContent(content);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should handle extremely long lines", () => {
      const longLine = "A".repeat(1000000);
      const hash = hashContent(longLine);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("should handle content with only special characters", () => {
      const specialOnly = "!@#$%^&*()_+-=[]{}|;:',.<>?/`~";
      const hash = hashContent(specialOnly);

      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe("Cryptographic properties", () => {
    it("should have avalanche effect (small change -> big difference)", () => {
      const content1 = "The quick brown fox jumps over the lazy dog";
      const content2 = "The quick brown fox jumps over the lazy doh";

      const hash1 = hashContent(content1);
      const hash2 = hashContent(content2);

      // Count different characters in hashes
      let differences = 0;
      for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) differences++;
      }

      expect(differences).toBeGreaterThan(30);
    });

    it("should have uniform distribution (no obvious patterns)", () => {
      const hashes = Array.from({ length: 100 }, (_, i) =>
        hashContent(`Content ${i}`)
      );

      const uniqueHashes = new Set(hashes);

      expect(uniqueHashes.size).toBe(100);
    });
  });
});