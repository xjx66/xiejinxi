// Quick check of the generated HTML/JS structure
const fs = require('fs');
const code = fs.readFileSync('talkinghead.js', 'utf8');
const match = code.match(/function updateTags\(\) \{[\s\S]*?requestAnimationFrame/);
console.log(match ? "Found updateTags" : "Not found");
