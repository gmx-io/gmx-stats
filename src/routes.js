import { ethers } from 'ethers'
import React from 'react';
import { StaticRouter } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import fetch from 'cross-fetch';
import sizeof from 'object-sizeof'

import App from './App';
import { ApolloClient, InMemoryCache, gql, HttpLink } from '@apollo/client'
import { getLogger } from './helpers'
import { addresses, ARBITRUM, AVALANCHE } from './addresses'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const assets = require(process.env.RAZZLE_ASSETS_MANIFEST);

const cssLinksFromAssets = (assets, entrypoint) => {
  return assets[entrypoint] ? assets[entrypoint].css ?
  assets[entrypoint].css.map(asset=>
    `<link rel="stylesheet" href="${asset}">`
  ).join('') : '' : '';
};

const jsScriptTagsFromAssets = (assets, entrypoint, extra = '') => {
  return assets[entrypoint] ? assets[entrypoint].js ?
  assets[entrypoint].js.map(asset=>
    `<script src="${asset}"${extra}></script>`
  ).join('') : '' : '';
};

const { formatUnits} = ethers.utils

const logger = getLogger('routes')

const apolloOptions = {
  query: {
    fetchPolicy: 'no-cache'
  },
  watchQuery: {
    fetchPolicy: 'no-cache'
  }
}
const arbitrumGraphClient = new ApolloClient({
  link: new HttpLink({ uri: 'https://api.thegraph.com/subgraphs/name/gmx-io/gmx-stats', fetch }),
  cache: new InMemoryCache(),
  defaultOptions: apolloOptions
})

const avalancheGraphClient = new ApolloClient({
  link: new HttpLink({ uri: 'https://api.thegraph.com/subgraphs/name/gdev8317/gmx-avalanche-staging', fetch }),
  cache: new InMemoryCache(),
  defaultOptions: apolloOptions
})

const cachedPrices = {
  sorted: {
    [ARBITRUM]: {},
    [AVALANCHE]: {}
  },
  byKey: {
    [ARBITRUM]: {},
    [AVALANCHE]: {}
  }
}
const AVALANCHE_LAUNCH_TS = 1641416400
function putPricesIntoCache(prices, chainId, entitiesKey) {
  if (!prices || !chainId || !entitiesKey) {
    throw new Error('Invalid arguments')
  }
  let ret = true
  const precision = entitiesKey === "chainlinkPrices" ? 1e8 : 1e30
  const changedTokens = new Set([])
  const byKeyNs = cachedPrices.byKey
  byKeyNs[chainId][entitiesKey] = byKeyNs[chainId][entitiesKey] || {}
  for (const price of prices) {
    const token = price.token.toLowerCase()
    const timestamp = price.timestamp
    if (chainId === AVALANCHE && entitiesKey === "fastPrices" && timestamp < AVALANCHE_LAUNCH_TS) {
      logger.info("Reject older prices on Avalanche. Price ts: %s launch ts: %s",
        toReadable(timestamp),
        toReadable(AVALANCHE_LAUNCH_TS)
      )
      ret = false
      break
    }
    byKeyNs[chainId][entitiesKey][token] = byKeyNs[chainId][entitiesKey][token] || {}
    byKeyNs[chainId][entitiesKey][token][timestamp] = Number(price.value) / precision
    changedTokens.add(token)
  }

  const sortedNs = cachedPrices.sorted
  sortedNs[chainId][entitiesKey] = sortedNs[chainId][entitiesKey] || {}
  for (const token of changedTokens) {
    sortedNs[chainId][entitiesKey][token] = Object.entries(byKeyNs[chainId][entitiesKey][token])
      .map(([timestamp, price]) => [Number(timestamp), price])
      .sort((a, b) => a[0] - b[0])
  }

  if (!IS_PRODUCTION) {
    console.time('sizeof call')
    const size = sizeof(cachedPrices) / 1024 / 1024
    console.timeEnd('sizeof call')
    let pricesCount = 0
    for (const chainId of Object.keys(cachedPrices.sorted)) {
      for (const entitiesKey of Object.keys(cachedPrices.sorted[chainId])) {
        for (const prices of Object.values(cachedPrices.sorted[chainId][entitiesKey])) {
          pricesCount += prices.length
        }
      }
    }
    logger.debug('Estimated price cache size: %s MB, prices count: %s', size, pricesCount)
  }

  return ret
}

class TtlCache {
  constructor(ttl = 60, maxKeys) {
    this._cache = {}
    this._ttl = ttl
    this._maxKeys = maxKeys
    this._logger = getLogger('routes.TtlCache')
  }

