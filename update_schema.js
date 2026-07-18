const fs = require('fs');
const path = 'database/schema_mariadb.sql';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/DECIMAL\(18,4\)/g, 'DECIMAL(18,3)');
content = content.replace(/0\.0000/g, '0.000');
content = content.replace(/1000\.0000/g, '1000.000');
content = content.replace(/500\.0000/g, '500.000');
content = content.replace(/999999\.0000/g, '999999.000');

fs.writeFileSync(path, content, 'utf8');
console.log('Schema updated successfully');
