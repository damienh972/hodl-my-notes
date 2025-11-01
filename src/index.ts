import * as dotenv from "dotenv";
dotenv.config();

import { LogbookCli } from "./app/logbookCli";

const app = new LogbookCli();

app.run().catch((err) => {
  console.error("\n❌ Fatal error:", err.message || err);
  process.exit(1);
});
