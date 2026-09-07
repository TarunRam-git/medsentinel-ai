import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env.local")) {
  console.log(".env.local already exists; existing secrets preserved.");
  process.exit(0);
}
mkdirSync("data", { recursive: true, mode: 0o700 });
const secret = () => randomBytes(32).toString("hex");
writeFileSync(
  ".env.local",
  `DATA_ENCRYPTION_KEY=${secret()}\nADMIN_EMAIL=admin@medsentinel.local\nADMIN_PASSWORD=${secret()}\nENABLE_DEMO=true\nAPP_ORIGIN=http://localhost:3000\nDATABASE_PATH=./data/medsentinel.db\nML_SERVICE_URL=http://127.0.0.1:8001\nML_SERVICE_TOKEN=${secret()}\nINGEST_API_KEY=${secret()}\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created private .env.local with unique secrets. Local synthetic demo enabled. Disable ENABLE_DEMO before deployment.",
);
