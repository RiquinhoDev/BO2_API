const axios = require('axios');
require('dotenv').config();

const CURSEDUCA_API_URL = "https://prof.curseduca.pro";
const CURSEDUCA_API_KEY = "ce9ef2a4afef727919473d38acafe10109c4faa8";
const CURSEDUCA_ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjozLCJ1dWlkIjoiYmZiNmExNjQtNmE5MC00MGFhLTg3OWYtYzEwNGIyZTZiNWVmIiwibmFtZSI6IlBlZHJvIE1pZ3VlbCBQZXJlaXJhIFNpbcO1ZXMgU2FudG9zIiwiZW1haWwiOiJjb250YWN0b3NAc2VycmlxdWluaG8uY29tIiwiaW1hZ2UiOiIvYXBwbGljYXRpb24vaW1hZ2VzL3VwbG9hZHMvMy8iLCJyb2xlcyI6WyJBRE1JTiJdLCJ0ZW5hbnRzIjpbXX0sImlhdCI6MTc1ODE5MDgwMH0.vI_Y9l7oZVIV4OT9XG7LWDIma-E7fcRkVYM7FOCxTds";

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
