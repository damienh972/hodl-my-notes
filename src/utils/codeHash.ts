import * as fs from "fs";
import * as path from "path";
import { hashContent } from "./hash";

/**
 * Calculates deterministic hash of all TypeScript source files.
 * Ensures code integrity by hashing normalized source content.
 *
 * @returns Combined SHA-256 hash of all source files
 */
export function calculateCodeHash(): string {
  const sourceFiles = [
    "src/app/logbookCli.ts",
    "src/app/logbookCreator.ts",
    "src/app/logbookVerifier.ts",
    "src/app/logbookExporter.ts",
    "src/app/logbookReconstructor.ts",
    "src/services/anchorService.ts",
    "src/services/blockchainSyncService.ts",
    "src/utils/chain.ts",
    "src/utils/codeHash.ts",
    "src/utils/config.ts",
    "src/utils/hash.ts",
    "src/utils/merkle.ts",
  ];

  const rootDir = process.cwd();
  const hashes: string[] = [];

  for (const file of sourceFiles) {
    const filePath = path.join(rootDir, file);

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const normalized = content.replace(/\s+/g, " ").trim();
      const fileHash = hashContent(normalized);
      hashes.push(fileHash);
    }
  }

  const combinedHash = hashContent(hashes.join(""));
  return combinedHash;
}

/**
 * Gets code hash, recalculated on each call to reflect source changes.
 */
export function getCodeHash(): string {
  return calculateCodeHash();
}

/**
 * Lightweight version hash using package.json name and version.
 *
 * @returns SHA-256 hash of "name@version"
 * @throws {Error} If package.json not found
 */
export function getPackageVersionHash(): string {
  const packagePath = path.join(process.cwd(), "package.json");

  if (!fs.existsSync(packagePath)) {
    throw new Error("package.json not found");
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
  const version = pkg.version || "0.0.0";
  const name = pkg.name || "unknown";

  return hashContent(`${name}@${version}`);
}
