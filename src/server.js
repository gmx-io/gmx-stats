import express from 'express';

import routes from './routes'
import { requestLogger } from './middlewares'

const app = express();

app
  .disable('x-powered-by')
  .use(express.static(process.env.RAZZLE_PUBLIC_DIR))
  .use(require('cors')())
  .use(requestLogger)

app.get('/ping', (req, res, next) => {
  res.send('ok')
  next()
});

routes(app)

export default app;
