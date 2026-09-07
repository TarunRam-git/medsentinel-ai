import { spawn } from "node:child_process";
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
if (existsSync(".env.local")) loadEnvFile(".env.local");
const python =
  process.env.PYTHON_BIN ||
  (existsSync(".venv/bin/python") ? ".venv/bin/python" : "python");
const child = spawn(
  python,
  ["-m", "uvicorn", "ml.service:app", "--host", "127.0.0.1", "--port", "8001"],
  { stdio: "inherit", env: process.env },
);
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
