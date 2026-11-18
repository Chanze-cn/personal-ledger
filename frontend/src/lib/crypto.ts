/**
 * 传输层加密（与后端 app/crypto_transport.py 对应）。
 *
 * 混合加密：随机 AES-256-GCM 会话密钥加密业务数据，RSA-OAEP(SHA-256) 包裹会话密钥。
 * 浏览器只在安全上下文（https 或 localhost）暴露 WebCrypto，非安全上下文会直接报错提示。
 */

export interface SealedBody {
  key: string;
  iv: string;
  data: string;
}

function bytesToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let index = 0; index < view.byteLength; index += 1) {
    binary += String.fromCharCode(view[index]);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function requireCrypto(): SubtleCrypto {
  const subtle = window.crypto?.subtle;
  if (!subtle) {
    throw new Error('当前环境不支持 WebCrypto，请通过 localhost 或 HTTPS 访问');
  }
  return subtle;
}

export async function sealPayload(
  publicKeyBase64: string,
  payload: Record<string, unknown>,
): Promise<SealedBody> {
  const subtle = requireCrypto();

  const rsaKey = await subtle.importKey(
    'spki',
    base64ToBytes(publicKeyBase64) as unknown as BufferSource,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );

  const aesKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const rawAesKey = await subtle.exportKey('raw', aesKey);
  const wrappedKey = await subtle.encrypt({ name: 'RSA-OAEP' }, rsaKey, rawAesKey);

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    aesKey,
    new TextEncoder().encode(JSON.stringify(payload)),
  );

  return {
    key: bytesToBase64(wrappedKey),
    iv: bytesToBase64(iv),
    data: bytesToBase64(ciphertext),
  };
}