  get(key) {
    this._logger.debug('get key %s', key)
    return this._cache[key]
  }

  set(key, value) {
    this._cache[key] = value

    const keys = Object.keys(this._cache)
    if (this._maxKeys && keys.length >= this._maxKeys) {
      for (let i = 0; i <= keys.length - this._maxKeys; i++) {
        this._logger.debug('delete key %s (max keys)', key)
        delete this._cache[keys[i]]
      }
    }

    setTimeout(() => {
      this._logger.debug('delete key %s (ttl)', key)
      delete this._cache[key]
    }, this._ttl * 1000)

    if (!IS_PRODUCTION) {
      console.time('sizeof call')
      const size = sizeof(this._cache) / 1024 / 1024
      console.timeEnd('sizeof call')
      this._logger.debug('TtlCache cache size %s MB', size)
    }
  }
}
const ttlCache = new TtlCache(60, 100)

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function precacheOldPrices(chainId, entitiesKey) {
  logger.info('precache old prices into memory for %s...', chainId)

  const baseRetryTimeout = 10000
  let oldestTimestamp = parseInt(Date.now() / 1000)
  let i = 0
  let retryTimeout = baseRetryTimeout
  let failCount = 0
  while (i < 100) {
    try {
      const prices = await loadPrices({ before: oldestTimestamp, chainId, entitiesKey })
      if (prices.length === 0) {
        logger.info('All old prices loaded for chain: %s %s', chainId, entitiesKey)
        break
      }

      if (!putPricesIntoCache(prices, chainId, entitiesKey)) {
        logger.info('putPricesIntoCache returned false for chain: %s %s. stop', chainId, entitiesKey)
        break
      }
      oldestTimestamp = prices[prices.length - 1].timestamp - 1
      failCount = 0
      retryTimeout = baseRetryTimeout
    } catch (ex) {
      failCount++
      logger.warn('Old prices load failed')
      logger.error(ex)
      if (failCount > 10) {
        logger.warn('too many load failures for chainId: %s %s. retry in %s seconds',
          chainId, entitiesKey, retryTimeout / 1000)
        await sleep(retryTimeout)
        retryTimeout *= 2
      }
      await sleep(500)
    }
    i++
  }
}
if (!process.env.DISABLE_PRICES) {
  precacheOldPrices(ARBITRUM, "chainlinkPrices")
  precacheOldPrices(ARBITRUM, "fastPrices")
  precacheOldPrices(AVALANCHE, "chainlinkPrices")
  precacheOldPrices(AVALANCHE, "fastPrices")
}

 // on Arbitrum new block may have with timestamps from past...
let newestPriceTimestamp = parseInt(Date.now() / 1000) - 60 * 5
async function precacheNewPrices(chainId, entitiesKey) {
  logger.info('Precache new prices into memory chainId: %s %s...', chainId, entitiesKey)

  try {
    const after = newestPriceTimestamp - 60 * 15 // 15 minutes before last update.
    const prices = await loadPrices({ after, chainId, entitiesKey })
    if (prices.length > 0) {
      logger.info('Loaded %s prices since %s chainId: %s %s',
        prices.length,
        toReadable(after),
        chainId,
        entitiesKey
      )
      if (putPricesIntoCache(prices, chainId, entitiesKey)) {
        newestPriceTimestamp = prices[0].timestamp
      } else {
        logger.warn('Prices were not saved')
      }
    }
  } catch (ex) {
    logger.warn('New prices load failed chainId: %s %s', chainId, entitiesKey)
    logger.error(ex)
  }

  setTimeout(precacheNewPrices, 1000 * 60 * 1, chainId, entitiesKey)
}
if (!process.env.DISABLE_PRICES) {
  precacheNewPrices(ARBITRUM, "chainlinkPrices")
  precacheNewPrices(ARBITRUM, "fastPrices")
  precacheNewPrices(AVALANCHE, "chainlinkPrices")
  precacheNewPrices(AVALANCHE, "fastPrices")
}

