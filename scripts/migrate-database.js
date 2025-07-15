// FILE: scripts/migrate-database.js
// Run this script to add the groupId column to existing database

const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function migrateDatabaseToGroupId() {
  try {
    console.log('🔄 Starting database migration...');

    // Check if groupId column exists
    const [results] = await sequelize.query(
      'PRAGMA table_info(time_off_requests);'
    );
    const hasGroupId = results.some((column) => column.name === 'groupId');

    if (!hasGroupId) {
      console.log('📝 Adding groupId column...');

      // Add the groupId column
      await sequelize.query(`
        ALTER TABLE time_off_requests 
        ADD COLUMN groupId VARCHAR(255);
      `);

      // Update existing records with unique groupIds
      const [existingRequests] = await sequelize.query(`
        SELECT id FROM time_off_requests WHERE groupId IS NULL;
      `);

      console.log(
        `🔄 Updating ${existingRequests.length} existing requests with groupIds...`
      );

      for (const request of existingRequests) {
        const groupId = uuidv4();
        await sequelize.query(
          `
          UPDATE time_off_requests 
          SET groupId = :groupId 
          WHERE id = :id;
        `,
          {
            replacements: { groupId, id: request.id },
          }
        );
      }

      console.log('✅ Database migration completed successfully!');
    } else {
      console.log(
        '✅ Database already has groupId column, no migration needed.'
      );
    }

    // Verify the migration
    const [sampleRequest] = await sequelize.query(`
      SELECT id, groupId FROM time_off_requests LIMIT 1;
    `);

    if (sampleRequest.length > 0) {
      console.log(
        '✅ Migration verified - sample request has groupId:',
        sampleRequest[0].groupId
      );
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateDatabaseToGroupId()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateDatabaseToGroupId };
