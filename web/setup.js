const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '../.env' });

async function setup() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('Checking tenants...');
  
  const { data: tenants, error: tErr } = await supabase.from('tenants').select('*');
  if (tErr) {
    console.error('Error fetching tenants:', tErr);
    return;
  }
  
  let tenantId = process.env.DEFAULT_TENANT_ID;
  if (!tenants || tenants.length === 0) {
    console.log('No tenants found. Creating a default tenant...');
    tenantId = crypto.randomUUID();
    const { error: insErr } = await supabase.from('tenants').insert({ id: tenantId, name: 'Usabit Default' });
    if (insErr) {
      console.error('Error creating tenant:', insErr);
      return;
    }
    console.log('Created tenant:', tenantId);
  } else {
    tenantId = tenants[0].id;
    console.log('Found existing tenant:', tenantId);
  }

  // Update .env file
  const envPath = path.join(__dirname, '../.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(/DEFAULT_TENANT_ID=".+"/, `DEFAULT_TENANT_ID="${tenantId}"`);
  fs.writeFileSync(envPath, envContent);
  console.log('Updated .env with DEFAULT_TENANT_ID');

  // Verify functions
  console.log('Verifying edge functions...');
  const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/ingest-document`, { method: 'OPTIONS' });
  console.log('ingest-document OPTIONS status:', res.status);
}

setup();
