import worker from '../worker.js';

async function runTests() {
  console.log('=== STARTING TENANT ISOLATION TESTS ===\n');

  // Test 1: ping with SUM token
  console.log('1. Testing ping with SUM token (4651ebd7272e4aae939b)...');
  const pingSumReq = new Request('https://abadiops.com/api/gas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: '4651ebd7272e4aae939b',
      action: 'ping'
    })
  });
  const pingSumRes = await worker.fetch(pingSumReq, {});
  const pingSumData = await pingSumRes.json();
  console.log('   Status:', pingSumRes.status);
  console.log('   Tenant code:', pingSumData.result?.tenant_code);
  console.log('   User name:', pingSumData.result?.name || pingSumData.result?.mechanic_name);
  console.log('   Tenant header:', pingSumRes.headers.get('x-mar-tenant'));
  if (pingSumData.result?.tenant_code !== 'SUM') {
    throw new Error('Test 1 Failed: Expected tenant_code SUM');
  }

  // Test 2: pull_monitoring with SUM system
  console.log('\n2. Testing pull_monitoring with system: SUM...');
  const monSumReq = new Request('https://abadiops.com/api/gas?system=sum', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MAR-System': 'SUM'
    },
    body: JSON.stringify({
      token: '4651ebd7272e4aae939b',
      system: 'SUM',
      action: 'pull_monitoring',
      data: {}
    })
  });
  const monSumRes = await worker.fetch(monSumReq, {});
  const monSumData = await monSumRes.json();
  console.log('   Status:', monSumRes.status);
  console.log('   Target System header:', monSumRes.headers.get('x-target-system'));
  console.log('   Active Engine header:', monSumRes.headers.get('x-active-engine'));
  console.log('   Success:', monSumData.success);
  const sampleMechs = monSumData.result?.mechanics?.slice(0, 3).map(m => m.name || m.mechanic_name);
  console.log('   Sample mechanics returned:', sampleMechs);
  // SUM sample should contain SUM mechanics like Gilang Ramadhan or Yulius Kevin
  if (!sampleMechs || sampleMechs.includes('Regista Pratama') || sampleMechs.includes('Gusti Raka Pamungkas')) {
    throw new Error('Test 2 Failed: SUM monitoring returned KMB mechanics!');
  }
  console.log('   PASS: Correctly returned SUM mechanics (isolated from KMB)!');

  // Test 3: pull_create_refs with SUM system
  console.log('\n3. Testing pull_create_refs with system: SUM...');
  const refsSumReq = new Request('https://abadiops.com/api/gas?system=sum', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MAR-System': 'SUM'
    },
    body: JSON.stringify({
      token: '4651ebd7272e4aae939b',
      system: 'SUM',
      action: 'pull_create_refs',
      data: {}
    })
  });
  const refsSumRes = await worker.fetch(refsSumReq, {});
  const refsSumData = await refsSumRes.json();
  console.log('   Status:', refsSumRes.status);
  console.log('   Target System header:', refsSumRes.headers.get('x-target-system'));
  const sampleUnits = refsSumData.result?.refs?.units?.slice(0, 3).map(u => u.unit_name || u.name || u.unit_id);
  console.log('   Sample units returned:', sampleUnits);
  if (!sampleUnits || sampleUnits.some(u => String(u).toLowerCase().startsWith('sdvs') || String(u).toLowerCase().startsWith('dlcd'))) {
    throw new Error('Test 3 Failed: SUM refs returned KMB units!');
  }
  console.log('   PASS: Correctly returned SUM units (e.g. ROTABLE, SUM 011)!');

  // Test 4: pull_monitoring with KMB system (Supabase Singapore)
  console.log('\n4. Testing pull_monitoring with system: KMB (Supabase)...');
  const monKmbReq = new Request('https://abadiops.com/api/gas?system=kmb&engine=supabase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MAR-System': 'KMB',
      'X-Active-Engine': 'SUPABASE'
    },
    body: JSON.stringify({
      token: '52fdb552231348ffb14a',
      system: 'KMB',
      engine: 'SUPABASE',
      action: 'pull_monitoring',
      data: {}
    })
  });
  const monKmbRes = await worker.fetch(monKmbReq, {});
  const monKmbData = await monKmbRes.json();
  console.log('   Status:', monKmbRes.status);
  console.log('   Active Engine header:', monKmbRes.headers.get('x-active-engine'));
  console.log('   KMB sample mechanics:', monKmbData.result?.mechanics?.slice(0, 3).map(m => m.name || m.mechanic_name));
  if (monKmbRes.headers.get('x-active-engine') !== 'SUPABASE') {
    throw new Error('Test 4 Failed: Expected SUPABASE engine for KMB');
  }
  console.log('   PASS: KMB continues using Supabase Singapore as expected!');

  console.log('\n=== ALL 4 TENANT ISOLATION TESTS PASSED! ===');
}

runTests().catch(err => {
  console.error('\nTest failed:', err);
  process.exit(1);
});

