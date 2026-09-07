import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
function key() { const value=process.env.DATA_ENCRYPTION_KEY; if(!value || !/^[a-f0-9]{64}$/i.test(value)) throw new Error("DATA_ENCRYPTION_KEY must be a 32-byte hexadecimal secret. Run npm run setup.");return Buffer.from(value,"hex"); }
export function encrypt(value:unknown) { const nonce=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",key(),nonce);const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]).toString("base64"); }
export function decrypt<T>(value:string):T {const b=Buffer.from(value,"base64");const cipher=createDecipheriv("aes-256-gcm",key(),b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString());}
export const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export const auditHash=(value:string)=>createHmac("sha256",key()).update(value).digest("hex");
export function hashPassword(value:string) {const salt=randomBytes(16).toString("hex");return `${salt}:${scryptSync(value,salt,64).toString("hex")}`;}
export function verifyPassword(value:string,stored:string) {const [salt,hash]=stored.split(":");const expected=Buffer.from(hash,"hex");return timingSafeEqual(scryptSync(value,salt,64),expected);}
