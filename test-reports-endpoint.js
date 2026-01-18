const axios = require('axios');
require('dotenv').config();

const CURSEDUCA_API_URL = "https://prof.curseduca.pro";
const CURSEDUCA_API_KEY = "***REMOVED-CURSEDUCA-KEY***";
const CURSEDUCA_ACCESS_TOKEN = "***REMOVED-JWT***";

async function testReportsEndpoint() {
  const headers = {
    'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
    'api_key': CURSEDUCA_API_KEY,
    'Content-Type': 'application/json'
  };

  console.log('Testing /reports/group/members endpoint\n');

  const response = await axios.get(
    `${CURSEDUCA_API_URL}/reports/group/members`,
    {
      headers,
      params: { groupId: 7, offset: 0, limit: 3 },
      timeout: 30000
    }
  );

  const members = response.data?.data || [];
  
  console.log(`Total members: ${members.length}\n`);
  
  if (members.length > 0) {
    console.log('Sample member:');
    console.log(JSON.stringify(members[0], null, 2));
  }
}

testReportsEndpoint().catch(console.error);
