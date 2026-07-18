const fs = require('fs');
const glob = require('glob'); // Node standard library doesn't have glob, let me just traverse manually or use find

const { execSync } = require('child_process');

// Find all ts and tsx files
const files = execSync('find src -type f -name "*.tsx" -o -name "*.ts"').toString().trim().split('\n');

let count = 0;
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  
  // Replace toFixed(4) and toFixed(2) with toFixed(3)
  content = content.replace(/\.toFixed\(4\)/g, '.toFixed(3)');
  content = content.replace(/\.toFixed\(2\)/g, '.toFixed(3)');
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    count++;
  }
});
console.log(`Updated ${count} frontend files.`);
