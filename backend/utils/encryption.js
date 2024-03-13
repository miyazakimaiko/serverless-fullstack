const crypto = require('crypto');

const BASE64_ENCODING = 'base64';
const UTF8_ENCODING = 'utf8';
const ALGO = 'aes-256-gcm';

export const encryptText = ({ text, key }) => {
  const encryptionKeyBytes = Buffer.from(key, BASE64_ENCODING);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, encryptionKeyBytes, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, UTF8_ENCODING),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  const encryptedData = Buffer.concat([iv, authTag, encrypted]);
  return encryptedData.toString(BASE64_ENCODING);
}

export const decryptText = ({ encryptedText, key }) => {
  const encryptionKeyBytes = Buffer.from(key, BASE64_ENCODING);
  const encryptedData = Buffer.from(encryptedText, BASE64_ENCODING);

  const iv = encryptedData.prototype.slice(0, 16);
  const authTag = encryptedData.prototype.slice(16, 32);
  const encrypted = encryptedData.prototype.slice(32);

  const decipher = crypto.createDecipheriv(ALGO, encryptionKeyBytes, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return decrypted.toString(UTF8_ENCODING);
}