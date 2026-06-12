const http = require('http');

const data = JSON.stringify({
  email: "rdvprasad36@gmail.com",
  password: "020306"
});

const loginReq = http.request({
  host: '127.0.0.1',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const token = JSON.parse(body).token;
    
    const clearReq = http.request({
      host: '127.0.0.1',
      port: 3000,
      path: '/api/audit-logs/clear',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, (res2) => {
      let b2 = '';
      res2.on('data', d => b2 += d);
      res2.on('end', () => {
        console.log('Cleared logs:', b2);
      });
    });
    clearReq.end();
  });
});

loginReq.write(data);
loginReq.end();
