import { MerkleTree } from "merkletreejs";
import { ethers } from "ethers";

/**
 * Hashes a leaf using SHA-256.
 */
function hashLeaf(data: string | Buffer): Buffer {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(ethers.toUtf8Bytes(data));
  const hash = ethers.sha256(bytes);
  return Buffer.from(hash.slice(2), "hex");
}

/**
 * Creates a Merkle tree from entry hashes.
 *
 * @param leaves - Array of entry hashes
 * @returns MerkleTree with sorted pairs
 */
export function createMerkleTree(leaves: string[]): MerkleTree {
  const hashedLeaves = leaves.map(hashLeaf);
  return new MerkleTree(hashedLeaves, hashLeaf, { sortPairs: true });
}

/**
 * Extracts Merkle root from tree.
 *
 * @returns 0x-prefixed hex string
 */
export function getMerkleRoot(tree: MerkleTree): string {
  return "0x" + tree.getRoot().toString("hex");
}

/**
 * Generates Merkle proof for a leaf.
 *
 * @returns Array of 0x-prefixed hex hashes
 */
export function getMerkleProof(tree: MerkleTree, leaf: string): string[] {
  const hashedLeaf = hashLeaf(leaf);
  return tree.getProof(hashedLeaf).map((p) => "0x" + p.data.toString("hex"));
}

/**
 * Verifies a Merkle proof against a root.
 */
export function verifyMerkleProof(proof: string[], leaf: string, root: string): boolean {
  const hashedLeaf = hashLeaf(leaf);
  const proofBuffers = proof.map((p) => Buffer.from(p.slice(2), "hex"));
  const rootBuffer = Buffer.from(root.slice(2), "hex");
  return MerkleTree.verify(proofBuffers, hashedLeaf, rootBuffer, hashLeaf, { sortPairs: true });
}