async function loadPrices({ before, after, chainId, entitiesKey } = {}) {
  if (!chainId) {
    throw new Error('loadPrices requires chainId')
  }
  if (!entitiesKey) {
    throw new Error('loadPrices requires entitiesKey')
  }
  if (!before) {
    before = parseInt(Date.now() / 1000) + 86400 * 365
  }
  if (!after) {
    after = 0
  }
  logger.info('loadPrices %s chainId: %s before: %s, after: %s',
    entitiesKey,
    chainId,
    toReadable(before),
    after && toReadable(after)
  )

  const fragment = (skip) => {
     return `${entitiesKey}(
      first: 1000
      skip: ${skip}
      orderBy: timestamp
      orderDirection: desc
      where: {
        timestamp_lte: ${before}
        timestamp_gte: ${after}
        period: any
      }
    ) { value, timestamp, token }\n`
  }
  const queryString = `{
    p0: ${fragment(0)}
    p1: ${fragment(1000)}
    p2: ${fragment(2000)}
    p3: ${fragment(3000)}
    p4: ${fragment(4000)}
    p5: ${fragment(5000)}
  }`
  const query = gql(queryString)

  const graphClient = chainId === AVALANCHE ? avalancheGraphClient : arbitrumGraphClient;
  const { data } = await graphClient.query({query})
  const prices = [
    ...data.p0,
    ...data.p1,
    ...data.p2,
    ...data.p3,
    ...data.p4,
    ...data.p5
  ]

  if (prices.length) {
    logger.debug('Loaded %s prices (%s – %s) for chain %s %s',
      prices.length,
      toReadable(prices[prices.length - 1].timestamp),
      toReadable(prices[0].timestamp),
      chainId,
      entitiesKey,
    )
  }

  return prices
}

function toReadable(ts) {
  return (new Date(ts * 1000).toISOString()).replace('T', ' ').replace('.000Z', '')
}

function getPriceRange(sortedPrices, from, to, inbound = false) {
  const indexFrom = binSearchPrice(sortedPrices, from, inbound)
  const indexTo = binSearchPrice(sortedPrices, to, !inbound) + 1

  return [
    sortedPrices.slice(indexFrom, indexTo),
    sortedPrices[0][0]
  ]
}

function binSearchPrice(prices, timestamp, gt = true) {
  let left = 0
  let right = prices.length - 1
  let mid
  while (left + 1 < right) {
    mid = Math.floor((left + right) / 2)
    if (prices[mid][0] < timestamp) {
      left = mid
    } else {
      right = mid
    }
  }
  const ret = gt ? right : left
  return ret
}

function getPrices(from, to, preferableChainId = ARBITRUM, preferableSource = "chainlink", symbol) {
  const start = Date.now()

  if (preferableSource !== "chainlink" && preferableSource !== "fast") {
    throw createHttpError(400, `Invalid preferableSource ${preferableSource}. Valid options are: chainlink, fast`)
  }

  const validSymbols = new Set(['BTC', 'ETH', 'BNB', 'UNI', 'LINK', 'AVAX'])
  if (!validSymbols.has(symbol)) {
    throw createHttpError(400, `Invalid symbol ${symbol}`)
  }
  preferableChainId = Number(preferableChainId)
  const validSources = new Set([ARBITRUM, AVALANCHE])
  if (!validSources.has(preferableChainId)) {
    throw createHttpError(400, `Invalid preferableChainId ${preferableChainId}. Valid options are ${ARBITRUM}, ${AVALANCHE}`)
  }

  const tokenAddress = addresses[preferableChainId][symbol]?.toLowerCase()
  if (!tokenAddress || !cachedPrices.byKey[preferableChainId].chainlinkPrices
    || !cachedPrices.byKey[preferableChainId].chainlinkPrices[tokenAddress]
  ) {
    return []
  }

  const cacheKey = `${from}:${to}:${preferableChainId}:${preferableSource}:${symbol}`
  const fromCache = ttlCache.get(cacheKey)
  if (fromCache) {
    logger.debug('from cache')
    return fromCache
  }

  const entitiesKey = preferableSource === "chainlink" ? "chainlinkPrices" : "fastPrices"

  const sortedPrices = (
    cachedPrices.sorted[preferableChainId]
    && cachedPrices.sorted[preferableChainId][entitiesKey]
    && cachedPrices.sorted[preferableChainId][entitiesKey][tokenAddress]
  ) || []

  let [prices, firstTimestamp] = getPriceRange(sortedPrices, from, to)

  if (preferableSource === "fast" && firstTimestamp > from) {
    // there is no enough fast price data. upfill it with chainlink prices
    const otherSortedPrices = (
      cachedPrices.sorted[preferableChainId]
      && cachedPrices.sorted[preferableChainId].chainlinkPrices
      && cachedPrices.sorted[preferableChainId].chainlinkPrices[tokenAddress]
    ) || []
    const [chainlinkPrices] = getPriceRange(otherSortedPrices, from, firstTimestamp, true)

    prices = [...chainlinkPrices, ...prices]
  }

  ttlCache.set(cacheKey, prices)

  logger.debug('getPrices took %sms cacheKey %s', Date.now() - start, cacheKey)

  return prices
}

