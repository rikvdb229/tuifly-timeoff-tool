// tests/unit/utils/crypto.test.js - Unit tests for crypto utilities

// Mock the logger to avoid output during tests
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const crypto = require('crypto');
const { TokenCrypto, tokenCrypto, encryptToken, decryptToken, isTokenEncrypted } = require('../../../src/utils/crypto');
const { logger } = require('../../../src/utils/logger');

describe('TokenCrypto', () => {
  let originalEnv;

  beforeAll(() => {
    originalEnv = process.env.TOKEN_ENCRYPTION_KEY;
  });

  afterAll(() => {
    if (originalEnv) {
      process.env.TOKEN_ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should use encryption key from environment', () => {
      const testKey = '12345678901234567890123456789012'; // 32 chars
      process.env.TOKEN_ENCRYPTION_KEY = testKey;

      const tokenCryptoInstance = new TokenCrypto();

      expect(tokenCryptoInstance.encryptionKey).toBe(testKey);
      expect(tokenCryptoInstance.algorithm).toBe('aes-256-cbc');
    });

    it('should use default key when environment key not set', () => {
      delete process.env.TOKEN_ENCRYPTION_KEY;

      const tokenCryptoInstance = new TokenCrypto();

      expect(tokenCryptoInstance.encryptionKey).toBe('dev-key-32-chars-for-aes-256-enc');
      expect(logger.warn).toHaveBeenCalledWith(
        '⚠️  TOKEN_ENCRYPTION_KEY not set. Using default key for development.'
      );
      expect(logger.warn).toHaveBeenCalledWith(
        '🔒 Set TOKEN_ENCRYPTION_KEY in production for security!'
      );
    });

    it('should throw error if encryption key is not 32 characters', () => {
      process.env.TOKEN_ENCRYPTION_KEY = 'too-short';

      expect(() => new TokenCrypto()).toThrow(
        'TOKEN_ENCRYPTION_KEY must be exactly 32 characters (256 bits)'
      );
    });

    it('should throw error if encryption key is too long', () => {
      process.env.TOKEN_ENCRYPTION_KEY = '123456789012345678901234567890123'; // 33 chars

      expect(() => new TokenCrypto()).toThrow(
        'TOKEN_ENCRYPTION_KEY must be exactly 32 characters (256 bits)'
      );
    });
  });

  describe('encrypt', () => {
    let tokenCryptoInstance;

    beforeEach(() => {
      process.env.TOKEN_ENCRYPTION_KEY = '12345678901234567890123456789012';
      tokenCryptoInstance = new TokenCrypto();
    });

    it('should encrypt a plaintext token', () => {
      const plaintext = 'sensitive-token-12345';
      const encrypted = tokenCryptoInstance.encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).toContain(':');
      expect(encrypted.split(':')).toHaveLength(2);
      expect(encrypted).not.toBe(plaintext);
    });

    it('should return null for null input', () => {
      expect(tokenCryptoInstance.encrypt(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(tokenCryptoInstance.encrypt(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(tokenCryptoInstance.encrypt('')).toBeNull();
    });

    it('should generate different encrypted values for same input', () => {
      const plaintext = 'same-token';
      const encrypted1 = tokenCryptoInstance.encrypt(plaintext);
      const encrypted2 = tokenCryptoInstance.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      // But both should decrypt to the same value
      expect(tokenCryptoInstance.decrypt(encrypted1)).toBe(plaintext);
      expect(tokenCryptoInstance.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle various types of tokens', () => {
      const testCases = [
        'simple-token',
        'token-with-special-chars!@#$%^&*()',
        'very-long-token-that-exceeds-normal-length-for-comprehensive-testing-purposes',
        '123456789',
        'token with spaces',
        'token\nwith\nnewlines',
        'token\twith\ttabs',
        'токен-with-unicode-чарacters', // Unicode characters
      ];

      testCases.forEach(token => {
        const encrypted = tokenCryptoInstance.encrypt(token);
        expect(encrypted).toBeDefined();
        expect(encrypted).toContain(':');
        expect(tokenCryptoInstance.decrypt(encrypted)).toBe(token);
      });
    });

    it('should handle crypto errors gracefully', () => {
      // Mock crypto.randomBytes to throw an error
      const originalRandomBytes = crypto.randomBytes;
      crypto.randomBytes = jest.fn().mockImplementation(() => {
        throw new Error('Crypto error');
      });

      expect(() => tokenCryptoInstance.encrypt('test')).toThrow('Failed to encrypt token');
      expect(logger.error).toHaveBeenCalledWith('❌ Token encryption failed:', expect.any(Error));

      // Restore
      crypto.randomBytes = originalRandomBytes;
    });
  });

  describe('decrypt', () => {
    let tokenCryptoInstance;

    beforeEach(() => {
      process.env.TOKEN_ENCRYPTION_KEY = '12345678901234567890123456789012';
      tokenCryptoInstance = new TokenCrypto();
    });

    it('should decrypt an encrypted token', () => {
      const plaintext = 'test-token-for-decryption';
      const encrypted = tokenCryptoInstance.encrypt(plaintext);
      const decrypted = tokenCryptoInstance.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should return null for null input', () => {
      expect(tokenCryptoInstance.decrypt(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(tokenCryptoInstance.decrypt(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(tokenCryptoInstance.decrypt('')).toBeNull();
    });

    it('should throw error for invalid encrypted token format', () => {
      expect(() => tokenCryptoInstance.decrypt('invalid-format')).toThrow('Failed to decrypt token');
      expect(logger.error).toHaveBeenCalledWith('❌ Token decryption failed:', expect.any(Error));
    });

    it('should throw error for malformed encrypted data', () => {
      expect(() => tokenCryptoInstance.decrypt('invalid:format:too:many:parts')).toThrow('Failed to decrypt token');
    });

    it('should throw error for invalid hex data', () => {
      expect(() => tokenCryptoInstance.decrypt('invalid-hex:invalid-hex')).toThrow('Failed to decrypt token');
    });

    it('should handle various encrypted tokens correctly', () => {
      const testTokens = [
        'access-token-12345',
        'refresh-token-abcdef',
        'very-secret-token-with-special-chars!@#',
        'короткий-токен', // Unicode
        JSON.stringify({ type: 'complex', data: 'token' }),
      ];

      testTokens.forEach(token => {
        const encrypted = tokenCryptoInstance.encrypt(token);
        const decrypted = tokenCryptoInstance.decrypt(encrypted);
        expect(decrypted).toBe(token);
      });
    });

    it('should fail with wrong encryption key', () => {
      const plaintext = 'test-token';
      const encrypted = tokenCryptoInstance.encrypt(plaintext);

      // Create new instance with different key
      process.env.TOKEN_ENCRYPTION_KEY = '87654321098765432109876543210987';
      const differentKeyInstance = new TokenCrypto();

      expect(() => differentKeyInstance.decrypt(encrypted)).toThrow('Failed to decrypt token');
    });
  });

  describe('isEncrypted', () => {
    let tokenCryptoInstance;

    beforeEach(() => {
      process.env.TOKEN_ENCRYPTION_KEY = '12345678901234567890123456789012';
      tokenCryptoInstance = new TokenCrypto();
    });

    it('should return true for encrypted tokens', () => {
      const plaintext = 'test-token';
      const encrypted = tokenCryptoInstance.encrypt(plaintext);

      expect(tokenCryptoInstance.isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plaintext tokens', () => {
      expect(tokenCryptoInstance.isEncrypted('plaintext-token')).toBe(false);
    });

    it('should return falsy for null', () => {
      expect(tokenCryptoInstance.isEncrypted(null)).toBeFalsy();
    });

    it('should return falsy for undefined', () => {
      expect(tokenCryptoInstance.isEncrypted(undefined)).toBeFalsy();
    });

    it('should return falsy for empty string', () => {
      expect(tokenCryptoInstance.isEncrypted('')).toBeFalsy();
    });

    it('should return false for non-string values', () => {
      expect(tokenCryptoInstance.isEncrypted(123)).toBe(false);
      expect(tokenCryptoInstance.isEncrypted({})).toBe(false);
      expect(tokenCryptoInstance.isEncrypted([])).toBe(false);
      expect(tokenCryptoInstance.isEncrypted(true)).toBe(false);
    });

    it('should return false for strings without colon', () => {
      expect(tokenCryptoInstance.isEncrypted('no-colon-here')).toBe(false);
    });

    it('should return false for strings with wrong colon count', () => {
      expect(tokenCryptoInstance.isEncrypted('one:colon')).toBe(true); // This actually has exactly 2 parts
      expect(tokenCryptoInstance.isEncrypted('three:colons:here')).toBe(false); // 3 parts
      expect(tokenCryptoInstance.isEncrypted('four:colons:here:now')).toBe(false); // 4 parts
    });

    it('should return true for manually formatted encrypted-like strings', () => {
      // This should return true even if not actually encrypted, as long as format matches
      expect(tokenCryptoInstance.isEncrypted('fake:encrypted')).toBe(true);
    });
  });

  describe('Singleton instance', () => {
    it('should export singleton tokenCrypto instance', () => {
      expect(tokenCrypto).toBeInstanceOf(TokenCrypto);
    });

    it('should return same instance on multiple requires', () => {
      // Clear module cache to test singleton behavior
      delete require.cache[require.resolve('../../../src/utils/crypto')];
      const { tokenCrypto: tokenCrypto1 } = require('../../../src/utils/crypto');
      
      delete require.cache[require.resolve('../../../src/utils/crypto')];
      const { tokenCrypto: tokenCrypto2 } = require('../../../src/utils/crypto');

      // They should have the same encryption key (though they're new instances due to cache clear)
      expect(tokenCrypto1.encryptionKey).toBe(tokenCrypto2.encryptionKey);
    });
  });

  describe('Helper functions', () => {
    beforeEach(() => {
      process.env.TOKEN_ENCRYPTION_KEY = '12345678901234567890123456789012';
    });

    describe('encryptToken', () => {
      it('should encrypt tokens using singleton instance', () => {
        const token = 'test-helper-token';
        const encrypted = encryptToken(token);

        expect(encrypted).toBeDefined();
        expect(encrypted).toContain(':');
        expect(isTokenEncrypted(encrypted)).toBe(true);
      });

      it('should handle null input', () => {
        expect(encryptToken(null)).toBeNull();
      });
    });

    describe('decryptToken', () => {
      it('should decrypt tokens using singleton instance', () => {
        const token = 'test-helper-decrypt';
        const encrypted = encryptToken(token);
        const decrypted = decryptToken(encrypted);

        expect(decrypted).toBe(token);
      });

      it('should handle null input', () => {
        expect(decryptToken(null)).toBeNull();
      });

      it('should throw error for invalid input', () => {
        expect(() => decryptToken('invalid')).toThrow('Failed to decrypt token');
      });
    });

    describe('isTokenEncrypted', () => {
      it('should check if token is encrypted using singleton instance', () => {
        const plainToken = 'plain-token';
        const encryptedToken = encryptToken(plainToken);

        expect(isTokenEncrypted(plainToken)).toBe(false);
        expect(isTokenEncrypted(encryptedToken)).toBe(true);
      });

      it('should handle various inputs', () => {
        expect(isTokenEncrypted(null)).toBeFalsy();
        expect(isTokenEncrypted(undefined)).toBeFalsy();
        expect(isTokenEncrypted('')).toBeFalsy();
        expect(isTokenEncrypted('simple')).toBe(false);
        expect(isTokenEncrypted('fake:encrypted')).toBe(true);
      });
    });
  });

  describe('Integration tests', () => {
    beforeEach(() => {
      process.env.TOKEN_ENCRYPTION_KEY = '12345678901234567890123456789012';
    });

    it('should handle complete encrypt-decrypt cycle', () => {
      const originalTokens = [
        'gmail-access-token-abc123',
        'gmail-refresh-token-def456',
        'oauth-state-token-ghi789',
        'session-token-jkl012',
      ];

      originalTokens.forEach(token => {
        // Encrypt using helper
        const encrypted = encryptToken(token);
        
        // Verify it's encrypted
        expect(isTokenEncrypted(encrypted)).toBe(true);
        
        // Decrypt using helper
        const decrypted = decryptToken(encrypted);
        
        // Verify original value
        expect(decrypted).toBe(token);
        
        // Verify original is not encrypted
        expect(isTokenEncrypted(token)).toBe(false);
      });
    });

    it('should maintain consistency across multiple operations', () => {
      const token = 'consistency-test-token';
      
      // Multiple encrypt operations should produce different results
      const encrypted1 = encryptToken(token);
      const encrypted2 = encryptToken(token);
      const encrypted3 = encryptToken(token);
      
      expect(encrypted1).not.toBe(encrypted2);
      expect(encrypted2).not.toBe(encrypted3);
      expect(encrypted1).not.toBe(encrypted3);
      
      // But all should decrypt to the same original
      expect(decryptToken(encrypted1)).toBe(token);
      expect(decryptToken(encrypted2)).toBe(token);
      expect(decryptToken(encrypted3)).toBe(token);
    });

    it('should handle edge cases gracefully', () => {
      const edgeCases = [
        '', // Empty string
        ' ', // Single space
        '\n', // Newline
        '\t', // Tab
        ':', // Single colon
        '::', // Double colon
        'a:b', // Looks encrypted but isn't
        'very:long:token:with:many:colons',
      ];

      edgeCases.forEach(testCase => {
        if (testCase === '') {
          // Empty string returns null on encrypt
          expect(encryptToken(testCase)).toBeNull();
        } else {
          const encrypted = encryptToken(testCase);
          const decrypted = decryptToken(encrypted);
          expect(decrypted).toBe(testCase);
        }
      });
    });
  });
});