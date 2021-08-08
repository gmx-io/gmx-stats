import express from 'express';

import jobs from './jobs'
import routes from './routes'
import { db } from './db'

const app = express();

app
  .disable('x-powered-by')
  .use(express.static(process.env.RAZZLE_PUBLIC_DIR))

app.get('/ping', (req, res) => {
  res.send('ok')
});

routes(app)
jobs({ db })

export default app;