const periodsMap = {
  '5m': 60 * 5,
  '15m': 60 * 15,
  '1h': 60 * 60,
  '4h': 60 * 60 * 4,
  '1d': 60 * 60 * 24,
  '1w': 60 * 60 * 24 * 7
}

function getCandles(prices, period) {
  const periodTime = periodsMap[period]

  if (prices.length < 2) {
    return []
  }

  const candles = []
  const first = prices[0]
  let prevTsGroup = Math.floor(first[0] / periodTime) * periodTime
  let prevPrice = first[1]
  let prevTs = first[0]
  let o = prevPrice
  let h = prevPrice
  let l = prevPrice
  let c = prevPrice
  for (let i = 1; i < prices.length; i++) {
    const [ts, price] = prices[i]
    const tsGroup = ts - (ts % periodTime)

    if (prevTs > ts) {
      logger.warn(`Invalid order prevTs: ${prevTs} (${toReadable(prevTs)}) ts: ${ts} (${toReadable(ts)})`)
      continue
    }

    if (prevTsGroup !== tsGroup) {
      candles.push({ t: prevTsGroup, o, h, l, c })
      o = c
      h = o > c ? o : c
      l = o < c ? o : c
    }
    c = price
    h = h > price ? h : price
    l = l < price ? l : price
    prevTsGroup = tsGroup
    prevTs = ts
  }

  return candles
}

function getFromAndTo(req) {
  const granularity = 60 // seconds
  let from = Number(req.query.from) || Math.round(Date.now() / 1000) - 86400 * 90
  from = Math.floor(from / granularity) * granularity
  let to = Number(req.query.to) || Math.round(Date.now() / 1000)
  to = Math.ceil(to / granularity) * granularity

  return [from, to]
}

function createHttpError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

export default function routes(app) {
  app.get('/api/gmx-supply', async (req, res) => {
    const apiResponse = await fetch('https://api.gmx.io/gmx_supply')
    const data = (await apiResponse.text()).toString()
    res.set('Content-Type', 'text/plain')
    res.send(formatUnits(data))
  })

  app.get('/api/chart/:symbol', async (req, res, next) => {
    const [from, to] = getFromAndTo(req)

    let prices
    try {
      prices = getPrices(from, to, req.query.preferableChainId, req.query.preferableSource, req.params.symbol)
    } catch (ex) {
      next(ex)
      return
    }

    res.set('Cache-Control', 'max-age=60')
    res.send(prices)
  })

  app.get('/api/candles/:symbol', async (req, res, next) => {
    const [from, to] = getFromAndTo(req)

    let prices
    try {
      prices = getPrices(from, to, req.query.preferableChainId, req.query.preferableSource, req.params.symbol)
    } catch (ex) {
      next(ex)
      return
    }

    const period = req.query.period?.toLowerCase()
    if (!period || !periodsMap[period]) {
      next(createHttpError(400, `Invalid period. Valid periods are ${Object.keys(periodsMap)}`))
      return
    }

    const candles = getCandles(prices, period)
    let updatedAt
    if (prices.length) {
      updatedAt = prices[prices.length - 1][0]
    }

    res.set('Cache-Control', 'max-age=60')
    res.send({
      prices: candles,
      period,
      updatedAt
    })
  })

  const cssAssetsTag = cssLinksFromAssets(assets, 'client')
  const jsAssetsTag = jsScriptTagsFromAssets(assets, 'client', ' defer crossorigin')

  app.get('/*', (req, res, next) => {
    if (res.headersSent) {
      next()
      return
    }

    const context = {};
    const markup = renderToString(
      <StaticRouter context={context} location={req.url}>
        <App />
      </StaticRouter>
    );
    res.set('Content-Type', 'text/html')

    res.status(200).send(
      `<!doctype html>
          <html lang="">
          <head>
              <meta http-equiv="X-UA-Compatible" content="IE=edge" />
              <meta charset="utf-8" />
              <title>GMX analytics</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <link rel="icon" type="image/png" href="/favicon.png" />
              ${cssAssetsTag}
          </head>
          <body>
              <div id="root">${markup}</div>
              ${jsAssetsTag}
          </body>
      </html>`
    );
    next()
  });

  app.use('/api', function (err, req, res, next) {
    res.set('Content-Type', 'text/plain')
    res.status(err.code || 500)
    if (err.code === 400) {
      res.send(err.message)
    } else {
      res.end()
    }
  })
}