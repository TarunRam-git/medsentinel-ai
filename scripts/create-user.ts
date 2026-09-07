import { loadEnvFile } from "node:process";
import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { roles, type Role } from "../src/lib/types";
if (existsSync(".env.local")) loadEnvFile(".env.local");
const [email, name, role] = process.argv.slice(2);
if (
  !email ||
  !name ||
  !roles.includes(role as Role) ||
  !/^\S+@\S+\.\S+$/.test(email)
) {
  console.error(
    'Usage: npm run user:create -- email "Display name" clinician|security|biomedical|researcher|admin',
  );
  process.exit(1);
}
async function main() {
  const { db, audit, transaction } = await import("../src/lib/db");
  const { hashPassword } = await import("../src/lib/crypto");
  const id = crypto.randomUUID(),
    password = randomBytes(24).toString("base64url");
  transaction(() => {
    db()
      .prepare("INSERT INTO users VALUES (?,?,?,?,?)")
      .run(id, email.toLowerCase(), name, role, hashPassword(password));
    audit("operator", "user.created", id, `Provisioned ${role} role`);
  });
  const file = resolve(
    dirname(process.env.DATABASE_PATH ?? "./data/medsentinel.db"),
    `${id}-credentials.txt`,
  );
  writeFileSync(file, `Email: ${email}\nPassword: ${password}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    `User created. Initial credentials saved privately to ${file}. Deliver through an approved secure channel.`,
  );
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "User provisioning failed",
  );
  process.exitCode = 1;
});
