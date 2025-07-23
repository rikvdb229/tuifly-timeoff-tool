// src/utils/crypto.js - Token encryption utilities
const crypto = require('crypto');

class TokenCrypto {
  constructor() {
    // Use encryption key from environment or generate one
    this.encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
    
    if (!this.encryptionKey) {
      console.warn('⚠️  TOKEN_ENCRYPTION_KEY not set. Using default key for development.');
      console.warn('🔒 Set TOKEN_ENCRYPTION_KEY in production for security!');
      // Use a default key for development (32 bytes for AES-256)
      this.encryptionKey = 'dev-key-32-chars-for-aes-256-enc';
    }
    
    if (this.encryptionKey.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be exactly 32 characters (256 bits)');
    }
    
    this.algorithm = 'aes-256-cbc';
  }

  /**
   * Encrypt a sensitive token
   * @param {string} plaintext - The token to encrypt
   * @returns {string} - Encrypted token in format: iv:tag:encrypted
   */
  encrypt(plaintext) {
    if (!plaintext) return null;
    
    try {
      // Generate random IV for each encryption
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, Buffer.from(this.encryptionKey), iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Return in format: iv:encrypted
      return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
      console.error('❌ Token encryption failed:', error);
      throw new Error('Failed to encrypt token');
    }
  }

  /**
   * Decrypt a sensitive token
   * @param {string} encryptedData - Token in format: iv:tag:encrypted
   * @returns {string} - Decrypted token
   */
  decrypt(encryptedData) {
    if (!encryptedData) return null;
    
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted token format');
      }
      
      const [ivHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, Buffer.from(this.encryptionKey), iv);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('❌ Token decryption failed:', error);
      throw new Error('Failed to decrypt token');
    }
  }

  /**
   * Check if a token value is encrypted (contains the format markers)
   * @param {string} value - Token value to check
   * @returns {boolean}
   */
  isEncrypted(value) {
    return value && typeof value === 'string' && value.includes(':') && value.split(':').length === 2;
  }
}

// Create singleton instance
const tokenCrypto = new TokenCrypto();

module.exports = {
  TokenCrypto,
  tokenCrypto,
  
  // Helper functions for easy use
  encryptToken: (token) => tokenCrypto.encrypt(token),
  decryptToken: (encryptedToken) => tokenCrypto.decrypt(encryptedToken),
  isTokenEncrypted: (token) => tokenCrypto.isEncrypted(token),
};