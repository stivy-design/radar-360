import { webcrypto } from "node:crypto";
const crypto = webcrypto;
const password = process.argv[2];
if (!password || password.length < 14) {
  console.error("Uso: node scripts/hash-password.mjs 'uma-senha-forte-com-14-caracteres-ou-mais'");
  process.exit(1);
}
const bytes = crypto.getRandomValues(new Uint8Array(16));
const salt = Buffer.from(bytes).toString("base64url");
const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
const bits = await crypto.subtle.deriveBits({name:"PBKDF2",salt:bytes,iterations:100000,hash:"SHA-256"},key,256);
console.log("ADMIN_PASSWORD_SALT="+salt);
console.log("ADMIN_PASSWORD_HASH="+Buffer.from(bits).toString("base64url"));
