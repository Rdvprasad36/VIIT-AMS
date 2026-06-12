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
    console.log("Token received");

    const assetsToSeed = [
      {
        name: "Dell OptiPlex 7090 Tower",
        category: "IT Hardware",
        status: "available",
        purchase_date: "2026-01-15",
        cost: 75000,
        serial_number: "DL-OPT-7090-X1",
        location: "Lab 3"
      },
      {
        name: "Logitech MX Master 3",
        category: "IT Hardware",
        status: "available",
        purchase_date: "2026-02-15",
        cost: 8500,
        serial_number: "LG-MX3-W2",
        location: "Lab 3"
      }
    ];

    assetsToSeed.forEach(asset => {
      const assetData = JSON.stringify(asset);
      const addReq = http.request({
        host: '127.0.0.1',
        port: 3000,
        path: '/api/assets',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': assetData.length,
          'Authorization': `Bearer ${token}`
        }
      }, (res2) => {
        let b2 = '';
        res2.on('data', d => b2 += d);
        res2.on('end', () => console.log('Asset added:', b2));
      });
      addReq.write(assetData);
      addReq.end();
    });
  });
});

loginReq.write(data);
loginReq.end();
