// tests/unit/models/EmailTemplate.test.js - Tests for EmailTemplate model
const { EmailTemplate, sequelize } = require('../../../src/models');

describe('EmailTemplate Model', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await EmailTemplate.destroy({ where: {}, force: true });
  });

  describe('Model Creation', () => {
    it('should create email template with required fields', async () => {
      const templateData = {
        type: 'REQUEST',
        subjectTemplate: '{3LTR_CODE} - CREW REQUEST - {YEAR} - {MONTH_NAME}',
        bodyTemplate: 'Dear,\n\n{REQUEST_LINES}\n\nBrgds,\n{EMPLOYEE_SIGNATURE}',
        isActive: true
      };

      const template = await EmailTemplate.create(templateData);

      expect(template.type).toBe(templateData.type);
      expect(template.subjectTemplate).toBe(templateData.subjectTemplate);
      expect(template.bodyTemplate).toBe(templateData.bodyTemplate);
      expect(template.isActive).toBe(true);
    });

    it('should validate required fields', async () => {
      await expect(EmailTemplate.create({})).rejects.toThrow();
      
      await expect(EmailTemplate.create({
        type: 'REQUEST'
      })).rejects.toThrow();

      await expect(EmailTemplate.create({
        subjectTemplate: 'Test Subject'
      })).rejects.toThrow();
    });

    it('should validate type enum values', async () => {
      const invalidData = {
        type: 'INVALID_TYPE',
        subjectTemplate: 'Test Subject',
        bodyTemplate: 'Test Body',
        isActive: true
      };

      await expect(EmailTemplate.create(invalidData)).rejects.toThrow();
    });

    it('should default isActive to true', async () => {
      const template = await EmailTemplate.create({
        type: 'REQUEST',
        subjectTemplate: 'Test Subject',
        bodyTemplate: 'Test Body'
      });

      expect(template.isActive).toBe(true);
    });

    it('should enforce unique constraint on type', async () => {
      const templateData = {
        type: 'REQUEST',
        subjectTemplate: 'Test Subject',
        bodyTemplate: 'Test Body',
        isActive: true
      };

      await EmailTemplate.create(templateData);
      
      await expect(EmailTemplate.create({
        ...templateData,
        subjectTemplate: 'Different Subject'
      })).rejects.toThrow();
    });
  });

  describe('Instance Methods', () => {
    let template;

    beforeEach(async () => {
      template = await EmailTemplate.create({
        type: 'REQUEST',
        subjectTemplate: '{3LTR_CODE} - CREW REQUEST - {YEAR} - {MONTH_NAME}',
        bodyTemplate: 'Dear,\n\n{REQUEST_LINES}\n\n{CUSTOM_MESSAGE}\n\nBrgds,\n{EMPLOYEE_SIGNATURE}',
        isActive: true
      });
    });

    describe('renderSubject', () => {
      it('should render subject with placeholders', () => {
        const variables = {
          '3LTR_CODE': 'TST',
          'YEAR': '2024',
          'MONTH_NAME': 'February'
        };

        const rendered = template.renderSubject(variables);
        expect(rendered).toBe('TST - CREW REQUEST - 2024 - February');
      });

      it('should handle missing placeholders', () => {
        const variables = {
          '3LTR_CODE': 'TST'
          // Missing YEAR and MONTH_NAME
        };

        const rendered = template.renderSubject(variables);
        expect(rendered).toBe('TST - CREW REQUEST - {YEAR} - {MONTH_NAME}');
      });

      it('should handle empty variables', () => {
        const rendered = template.renderSubject({});
        expect(rendered).toBe('{3LTR_CODE} - CREW REQUEST - {YEAR} - {MONTH_NAME}');
      });

      it('should handle null variables', () => {
        const rendered = template.renderSubject(null);
        expect(rendered).toBe('{3LTR_CODE} - CREW REQUEST - {YEAR} - {MONTH_NAME}');
      });
    });

    describe('renderBody', () => {
      it('should render body with placeholders', () => {
        const variables = {
          'REQUEST_LINES': '01FEB24 REQ DO',
          'CUSTOM_MESSAGE': 'Please approve this request',
          'EMPLOYEE_SIGNATURE': 'John Doe\nTST'
        };

        const rendered = template.renderBody(variables);
        expect(rendered).toContain('01FEB24 REQ DO');
        expect(rendered).toContain('Please approve this request');
        expect(rendered).toContain('John Doe\nTST');
      });

      it('should preserve line breaks', () => {
        const variables = {
          'REQUEST_LINES': 'Line 1\nLine 2',
          'CUSTOM_MESSAGE': 'Message line 1\nMessage line 2',
          'EMPLOYEE_SIGNATURE': 'Name\nCode'
        };

        const rendered = template.renderBody(variables);
        expect(rendered).toContain('Line 1\nLine 2');
        expect(rendered).toContain('Message line 1\nMessage line 2');
        expect(rendered).toContain('Name\nCode');
      });

      it('should handle empty custom message', () => {
        const variables = {
          'REQUEST_LINES': '01FEB24 REQ DO',
          'CUSTOM_MESSAGE': '',
          'EMPLOYEE_SIGNATURE': 'John Doe\nTST'
        };

        const rendered = template.renderBody(variables);
        expect(rendered).toContain('01FEB24 REQ DO');
        expect(rendered).toContain('John Doe\nTST');
        expect(rendered).not.toContain('undefined');
      });
    });

    describe('render', () => {
      it('should render both subject and body', () => {
        const variables = {
          '3LTR_CODE': 'TST',
          'YEAR': '2024',
          'MONTH_NAME': 'February',
          'REQUEST_LINES': '01FEB24 REQ DO',
          'CUSTOM_MESSAGE': 'Test message',
          'EMPLOYEE_SIGNATURE': 'John Doe\nTST'
        };

        const rendered = template.render(variables);

        expect(rendered).toHaveProperty('subject');
        expect(rendered).toHaveProperty('body');
        expect(rendered.subject).toBe('TST - CREW REQUEST - 2024 - February');
        expect(rendered.body).toContain('01FEB24 REQ DO');
        expect(rendered.body).toContain('Test message');
      });
    });

    describe('getPlaceholders', () => {
      it('should extract placeholders from subject and body', () => {
        const placeholders = template.getPlaceholders();

        expect(placeholders).toContain('3LTR_CODE');
        expect(placeholders).toContain('YEAR');
        expect(placeholders).toContain('MONTH_NAME');
        expect(placeholders).toContain('REQUEST_LINES');
        expect(placeholders).toContain('CUSTOM_MESSAGE');
        expect(placeholders).toContain('EMPLOYEE_SIGNATURE');
      });

      it('should return unique placeholders', async () => {
        const templateWithDuplicates = await EmailTemplate.create({
          type: 'REMINDER',
          subjectTemplate: '{3LTR_CODE} - {3LTR_CODE} - REMINDER',
          bodyTemplate: '{REQUEST_LINES}\n\n{REQUEST_LINES}',
          isActive: true
        });

        const placeholders = templateWithDuplicates.getPlaceholders();
        
        expect(placeholders.filter(p => p === '3LTR_CODE')).toHaveLength(1);
        expect(placeholders.filter(p => p === 'REQUEST_LINES')).toHaveLength(1);
      });
    });

    describe('validate', () => {
      it('should validate template with required placeholders', () => {
        const requiredPlaceholders = ['3LTR_CODE', 'REQUEST_LINES'];
        const isValid = template.validate(requiredPlaceholders);
        expect(isValid).toBe(true);
      });

      it('should fail validation with missing placeholders', () => {
        const requiredPlaceholders = ['3LTR_CODE', 'MISSING_PLACEHOLDER'];
        const isValid = template.validate(requiredPlaceholders);
        expect(isValid).toBe(false);
      });

      it('should handle empty required placeholders', () => {
        const isValid = template.validate([]);
        expect(isValid).toBe(true);
      });
    });

    describe('clone', () => {
      it('should create a copy with new type', async () => {
        const cloned = await template.clone('REMINDER');

        expect(cloned.id).not.toBe(template.id);
        expect(cloned.type).toBe('REMINDER');
        expect(cloned.subjectTemplate).toBe(template.subjectTemplate);
        expect(cloned.bodyTemplate).toBe(template.bodyTemplate);
        expect(cloned.isActive).toBe(template.isActive);
      });
    });
  });

  describe('Static Methods', () => {
    beforeEach(async () => {
      await EmailTemplate.create({
        type: 'REQUEST',
        subjectTemplate: 'Request Subject',
        bodyTemplate: 'Request Body',
        isActive: true
      });

      await EmailTemplate.create({
        type: 'REMINDER',
        subjectTemplate: 'Reminder Subject',
        bodyTemplate: 'Reminder Body',
        isActive: true
      });

      await EmailTemplate.create({
        type: 'CONFIRMATION',
        subjectTemplate: 'Confirmation Subject',
        bodyTemplate: 'Confirmation Body',
        isActive: false
      });
    });

    describe('findByType', () => {
      it('should find template by type', async () => {
        const template = await EmailTemplate.findByType('REQUEST');

        expect(template).toBeDefined();
        expect(template.type).toBe('REQUEST');
        expect(template.subjectTemplate).toBe('Request Subject');
      });

      it('should return null for non-existent type', async () => {
        const template = await EmailTemplate.findByType('NON_EXISTENT');
        expect(template).toBe(null);
      });

      it('should find inactive templates', async () => {
        const template = await EmailTemplate.findByType('CONFIRMATION');
        expect(template).toBeDefined();
        expect(template.isActive).toBe(false);
      });
    });

    describe('getActiveTemplates', () => {
      it('should return only active templates', async () => {
        const templates = await EmailTemplate.getActiveTemplates();

        expect(templates).toHaveLength(2);
        expect(templates.every(t => t.isActive === true)).toBe(true);
        expect(templates.map(t => t.type)).toEqual(expect.arrayContaining(['REQUEST', 'REMINDER']));
      });
    });

    describe('getAvailableTypes', () => {
      it('should return all available template types', () => {
        const types = EmailTemplate.getAvailableTypes();

        expect(types).toContain('REQUEST');
        expect(types).toContaine('REMINDER');
        expect(types).toContain('CONFIRMATION');
        expect(types).toContain('APPROVAL');
        expect(types).toContain('DENIAL');
      });
    });

    describe('createDefault', () => {
      it('should create default templates', async () => {
        await EmailTemplate.destroy({ where: {}, force: true });

        await EmailTemplate.createDefault();

        const templates = await EmailTemplate.findAll();
        expect(templates.length).toBeGreaterThan(0);

        const requestTemplate = await EmailTemplate.findByType('REQUEST');
        expect(requestTemplate).toBeDefined();
        expect(requestTemplate.subjectTemplate).toContain('{3LTR_CODE}');
        expect(requestTemplate.bodyTemplate).toContain('{REQUEST_LINES}');
      });

      it('should not create duplicates', async () => {
        const countBefore = await EmailTemplate.count();
        await EmailTemplate.createDefault();
        const countAfter = await EmailTemplate.count();

        expect(countAfter).toBe(countBefore);
      });
    });
  });

  describe('Hooks and Validations', () => {
    it('should set timestamps on creation', async () => {
      const template = await EmailTemplate.create({
        type: 'REQUEST',
        subjectTemplate: 'Test Subject',
        bodyTemplate: 'Test Body',
        isActive: true
      });

      expect(template.createdAt).toBeDefined();
      expect(template.updatedAt).toBeDefined();
      expect(template.createdAt).toBeInstanceOf(Date);
      expect(template.updatedAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt on modification', async () => {
      const template = await EmailTemplate.create({
        type: 'REQUEST',
        subjectTemplate: 'Test Subject',
        bodyTemplate: 'Test Body',
        isActive: true
      });

      const originalUpdatedAt = template.updatedAt;
      
      // Wait a moment to ensure different timestamp
      await testUtils.delay(10);
      
      template.subjectTemplate = 'Updated Subject';
      await template.save();

      expect(template.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should trim whitespace from templates', async () => {
      const template = await EmailTemplate.create({
        type: 'REQUEST',
        subjectTemplate: '  Test Subject  ',
        bodyTemplate: '  Test Body  ',
        isActive: true
      });

      expect(template.subjectTemplate).toBe('Test Subject');
      expect(template.bodyTemplate).toBe('Test Body');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const template = await EmailTemplate.create({
        type: 'REQUEST',
        subjectTemplate: 'Test Subject',
        bodyTemplate: 'Test Body',
        isActive: true
      });

      // Mock database error
      jest.spyOn(template, 'save').mockRejectedValue(new Error('Database error'));

      await expect(template.save()).rejects.toThrow('Database error');
    });

    it('should handle invalid placeholder rendering', () => {
      const template = new EmailTemplate({
        type: 'REQUEST',
        subjectTemplate: '{INVALID_BRACKET',
        bodyTemplate: 'Test Body'
      });

      const rendered = template.renderSubject({ 'INVALID_BRACKET': 'test' });
      expect(rendered).toBe('{INVALID_BRACKET');
    });
  });
});