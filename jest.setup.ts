import dotenv from "dotenv";
dotenv.config();
import fs from "fs";

process.env.CI = "true";
process.env.NODE_ENV = "test";

afterEach(() => {
  jest.clearAllMocks();
});

// Setup test root directory for logbook entries
beforeAll(() => {
  const testRoot = process.env.LOGBOOK_ROOT || "/tmp/logbook-tests";

  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(testRoot, { recursive: true });
});
