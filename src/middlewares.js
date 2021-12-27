import { getLogger } from './helpers'
const logger = getLogger('app')

function _logRequest(req, res) {
  const time = (Date.now() - req.start)
  const method = res.statusCode < 400 ? 'info' : 'warn'
  logger[method]('request %s %s handled statusCode: %s in time: %sms',
    req.method,
    req.originalUrl,
    res.statusCode,
    time
  )
}

export function requestLogger(req, res, next) {
  req.start = Date.now()
  res.on('close', evt => {
    _logRequest(req, res)
  })
  next()
}
