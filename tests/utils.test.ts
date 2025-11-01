import { hashContent, buildPayload } from "../src/utils/hash";
import { createMerkleTree, getMerkleRoot } from "../src/utils/merkle";
import { describe, test, expect } from "@jest/globals";

describe("Hash Utils", () => {
  test("should hash content consistently", () => {
    const content = "test content";
    const hash1 = hashContent(content);
    const hash2 = hashContent(content);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(66);
  });

  test("should build payload correctly", () => {
    const name = "test-log";
    const hash = "abc123";
    const payload = buildPayload(name, hash);
    
    expect(payload).toBe("logbook:test-log:abc123");
  });
});

describe("Merkle Utils", () => {
  test("should create merkle tree and get root", () => {
    const leaves = ["hash1", "hash2", "hash3"];
    const tree = createMerkleTree(leaves);
    const root = getMerkleRoot(tree);
    
    expect(root).toBeTruthy();
    expect(root).toHaveLength(66);
  });

  test("should create consistent roots for same data", () => {
    const leaves = ["hash1", "hash2"];
    const tree1 = createMerkleTree(leaves);
    const tree2 = createMerkleTree(leaves);
    
    expect(getMerkleRoot(tree1)).toBe(getMerkleRoot(tree2));
  });
});
