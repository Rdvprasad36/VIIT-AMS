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
    console.log("Token:", !!token);

    const checkReq = http.request({
      host: '127.0.0.1',
      port: 3000,
      path: '/api/assets',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, (res2) => {
      let b2 = '';
      res2.on('data', d => b2 += d);
      res2.on('end', () => {
        const assets = JSON.parse(b2);
        console.log('Assets count:', assets.length);
        if (assets.error) console.log(assets.error);
      });
    });
    checkReq.end();
  });
});

loginReq.write(data);
loginReq.end();
