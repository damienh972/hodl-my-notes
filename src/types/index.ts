export interface BaseEntry {
  name: string;
  entryHash: string;
  previousHash: string;
  timestamp: number;
  blockNumber: number;
}

export interface ChainEntry extends BaseEntry {
  txHash: string;
  merkleRoot: string;
}

export interface ChainData {
  logbookName: string;
  entries: ChainEntry[];
}

export interface ValidationResult {
  valid: boolean;
  brokenAtIndex: number;
}

export interface TxResult {
  txHash: string;
  explorerTxUrl: string;
}

export interface SyncResult {
  success: boolean;
  entries: BaseEntry[];
  errors: string[];
}

export interface ExportData {
  metadata: {
    version: string;
    logbookName: string;
    logbookNameHash: string;
    exportDate: string;
    totalEntries: number;
    walletAddress: string;
    chainId: number;
    codeHash: string;
  };
  entries: Array<{
    index: number;
    name: string;
    content: string;
    entryHash: string;
    previousHash: string;
    txHash: string;
    timestamp: number;
    blockNumber: number;
    merkleRoot: string;
  }>;
}

export interface LogbookInfo {
  name: string;
  nameHash: string;
  entryCount: number;
}
