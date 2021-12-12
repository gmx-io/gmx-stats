import express from 'express';

import routes from './routes'

const app = express();

app
  .disable('x-powered-by')
  .use(express.static(process.env.RAZZLE_PUBLIC_DIR))
  .use(require('cors')())

app.get('/ping', (req, res) => {
  res.send('ok')
});

routes(app)

export default app;
