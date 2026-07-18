const fs = require('fs');
const files = [
  'src/interfaces/controllers/ASNController.ts',
  'scratch/setup_asn.ts',
  'scratch/update_sp_allocate_bin.ts'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/0\.0000/g, '0.000');
  content = content.replace(/DECIMAL\(18,4\)/g, 'DECIMAL(18,3)');
  fs.writeFileSync(file, content, 'utf8');
});
console.log('Backend files updated successfully');
