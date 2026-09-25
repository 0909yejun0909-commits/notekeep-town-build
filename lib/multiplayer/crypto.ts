// End-to-end encryption for room traffic. The key travels only in the invite link's
// #fragment, which browsers never send to a server, so the relay only sees ciphertext.

const IV_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function generateRoomKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportRoomKey(key: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  return bytesToBase64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function importRoomKey(text: string): Promise<CryptoKey> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(text)) throw new Error('Malformed room key');
  const raw = base64ToBytes(text.replace(/-/g, '+').replace(/_/g, '/') + '=');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function sealMessage(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext)));
  const out = new Uint8Array(IV_BYTES + cipher.length);
  out.set(iv);
  out.set(cipher, IV_BYTES);
  return bytesToBase64(out);
}

export async function openMessage(key: CryptoKey, sealed: string): Promise<string> {
  const bytes = base64ToBytes(sealed);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(0, IV_BYTES) },
    key,
    bytes.subarray(IV_BYTES),
  );
  return decoder.decode(plain);
}
