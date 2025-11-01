# 🔗 Logbook Anchor

A blockchain-based audit trail system for creating tamper-proof, cryptographically verifiable logbooks. Each entry is hashed, chained, and anchored on-chain to ensure immutability and transparency.

## 🎯 Overview

Logbook Anchor combines local file management with blockchain anchoring to create verifiable chains of entries. Each entry is:
- **Hashed** using SHA-256
- **Linked** to the previous entry (blockchain-style chaining)
- **Anchored** on-chain via smart contract
- **Verified** through Merkle trees and contract validation

Perfect for audit logs, learning journals, compliance records, or any scenario requiring proof of data integrity over time.

## 🏗️ Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                      CLI Application                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐    │
│  │ Creator  │  │ Exporter │  │ Verifier │  │Reconstruct│    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬──────┘    │
└───────┼─────────────┼─────────────┼─────────────┼───────────┘
        │             │             │             │
┌───────▼─────────────▼─────────────▼─────────────▼──────────┐
│                       Services Layer                       │
│  ┌────────────────────┐  ┌────────────────────────────┐    │
│  │  AnchorService     │  │  BlockchainSyncService     │    │
│  │  - anchorEntry()   │  │  - syncFromContract()      │    │
│  │  - getEntries()    │  │  - validateOnChain()       │    │
│  │  - validateChain() │  │                            │    │
│  └──────────┬─────────┘  └───────────┬────────────────┘    │
└─────────────┼────────────────────────┼─────────────────────┘
              │                        │
┌─────────────▼────────────────────────▼─────────────────────┐
│                    Blockchain Layer                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Smart Contract (LogbookAnchor)             │  │
│  │  - Entry storage with previousHash validation        │  │
│  │  - Chain integrity verification                      │  │
│  │  - Multi-logbook support per wallet                  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────┐
│                  Storage Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  chain.json  │  │  entry.txt   │  │  proof.txt   │     │
│  │  (metadata)  │  │  (content)   │  │  (anchoring) │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└───────────────────────────────────────────────────────────┘
```

## 📋 Workflow

### Create Entry Flow
```
User Input → Hash Content → Link to Previous → Anchor on Chain
     ↓            ↓              ↓                    ↓
  entry.txt   entryHash    previousHash          TX Hash
                  ↓              ↓                    ↓
              Save Local ← Build Merkle ← Wait Confirmation
                              Tree
```

### Verification Flow
```
Import ZIP → Parse Metadata → Verify Hashes → Validate Chain
     ↓              ↓               ↓               ↓
  Extract     Check Version    Compare Local   Query Contract
   Files                        vs Expected         ↓
     ↓                              ↓          Validate Links
Generate Report ← Check Merkle ← Compare Hashes
```

## 🚀 Getting Started

### Prerequisites
- Node.js ≥ 18.0.0
- npm or yarn
- Ethereum-EVM compatible RPC endpoint
- Deployed LogbookAnchor contract

### Local Setup

1. **Clone and Install**
```bash
git clone
cd logbook-anchor
npm install
```

2. **Configure Environment**
```bash
cp .env.example .env
```
add your private key to perform anchors
by default uses Sepolia testnet;
modify as needed.


3. **Build and Run**
```bash
npm run build
npm start
```

### Docker Setup
```bash
# Build and start
docker-compose up -d

# Access CLI
docker exec -it logbook npm start

# View logs
docker logs -f logbook

# Stop
docker-compose down
```

**Persistent Storage**: Logbooks are stored in `logbook-data` volume.

## 🎮 Features & Usage

### 1. Create Logbook Entry
```bash
npm start
→ Select/Create logbook
→ Create new entry
→ Enter name
→ Write content (vi/nano editor)
→ Confirm anchoring
```

**What happens**:
- Content hashed (SHA-256)
- Entry linked to previous hash
- Transaction sent to contract
- Merkle root calculated
- Files saved: `entry.txt`, `proof.txt`
- `chain.json` updated

**Directory structure**:
```
logbooks/
  └── my-logbook/
      ├── chain.json
      ├── entry-1/
      │   ├── entry.txt
      │   └── proof.txt
      └── entry-2/
          ├── entry.txt
          └── proof.txt
```

### 2. Export Logbook
```bash
→ Select logbook
→ Export logbook
→ Confirm export
```

**Output**: `exports/my-logbook_YYYYMMDD_HHMMSS.zip`

**Contains**:
- `metadata.json` (logbook info, wallet, chain ID, code version)
- `entries/*/entry.txt` (actual content)
- `entries/*/proof.txt` (anchoring proof)

### 3. Verify Logbook
```bash
→ Verify logbook (import)
→ Select ZIP from imports/ folder
```

**Verification steps**:
1. ✓ Content hashes match
2. ✓ Chain linkage valid (previousHash)
3. ✓ On-chain entries match
4. ✓ Contract validation passes
5. ✓ Code version consistency

**Possible outcomes**:
- ✅ **VERIFICATION PASSED**: Authentic logbook
- ⚠️ **RECONSTRUCTED LOGBOOK**: Placeholder entries (needs content restoration)
- ❌ **VERIFICATION FAILED**: Integrity issues detected

### 4. Reconstruct from Contract
```bash
→ Reconstruct logbook from contract
→ Enter logbook name
```

**Use case**: Restore local structure from on-chain data after:
- Local files lost
- Moving to new machine
- Syncing with blockchain state

**Result**:
- `chain.json` rebuilt
- Placeholder `entry.txt` created (hash-only)
- Restore actual content from backup

### 5. Validate On-Chain
```bash
→ Select logbook
→ Validate on-chain
```

Queries smart contract to verify:
- All entries present
- Chain links valid
- No broken hashes

## 🧪 Testing
```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## 🔐 Security Considerations

- **Private Keys**: Never commit `.env` file
- **Contract Deployment**: Verify contract code before use
- **RPC Endpoints**: Use trusted providers
- **Content Privacy**: Entry content stored locally (only hashes on-chain)
- **Code Versioning**: Hash tracked for reproducibility

## 🤝 Contributing

This is an experimental project showcasing blockchain-based audit trails. Contributions, issues, and feature requests are welcome.

## 📜 License

MIT

---

**Built with ❤️ for tamper-proof data integrity**