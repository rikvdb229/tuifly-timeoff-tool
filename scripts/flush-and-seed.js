// scripts/flush-and-seed.js
require('dotenv').config();
const { sequelize } = require('../src/models');
const seedRosterData = require('./seed-roster-data');
const { logger } = require('../src/utils/logger');

async function flushAndSeedDatabase() {
  try {
    logger.info('🗄️ Starting database flush and seed process...');
    
    // Step 1: Drop all tables manually in correct order
    logger.info('📊 Dropping all existing tables...');
    
    // Drop tables in dependency order (child tables first)
    const tablesToDrop = [
      'email_replies',
      'time_off_requests', 
      'user_settings',
      'users',
      'email_templates',
      'roster_schedules',
      'app_settings'
    ];

    for (const tableName of tablesToDrop) {
      try {
        await sequelize.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
        logger.info(`   ✅ Dropped table: ${tableName}`);
      } catch (error) {
        logger.warn(`   ⚠️  Could not drop table ${tableName}: ${error.message}`);
      }
    }
    
    logger.info('✅ All tables dropped successfully');
    
    // Step 2: Recreate all tables with new schema
    logger.info('🔨 Creating tables with new schema (including EmailReply)...');
    await sequelize.sync({ force: true });
    logger.info('✅ All tables created with new schema');
    
    // Step 3: Seed roster data
    logger.info('📅 Seeding roster data...');
    
    // Don't close connection, just run the roster seeding with current connection
    const { RosterSchedule } = require('../src/models');
    
    // First, check if any roster schedules already exist
    const existingCount = await RosterSchedule.count();
    if (existingCount > 0) {
      logger.warn(`Found ${existingCount} existing roster schedules. Clearing them first...`);
      await RosterSchedule.destroy({ where: {} });
    }

    // Roster data from seed script
    const rosterData = [
      {
        publicationDate: '2024-10-31',
        latestRequestDate: '2024-10-03',
        startPeriod: '2024-12-16',
        endPeriod: '2024-12-29',
        isActive: true,
      },
      {
        publicationDate: '2024-11-15',
        latestRequestDate: '2024-10-17',
        startPeriod: '2024-12-30',
        endPeriod: '2025-01-12',
        isActive: true,
      },
      {
        publicationDate: '2024-11-29',
        latestRequestDate: '2024-10-31',
        startPeriod: '2025-01-13',
        endPeriod: '2025-01-26',
        isActive: true,
      },
      {
        publicationDate: '2024-12-13',
        latestRequestDate: '2024-11-14',
        startPeriod: '2025-01-27',
        endPeriod: '2025-02-09',
        isActive: true,
      },
      {
        publicationDate: '2024-12-27',
        latestRequestDate: '2024-11-28',
        startPeriod: '2025-02-10',
        endPeriod: '2025-02-23',
        isActive: true,
      },
      {
        publicationDate: '2025-01-10',
        latestRequestDate: '2024-12-12',
        startPeriod: '2025-02-24',
        endPeriod: '2025-03-09',
        isActive: true,
      },
      {
        publicationDate: '2025-01-24',
        latestRequestDate: '2024-12-26',
        startPeriod: '2025-03-10',
        endPeriod: '2025-03-23',
        isActive: true,
      },
      {
        publicationDate: '2025-02-07',
        latestRequestDate: '2025-01-09',
        startPeriod: '2025-03-24',
        endPeriod: '2025-04-06',
        isActive: true,
      },
      {
        publicationDate: '2025-02-21',
        latestRequestDate: '2025-01-23',
        startPeriod: '2025-04-07',
        endPeriod: '2025-04-20',
        isActive: true,
      },
      {
        publicationDate: '2025-03-07',
        latestRequestDate: '2025-02-06',
        startPeriod: '2025-04-21',
        endPeriod: '2025-05-04',
        isActive: true,
      },
      {
        publicationDate: '2025-03-21',
        latestRequestDate: '2025-02-20',
        startPeriod: '2025-05-05',
        endPeriod: '2025-05-18',
        isActive: true,
      },
      {
        publicationDate: '2025-04-18',
        latestRequestDate: '2025-03-20',
        startPeriod: '2025-06-02',
        endPeriod: '2025-06-15',
        isActive: true,
      },
      {
        publicationDate: '2025-05-02',
        latestRequestDate: '2025-04-03',
        startPeriod: '2025-06-16',
        endPeriod: '2025-06-29',
        isActive: true,
      },
      {
        publicationDate: '2025-05-16',
        latestRequestDate: '2025-04-17',
        startPeriod: '2025-06-30',
        endPeriod: '2025-07-13',
        isActive: true,
      },
      {
        publicationDate: '2025-05-30',
        latestRequestDate: '2025-05-01',
        startPeriod: '2025-07-14',
        endPeriod: '2025-07-27',
        isActive: true,
      },
      {
        publicationDate: '2025-06-13',
        latestRequestDate: '2025-05-15',
        startPeriod: '2025-07-28',
        endPeriod: '2025-08-10',
        isActive: true,
      },
      {
        publicationDate: '2025-06-27',
        latestRequestDate: '2025-05-29',
        startPeriod: '2025-08-11',
        endPeriod: '2025-08-24',
        isActive: true,
      },
      {
        publicationDate: '2025-07-11',
        latestRequestDate: '2025-06-12',
        startPeriod: '2025-08-25',
        endPeriod: '2025-09-07',
        isActive: true,
      },
      {
        publicationDate: '2025-07-25',
        latestRequestDate: '2025-06-26',
        startPeriod: '2025-09-08',
        endPeriod: '2025-09-21',
        isActive: true,
      },
      {
        publicationDate: '2025-08-08',
        latestRequestDate: '2025-07-10',
        startPeriod: '2025-09-22',
        endPeriod: '2025-10-05',
        isActive: true,
      },
      {
        publicationDate: '2025-08-22',
        latestRequestDate: '2025-07-24',
        startPeriod: '2025-10-06',
        endPeriod: '2025-10-19',
        isActive: true,
      },
      {
        publicationDate: '2025-09-05',
        latestRequestDate: '2025-08-07',
        startPeriod: '2025-10-20',
        endPeriod: '2025-11-02',
        isActive: true,
      },
      {
        publicationDate: '2025-09-19',
        latestRequestDate: '2025-08-21',
        startPeriod: '2025-11-03',
        endPeriod: '2025-11-16',
        isActive: true,
      },
      {
        publicationDate: '2025-10-03',
        latestRequestDate: '2025-09-04',
        startPeriod: '2025-11-17',
        endPeriod: '2025-11-30',
        isActive: true,
      },
      {
        publicationDate: '2025-10-17',
        latestRequestDate: '2025-09-18',
        startPeriod: '2025-12-01',
        endPeriod: '2025-12-14',
        isActive: true,
      },
      {
        publicationDate: '2025-10-31',
        latestRequestDate: '2025-10-02',
        startPeriod: '2025-12-15',
        endPeriod: '2025-12-28',
        isActive: true,
      },
      {
        publicationDate: '2025-11-14',
        latestRequestDate: '2025-10-16',
        startPeriod: '2025-12-29',
        endPeriod: '2026-01-11',
        isActive: true,
      },
      {
        publicationDate: '2025-11-28',
        latestRequestDate: '2025-10-30',
        startPeriod: '2026-01-12',
        endPeriod: '2026-01-25',
        isActive: true,
      },
      {
        publicationDate: '2025-12-12',
        latestRequestDate: '2025-11-13',
        startPeriod: '2026-01-26',
        endPeriod: '2026-02-08',
        isActive: true,
      },
      {
        publicationDate: '2025-12-26',
        latestRequestDate: '2025-11-27',
        startPeriod: '2026-02-09',
        endPeriod: '2026-02-22',
        isActive: true,
      },
    ];

    // Add descriptions to each roster period
    const rostersWithDescriptions = rosterData.map((roster, index) => {
      const startDate = new Date(roster.startPeriod);
      const month = startDate.toLocaleString('en-US', { month: 'long' });
      const year = startDate.getFullYear();

      return {
        ...roster,
        description: `${month} ${year} Roster Period`,
      };
    });

    // Bulk create all roster schedules
    const created = await RosterSchedule.bulkCreate(rostersWithDescriptions);
    logger.info(`✅ Successfully created ${created.length} roster schedules`);
    
    logger.info('🎉 Database flush and seed completed successfully!');
    logger.info('');
    logger.info('📋 New Database Schema Includes:');
    logger.info('   ✅ users table (existing)');
    logger.info('   ✅ time_off_requests table (extended with reply fields)');
    logger.info('   ✅ email_replies table (NEW - for reply management)');
    logger.info('   ✅ email_templates table (existing)');
    logger.info('   ✅ user_settings table (existing)');
    logger.info('   ✅ roster_schedules table (existing, populated)');
    logger.info('   ✅ app_settings table (existing)');
    logger.info('');
    logger.info('🚀 Reply checking system is now ready to use!');
    
  } catch (error) {
    logger.error('❌ Database flush and seed failed:', error);
    throw error;
  }
}

// Run the flush and seed if this file is executed directly
if (require.main === module) {
  flushAndSeedDatabase()
    .then(() => {
      logger.info('✅ Database flush and seed completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('❌ Database flush and seed failed:', error);
      process.exit(1);
    });
}

module.exports = flushAndSeedDatabase;