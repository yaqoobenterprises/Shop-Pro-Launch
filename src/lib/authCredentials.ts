export const MIN_PIN_LENGTH = 4;

export async function derivePin(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: 120000, hash: "SHA-256" },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function encodeBytes(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeBytes(value: string): Uint8Array {
  return new Uint8Array(value.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
}

export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await derivePin(pin, salt), salt: encodeBytes(salt) };
}

export async function hashPassword(
  password: string,
  salt = encodeBytes(crypto.getRandomValues(new Uint8Array(16))),
): Promise<string> {
  return `${salt}:${await derivePin(password, decodeBytes(salt))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, expected] = stored.split(":");
  return Boolean(salt && expected) && (await derivePin(password, decodeBytes(salt))) === expected;
}

export async function verifyPin(pin: string, expectedHash: string, salt: string): Promise<boolean> {
  return (await derivePin(pin, decodeBytes(salt))) === expectedHash;
}
