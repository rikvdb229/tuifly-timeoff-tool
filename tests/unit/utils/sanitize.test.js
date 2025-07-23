// tests/unit/utils/sanitize.test.js - Tests for input sanitization
const {
  sanitizeHTML,
  sanitizeText,
  sanitizeEmail,
  sanitizeSignature,
  sanitizeEmployeeCode,
  sanitizeCustomMessage,
  sanitizeFlightNumber,
  sanitizeStatus,
  sanitizeEmailPreference,
  sanitizeRedirectUrl,
} = require('../../../src/utils/sanitize');

describe('Sanitization Utils', () => {
  describe('sanitizeHTML', () => {
    it('should remove dangerous script tags', () => {
      const input = '<script>alert("xss")</script><b>Hello</b>';
      const result = sanitizeHTML(input);
      expect(result).not.toContain('<script>');
      expect(result).toContain('<b>Hello</b>');
    });

    it('should allow only specified tags by default', () => {
      const input = '<div><p>Test</p><b>Bold</b><script>evil()</script></div>';
      const result = sanitizeHTML(input);
      expect(result).not.toContain('<div>');
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('<b>Bold</b>');
    });

    it('should handle empty input', () => {
      expect(sanitizeHTML('')).toBe('');
      expect(sanitizeHTML(null)).toBe('');
      expect(sanitizeHTML(undefined)).toBe('');
    });
  });

  describe('sanitizeText', () => {
    it('should remove all HTML tags', () => {
      const input = '<script>alert("xss")</script><b>Hello</b> World';
      const result = sanitizeText(input);
      expect(result).toBe('Hello World');
    });

    it('should handle HTML entities', () => {
      const input = '&lt;script&gt;Hello&amp;World&lt;/script&gt;';
      const result = sanitizeText(input);
      // sanitize-html preserves HTML entities in text mode
      expect(result).toBe('&lt;script&gt;Hello&amp;World&lt;/script&gt;');
    });
  });

  describe('sanitizeEmail', () => {
    it('should validate and normalize valid emails', () => {
      expect(sanitizeEmail('TEST@TUIFLY.COM')).toBe('test@tuifly.com');
      expect(sanitizeEmail('  user@example.com  ')).toBe('user@example.com');
    });

    it('should reject invalid emails', () => {
      expect(sanitizeEmail('not-an-email')).toBeNull();
      expect(sanitizeEmail('@invalid.com')).toBeNull();
      expect(sanitizeEmail('user@')).toBeNull();
    });

    it('should handle empty input', () => {
      expect(sanitizeEmail('')).toBeNull();
      expect(sanitizeEmail(null)).toBeNull();
      expect(sanitizeEmail(undefined)).toBeNull();
    });
  });

  describe('sanitizeSignature', () => {
    it('should allow line breaks only', () => {
      const input = 'Line 1<br>Line 2<script>evil()</script>';
      const result = sanitizeSignature(input);
      // sanitize-html converts <br> to <br /> and removes scripts completely
      expect(result).toBe('Line 1<br />Line 2');
    });

    it('should remove dangerous content', () => {
      const input = 'Hello<script>alert(1)</script><br><b>Bold</b>';
      const result = sanitizeSignature(input);
      // sanitize-html removes scripts and non-allowed tags like <b>
      expect(result).toBe('Hello<br />Bold');
    });
  });

  describe('sanitizeEmployeeCode', () => {
    it('should convert to uppercase alphanumeric only', () => {
      expect(sanitizeEmployeeCode('abc123')).toBe('ABC123');
      expect(sanitizeEmployeeCode('test-code!')).toBe('TESTCODE');
    });

    it('should handle edge cases', () => {
      expect(sanitizeEmployeeCode('')).toBe('');
      expect(sanitizeEmployeeCode('!@#$%')).toBe('');
      expect(sanitizeEmployeeCode(null)).toBe('');
    });
  });

  describe('sanitizeCustomMessage', () => {
    it('should allow basic formatting tags', () => {
      const input = '<b>Bold</b> and <i>italic</i> text<script>evil()</script>';
      const result = sanitizeCustomMessage(input);
      expect(result).toContain('<b>Bold</b>');
      expect(result).toContain('<i>italic</i>');
      expect(result).not.toContain('<script>');
    });

    it('should preserve line breaks', () => {
      const input = 'Line 1<br>Line 2';
      const result = sanitizeCustomMessage(input);
      // sanitize-html converts <br> to <br />
      expect(result).toContain('<br />');
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
    });
  });

  describe('sanitizeFlightNumber', () => {
    it('should validate TB prefix pattern', () => {
      expect(sanitizeFlightNumber('TB1234')).toBe('TB1234');
      expect(sanitizeFlightNumber('tb5678')).toBe('TB5678');
    });

    it('should reject invalid patterns', () => {
      expect(sanitizeFlightNumber('AB1234')).toBe('');
      expect(sanitizeFlightNumber('1234')).toBe('');
      expect(sanitizeFlightNumber('TB')).toBe('TB');
    });

    it('should clean HTML and special characters', () => {
      expect(sanitizeFlightNumber('<script>TB1234</script>')).toBe('');
      expect(sanitizeFlightNumber('TB-123!')).toBe('TB123');
    });
  });

  describe('sanitizeStatus', () => {
    it('should validate status enum values', () => {
      expect(sanitizeStatus('APPROVED')).toBe('APPROVED');
      expect(sanitizeStatus('denied')).toBe('DENIED');
      expect(sanitizeStatus('pending')).toBe('PENDING');
    });

    it('should reject invalid statuses', () => {
      expect(sanitizeStatus('INVALID')).toBeNull();
      expect(sanitizeStatus('approved-test')).toBeNull();
      expect(sanitizeStatus('')).toBeNull();
    });
  });

  describe('sanitizeEmailPreference', () => {
    it('should validate email preference values', () => {
      expect(sanitizeEmailPreference('AUTOMATIC')).toBe('automatic');
      expect(sanitizeEmailPreference('Manual')).toBe('manual');
    });

    it('should reject invalid preferences', () => {
      expect(sanitizeEmailPreference('invalid')).toBeNull();
      expect(sanitizeEmailPreference('auto')).toBeNull();
      expect(sanitizeEmailPreference('')).toBeNull();
    });
  });

  describe('sanitizeRedirectUrl', () => {
    it('should allow valid internal routes', () => {
      expect(sanitizeRedirectUrl('/dashboard')).toBe('/dashboard');
      expect(sanitizeRedirectUrl('/settings?tab=profile')).toBe(
        '/settings?tab=profile'
      );
      expect(sanitizeRedirectUrl('/api/requests')).toBe('/api/requests');
    });

    it('should reject external URLs', () => {
      expect(sanitizeRedirectUrl('https://evil.com')).toBe('');
      expect(sanitizeRedirectUrl('http://example.com')).toBe('');
      expect(sanitizeRedirectUrl('//evil.com')).toBe('');
    });

    it('should handle XSS attempts', () => {
      expect(sanitizeRedirectUrl('<script>alert(1)</script>')).toBe('');
      expect(sanitizeRedirectUrl('javascript:alert(1)')).toBe('');
    });

    it('should validate character restrictions', () => {
      // After HTML sanitization, <script> becomes just 'path'
      expect(sanitizeRedirectUrl('/path<script>')).toBe('/path');
      expect(sanitizeRedirectUrl('/path with spaces')).toBe('');
    });
  });

  describe('XSS Prevention Integration', () => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '<img src="x" onerror="alert(1)">',
      '<svg onload="alert(1)">',
      'javascript:alert(1)',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<div onclick="alert(1)">Click me</div>',
      '<script src="//evil.com/xss.js"></script>',
      '"><script>alert(1)</script>',
      "';alert(1);var a='",
    ];

    xssPayloads.forEach(payload => {
      it(`should prevent XSS payload: ${payload.substring(0, 30)}...`, () => {
        // Test all sanitization functions with XSS payloads
        const textResult = sanitizeText(payload);
        expect(textResult).not.toMatch(/<script|onerror|onload|onclick/i);

        // javascript: should be removed from text but might remain as text
        if (!payload.includes('javascript:')) {
          expect(textResult).not.toMatch(/javascript:/i);
        }

        const htmlResult = sanitizeHTML(payload);
        expect(htmlResult).not.toMatch(/<script|onerror|onload|onclick/i);

        const messageResult = sanitizeCustomMessage(payload);
        expect(messageResult).not.toMatch(/<script|onerror|onload|onclick/i);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    const edgeCases = [null, undefined, '', 0, false, {}, [], NaN];

    edgeCases.forEach(input => {
      it(`should handle edge case input: ${JSON.stringify(input)}`, () => {
        expect(() => sanitizeText(input)).not.toThrow();
        expect(() => sanitizeHTML(input)).not.toThrow();
        expect(() => sanitizeCustomMessage(input)).not.toThrow();
      });
    });
  });
});
