import { getLogger } from './helpers'
const logger = getLogger('app')

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function _logRequest(req, res) {
  const time = (Date.now() - req.start)
  const method = res.statusCode < 400 ? 'info' : 'warn'
  logger[method]('request %s %s handled statusCode: %s in time: %sms referer: %s ip: %s',
    req.method,
    req.originalUrl,
    res.statusCode,
    time,
    req.get('referer'),
    req.ip
  )
}

export function requestLogger(req, res, next) {
  req.start = Date.now()
  res.on('close', evt => {
    _logRequest(req, res)
  })
  next()
}

export function csp(req, res, next) {
  const csp = {
    "default-src": ["'self'"],
    "style-src": ["'self'"],
    "connect-src": [
      "https://arb1.arbitrum.io",
      "https://api.avax.network",
      "https://gmx-server-mainnet.uw.r.appspot.com",
      "https://api.coingecko.com",
      "https://subgraph.satsuma-prod.com"
    ]
  }
  if (!IS_PRODUCTION) {
    csp["default-src"].push("localhost:3114")
    csp["style-src"].push("'unsafe-inline'")
    csp["connect-src"].push("localhost:3114", "ws://localhost:3114")
  }
  const cspString = Object.entries(csp).map(([key, value]) => `${key} ${value.join(' ')}`).join('; ')
  res.set("Content-Security-Policy", cspString)
  next()
}
