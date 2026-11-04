const http = require('http');
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'slides', 'dist-single', 'index.html');
const port = Number(process.argv[2] || 4399);
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(file));
}).listen(port, '127.0.0.1', () => console.log('serving', port));
