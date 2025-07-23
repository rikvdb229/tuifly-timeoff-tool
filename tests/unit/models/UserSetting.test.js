// tests/unit/models/UserSetting.test.js - Tests for UserSetting model
const { User, UserSetting, sequelize } = require('../../../src/models');

describe('UserSetting Model', () => {
  let testUser;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await UserSetting.destroy({ where: {}, force: true });
    await User.destroy({ where: {}, force: true });
    
    // Create test user
    testUser = await User.create(testUtils.createTestUser());
  });

  describe('Model Creation', () => {
    it('should create user setting with required fields', async () => {
      const settingData = {
        userId: testUser.id,
        settingKey: 'theme',
        settingValue: 'dark',
        settingType: 'string'
      };

      const setting = await UserSetting.create(settingData);

      expect(setting.userId).toBe(testUser.id);
      expect(setting.settingKey).toBe('theme');
      expect(setting.settingValue).toBe('dark');
      expect(setting.settingType).toBe('string');
    });

    it('should validate required fields', async () => {
      await expect(UserSetting.create({})).rejects.toThrow();
      
      await expect(UserSetting.create({
        userId: testUser.id
      })).rejects.toThrow();

      await expect(UserSetting.create({
        settingKey: 'theme'
      })).rejects.toThrow();
    });

    it('should default settingType to string', async () => {
      const setting = await UserSetting.create({
        userId: testUser.id,
        settingKey: 'theme',
        settingValue: 'light'
      });

      expect(setting.settingType).toBe('string');
    });

    it('should validate settingType enum values', async () => {
      const invalidData = {
        userId: testUser.id,
        settingKey: 'theme',
        settingValue: 'light',
        settingType: 'invalid_type'
      };

      await expect(UserSetting.create(invalidData)).rejects.toThrow();
    });

    it('should enforce unique constraint on userId + settingKey', async () => {
      const settingData = {
        userId: testUser.id,
        settingKey: 'theme',
        settingValue: 'light'
      };

      await UserSetting.create(settingData);
      
      await expect(UserSetting.create({
        ...settingData,
        settingValue: 'dark'
      })).rejects.toThrow();
    });
  });

  describe('Instance Methods', () => {
    describe('getTypedValue', () => {
      it('should return string value', async () => {
        const setting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'theme',
          settingValue: 'dark',
          settingType: 'string'
        });

        expect(setting.getTypedValue()).toBe('dark');
      });

      it('should return boolean value', async () => {
        const trueSetting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'notifications',
          settingValue: 'true',
          settingType: 'boolean'
        });

        const falseSetting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'darkMode',
          settingValue: 'false',
          settingType: 'boolean'
        });

        expect(trueSetting.getTypedValue()).toBe(true);
        expect(falseSetting.getTypedValue()).toBe(false);
      });

      it('should return integer value', async () => {
        const setting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'timeout',
          settingValue: '30',
          settingType: 'integer'
        });

        expect(setting.getTypedValue()).toBe(30);
      });

      it('should return float value', async () => {
        const setting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'scale',
          settingValue: '1.5',
          settingType: 'float'
        });

        expect(setting.getTypedValue()).toBe(1.5);
      });

      it('should return parsed JSON value', async () => {
        const jsonValue = { theme: 'dark', colors: ['red', 'blue'] };
        const setting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'preferences',
          settingValue: JSON.stringify(jsonValue),
          settingType: 'json'
        });

        expect(setting.getTypedValue()).toEqual(jsonValue);
      });

      it('should handle invalid JSON gracefully', async () => {
        const setting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'preferences',
          settingValue: 'invalid json',
          settingType: 'json'
        });

        expect(setting.getTypedValue()).toBe('invalid json');
      });

      it('should handle invalid boolean values', async () => {
        const setting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'flag',
          settingValue: 'maybe',
          settingType: 'boolean'
        });

        expect(setting.getTypedValue()).toBe(false);
      });
    });

    describe('setValue', () => {
      it('should set string value', async () => {
        const setting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'theme',
          settingValue: 'light',
          settingType: 'string'
        });

        await setting.setValue('dark');
        await setting.reload();

        expect(setting.settingValue).toBe('dark');
      });

      it('should set boolean value', async () => {
        const setting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'notifications',
          settingValue: 'false',
          settingType: 'boolean'
        });

        await setting.setValue(true);
        await setting.reload();

        expect(setting.settingValue).toBe('true');
        expect(setting.getTypedValue()).toBe(true);
      });

      it('should set integer value', async () => {
        const setting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'timeout',
          settingValue: '10',
          settingType: 'integer'
        });

        await setting.setValue(30);
        await setting.reload();

        expect(setting.settingValue).toBe('30');
        expect(setting.getTypedValue()).toBe(30);
      });

      it('should set JSON value', async () => {
        const setting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'preferences',
          settingValue: '{}',
          settingType: 'json'
        });

        const newValue = { theme: 'dark', notifications: true };
        await setting.setValue(newValue);
        await setting.reload();

        expect(setting.settingValue).toBe(JSON.stringify(newValue));
        expect(setting.getTypedValue()).toEqual(newValue);
      });
    });

    describe('isDefault', () => {
      it('should identify default settings', async () => {
        const defaultSetting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'theme',
          settingValue: 'light',
          isDefault: true
        });

        const customSetting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'language',
          settingValue: 'en',
          isDefault: false
        });

        expect(defaultSetting.isDefault).toBe(true);
        expect(customSetting.isDefault).toBe(false);
      });
    });

    describe('resetToDefault', () => {
      it('should reset to default value', async () => {
        const setting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'theme',
          settingValue: 'dark',
          defaultValue: 'light'
        });

        await setting.resetToDefault();
        await setting.reload();

        expect(setting.settingValue).toBe('light');
      });

      it('should handle missing default value', async () => {
        const setting = await UserSetting.create({
          userId: testUser.id,
          settingKey: 'theme',
          settingValue: 'dark'
        });

        await setting.resetToDefault();
        await setting.reload();

        expect(setting.settingValue).toBe('dark'); // unchanged
      });
    });
  });

  describe('Static Methods', () => {
    beforeEach(async () => {
      // Create test settings
      await UserSetting.create({
        userId: testUser.id,
        settingKey: 'theme',
        settingValue: 'dark',
        settingType: 'string'
      });

      await UserSetting.create({
        userId: testUser.id,
        settingKey: 'notifications',
        settingValue: 'true',
        settingType: 'boolean'
      });

      await UserSetting.create({
        userId: testUser.id,
        settingKey: 'timeout',
        settingValue: '30',
        settingType: 'integer'
      });
    });

    describe('findByUserAndKey', () => {
      it('should find setting by user ID and key', async () => {
        const setting = await UserSetting.findByUserAndKey(testUser.id, 'theme');

        expect(setting).toBeDefined();
        expect(setting.settingKey).toBe('theme');
        expect(setting.settingValue).toBe('dark');
      });

      it('should return null for non-existent setting', async () => {
        const setting = await UserSetting.findByUserAndKey(testUser.id, 'non_existent');
        expect(setting).toBe(null);
      });
    });

    describe('getUserSettings', () => {
      it('should return all settings for user', async () => {
        const settings = await UserSetting.getUserSettings(testUser.id);

        expect(settings).toHaveLength(3);
        expect(settings.map(s => s.settingKey)).toEqual(
          expect.arrayContaining(['theme', 'notifications', 'timeout'])
        );
      });

      it('should return empty array for user with no settings', async () => {
        const otherUser = await User.create(testUtils.createTestUser({
          email: 'other@tuifly.com',
          googleId: 'other_google_id'
        }));

        const settings = await UserSetting.getUserSettings(otherUser.id);
        expect(settings).toHaveLength(0);
      });
    });

    describe('getSettingsMap', () => {
      it('should return settings as key-value map', async () => {
        const settingsMap = await UserSetting.getSettingsMap(testUser.id);

        expect(settingsMap).toEqual({
          theme: 'dark',
          notifications: true,
          timeout: 30
        });
      });

      it('should include typed values', async () => {
        const settingsMap = await UserSetting.getSettingsMap(testUser.id);

        expect(typeof settingsMap.theme).toBe('string');
        expect(typeof settingsMap.notifications).toBe('boolean');
        expect(typeof settingsMap.timeout).toBe('number');
      });
    });

    describe('setSetting', () => {
      it('should create new setting', async () => {
        await UserSetting.setSetting(testUser.id, 'language', 'en', 'string');

        const setting = await UserSetting.findByUserAndKey(testUser.id, 'language');
        expect(setting).toBeDefined();
        expect(setting.settingValue).toBe('en');
        expect(setting.settingType).toBe('string');
      });

      it('should update existing setting', async () => {
        await UserSetting.setSetting(testUser.id, 'theme', 'light', 'string');

        const setting = await UserSetting.findByUserAndKey(testUser.id, 'theme');
        expect(setting.settingValue).toBe('light');
      });

      it('should auto-detect type if not specified', async () => {
        await UserSetting.setSetting(testUser.id, 'auto_boolean', true);
        await UserSetting.setSetting(testUser.id, 'auto_number', 42);
        await UserSetting.setSetting(testUser.id, 'auto_object', { key: 'value' });

        const boolSetting = await UserSetting.findByUserAndKey(testUser.id, 'auto_boolean');
        const numSetting = await UserSetting.findByUserAndKey(testUser.id, 'auto_number');
        const objSetting = await UserSetting.findByUserAndKey(testUser.id, 'auto_object');

        expect(boolSetting.settingType).toBe('boolean');
        expect(numSetting.settingType).toBe('integer');
        expect(objSetting.settingType).toBe('json');
      });
    });

    describe('createDefaultSettings', () => {
      it('should create default settings for user', async () => {
        const newUser = await User.create(testUtils.createTestUser({
          email: 'newuser@tuifly.com',
          googleId: 'new_google_id'
        }));

        await UserSetting.createDefaultSettings(newUser.id);

        const settings = await UserSetting.getUserSettings(newUser.id);
        expect(settings.length).toBeGreaterThan(0);

        const settingsMap = await UserSetting.getSettingsMap(newUser.id);
        expect(settingsMap).toHaveProperty('theme');
        expect(settingsMap).toHaveProperty('notifications');
        expect(settingsMap).toHaveProperty('timezone');
        expect(settingsMap).toHaveProperty('language');
      });

      it('should not create duplicates', async () => {
        await UserSetting.createDefaultSettings(testUser.id);
        const countBefore = await UserSetting.count({ where: { userId: testUser.id } });
        
        await UserSetting.createDefaultSettings(testUser.id);
        const countAfter = await UserSetting.count({ where: { userId: testUser.id } });

        expect(countAfter).toBe(countBefore);
      });
    });

    describe('deleteUserSettings', () => {
      it('should delete all settings for user', async () => {
        expect(await UserSetting.count({ where: { userId: testUser.id } })).toBe(3);

        await UserSetting.deleteUserSettings(testUser.id);

        expect(await UserSetting.count({ where: { userId: testUser.id } })).toBe(0);
      });
    });
  });

  describe('Associations', () => {
    it('should associate with User model', async () => {
      const setting = await UserSetting.create({
        userId: testUser.id,
        settingKey: 'theme',
        settingValue: 'dark'
      });

      const settingWithUser = await UserSetting.findByPk(setting.id, {
        include: [{ model: User }]
      });

      expect(settingWithUser.User).toBeDefined();
      expect(settingWithUser.User.id).toBe(testUser.id);
      expect(settingWithUser.User.email).toBe(testUser.email);
    });

    it('should cascade delete when user is deleted', async () => {
      await UserSetting.create({
        userId: testUser.id,
        settingKey: 'theme',
        settingValue: 'dark'
      });

      expect(await UserSetting.count({ where: { userId: testUser.id } })).toBe(1);

      await testUser.destroy();

      expect(await UserSetting.count({ where: { userId: testUser.id } })).toBe(0);
    });
  });

  describe('Hooks and Validations', () => {
    it('should set timestamps on creation', async () => {
      const setting = await UserSetting.create({
        userId: testUser.id,
        settingKey: 'theme',
        settingValue: 'dark'
      });

      expect(setting.createdAt).toBeDefined();
      expect(setting.updatedAt).toBeDefined();
      expect(setting.createdAt).toBeInstanceOf(Date);
      expect(setting.updatedAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt on modification', async () => {
      const setting = await UserSetting.create({
        userId: testUser.id,
        settingKey: 'theme',
        settingValue: 'dark'
      });

      const originalUpdatedAt = setting.updatedAt;
      
      await testUtils.delay(10);
      
      setting.settingValue = 'light';
      await setting.save();

      expect(setting.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should validate setting key format', async () => {
      const invalidData = {
        userId: testUser.id,
        settingKey: 'invalid key!',
        settingValue: 'value'
      };

      await expect(UserSetting.create(invalidData)).rejects.toThrow();
    });
  });

  describe('Type Conversion Edge Cases', () => {
    it('should handle numeric strings as integers', async () => {
      const setting = await UserSetting.create({
        userId: testUser.id,
        settingKey: 'count',
        settingValue: '42',
        settingType: 'integer'
      });

      expect(setting.getTypedValue()).toBe(42);
    });

    it('should handle decimal strings as floats', async () => {
      const setting = await UserSetting.create({
        userId: testUser.id,
        settingKey: 'rate',
        settingValue: '3.14',
        settingType: 'float'
      });

      expect(setting.getTypedValue()).toBe(3.14);
    });

    it('should handle edge cases in boolean conversion', async () => {
      const trueSetting = await UserSetting.create({
        userId: testUser.id,
        settingKey: 'flag1',
        settingValue: '1',
        settingType: 'boolean'
      });

      const falseSetting = await UserSetting.create({
        userId: testUser.id,
        settingKey: 'flag2',
        settingValue: '0',
        settingType: 'boolean'
      });

      expect(trueSetting.getTypedValue()).toBe(true);
      expect(falseSetting.getTypedValue()).toBe(false);
    });
  });
});