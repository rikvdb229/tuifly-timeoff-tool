// FILE: scripts/test-calendar-features.js
// Test script to verify calendar functionality

const fetch = require('node-fetch'); // You might need: npm install node-fetch

const API_BASE = 'http://localhost:3000/api';

async function testCalendarFeatures() {
  console.log('🧪 Testing Calendar Features...\n');

  try {
    // Test 1: Check API is running
    console.log('1️⃣ Testing API connectivity...');
    const healthResponse = await fetch('http://localhost:3000/health');
    const healthData = await healthResponse.json();
    console.log('✅ API is running:', healthData.status);

    // Test 2: Get existing requests
    console.log('\n2️⃣ Testing existing requests...');
    const requestsResponse = await fetch(`${API_BASE}/requests`);
    const requestsData = await requestsResponse.json();
    console.log(`✅ Found ${requestsData.count} existing requests`);

    // Test 3: Create a group request
    console.log('\n3️⃣ Testing group request creation...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 65); // Within the 60-120 day window

    const groupRequestData = {
      dates: [
        {
          date: tomorrow.toISOString().split('T')[0],
          type: 'REQ_DO',
        },
        {
          date: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          type: 'PM_OFF',
        },
      ],
      customMessage: 'Test group request from calendar',
    };

    const createResponse = await fetch(`${API_BASE}/requests/group`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(groupRequestData),
    });

    const createData = await createResponse.json();

    if (createData.success) {
      console.log('✅ Group request created successfully');
      console.log(`   Group ID: ${createData.groupId}`);
      console.log(`   Created ${createData.data.length} linked requests`);

      // Test 4: Get group by ID
      console.log('\n4️⃣ Testing group retrieval...');
      const groupResponse = await fetch(
        `${API_BASE}/requests/group/${createData.groupId}`
      );
      const groupData = await groupResponse.json();

      if (groupData.success) {
        console.log(`✅ Retrieved group with ${groupData.count} requests`);
      } else {
        console.log('❌ Failed to retrieve group:', groupData.error);
      }
    } else {
      console.log('❌ Failed to create group request:', createData.error);
    }

    // Test 5: Check conflict detection
    console.log('\n5️⃣ Testing conflict detection...');
    const conflictResponse = await fetch(
      `${API_BASE}/requests/conflicts?startDate=${tomorrow.toISOString().split('T')[0]}&endDate=${tomorrow.toISOString().split('T')[0]}`
    );
    const conflictData = await conflictResponse.json();

    if (conflictData.success) {
      console.log(
        `✅ Conflict detection working: ${conflictData.hasConflicts ? 'Found conflicts' : 'No conflicts'}`
      );
    } else {
      console.log('❌ Conflict detection failed:', conflictData.error);
    }

    console.log('\n🎉 All tests completed!');
    console.log('\n📋 Next steps:');
    console.log('   1. Open http://localhost:3000 in your browser');
    console.log('   2. Try clicking on calendar dates to select them');
    console.log('   3. Create a multi-day request using the floating button');
    console.log('   4. Verify the requests appear on the calendar with colors');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Make sure the server is running: npm run dev');
  }
}

// Run tests if called directly
if (require.main === module) {
  testCalendarFeatures();
}

module.exports = { testCalendarFeatures };
