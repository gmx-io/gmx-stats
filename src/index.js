import * as http from 'http'

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
function cb(err, port) {
  if (err) {
    console.error(err);
    return;
  }
  console.log(`> Started server on port ${port}`);
}

http.createServer(app).listen(port, err => cb(err, port))
