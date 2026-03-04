const fs = require('fs');
const data = JSON.parse(fs.readFileSync('SX-ADS-20260303-9186.json', 'utf8'));

const raw = data.rawData;
if (!raw) { console.log('No rawData'); process.exit(1); }

console.log('=== rawData keys ===');
console.log(Object.keys(raw));

if (raw.conversionActions) {
  const actions = raw.conversionActions;
  console.log('\nTotal conversion actions:', actions.length);

  // Group by name to find duplicates
  const byName = {};
  actions.forEach(a => {
    const n = (a.name || '').toLowerCase();
    if (!byName[n]) byName[n] = [];
    byName[n].push(a);
  });

  console.log('\n=== DUPLICATE NAMES ===');
  for (const [name, group] of Object.entries(byName)) {
    if (group.length > 1) {
      console.log(`\n"${name}" appears ${group.length} times:`);
      group.forEach((a, i) => {
        console.log(`  [${i+1}] resourceName: ${a.resourceName}`);
        console.log(`      type: ${a.type}`);
        console.log(`      origin: ${a.origin}`);
        console.log(`      category: ${a.category}`);
        console.log(`      status: ${a.status}`);
        console.log(`      primaryForGoal: ${a.primaryForGoal}`);
        console.log(`      countingType: ${a.countingType}`);
        console.log(`      attribution: ${JSON.stringify(a.attributionModelSettings)}`);
      });
    }
  }

  // Also show all call-related actions
  console.log('\n=== ALL CALL-RELATED ACTIONS ===');
  actions.filter(a => a.name && a.name.toLowerCase().includes('call')).forEach(a => {
    console.log(`  "${a.name}"`);
    console.log(`    resource: ${a.resourceName}`);
    console.log(`    type: ${a.type} | origin: ${a.origin} | status: ${a.status}`);
    console.log(`    primary: ${a.primaryForGoal} | counting: ${a.countingType}`);
    console.log('');
  });
}
