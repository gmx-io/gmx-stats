import * as https from 'https'
import * as http from 'http'
import * as fs from 'fs'

import express from 'express';

let app = require('./server').default;

if (module.hot) {
  module.hot.accept('./server', function() {
    console.log('🔁  HMR Reloading `./server`...');
    try {
      app = require('./server').default;
    } catch (error) {
      console.error(error);
    }
  });
  console.info('✅  Server-side HMR Enabled!');
}

const port = process.env.PORT || 3105;
const isProduction = process.env.NODE_ENV === 'production' && !process.env.DEV
let httpsPort
let keyPath
let certPath
let passphrase

if (isProduction) {
  httpsPort = 443
  certPath = '/etc/letsencrypt/live/stats.gmx.io/fullchain.pem'
  keyPath = '/etc/letsencrypt/live/stats.gmx.io/privkey.pem'
} else {
  httpsPort = Number(port) + 10
  keyPath = './key.pem'
  certPath = './cert.pem'
  passphrase = '123456'
}

function cb(err, port) {
  if (err) {
    console.error(err);
    return;
  }
  console.log(`> Started https on port ${httpsPort}`);
}

http.createServer(app).listen(port, err => cb(err, port))

if (isProduction) {
  https.createServer({
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
    passphrase
  }, app).listen(httpsPort, err => cb(err, httpsPort))

}
