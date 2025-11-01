import { ethers } from "ethers";
import fs from "fs";

/**
 * Computes SHA-256 hash of content.
 *
 * @returns 0x-prefixed 32-byte hex string
 */
export function hashContent(content: string): string {
  return ethers.sha256(ethers.toUtf8Bytes(content));
}

/**
 * Computes SHA-256 hash of file content.
 */
export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath, "utf8");
  return hashContent(content);
}

/**
 * Normalizes hash to lowercase and trims whitespace.
 */
export function normalizeHash(hash: string): string {
  return hash.toLowerCase().trim();
}

/**
 * Builds payload string for script hash computation.
 *
 * @returns Format: "logbook:name:hash"
 */
export function buildPayload(name: string, hash: string): string {
  return `logbook:${name}:${hash}`;
}
