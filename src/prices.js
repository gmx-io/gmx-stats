import { gql } from '@apollo/client'

import { getLogger } from './helpers'
import TtlCache from './ttl-cache'
import { addresses, ARBITRUM, AVALANCHE } from './addresses'
import { toReadable, sleep } from './utils'
import { getPricesClient } from './graph'
import { isEqual } from 'lodash'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const logger = getLogger('prices')
const ttlCache = new TtlCache(60, 1000)

const PERIOD_TO_SECONDS = {
  '5m': 60 * 5,
  '15m': 60 * 15,
  '1h': 60 * 60,
  '4h': 60 * 60 * 4,
  '1d': 60 * 60 * 24,
}
const VALID_PERIODS = new Set(Object.keys(PERIOD_TO_SECONDS))

/*
  {
    [42161]: {
      "0x123123": {
        "15m": []
      }
    }
  }
*/
const cachedPrices = {
  [ARBITRUM]: {},
  [AVALANCHE]: {}
}
const seenPrices = new Set()
// both Arbitrum and Avalanche don't have older prices
const PRICE_START_TIMESTAMP = Math.floor(+new Date(2022, 0, 6) / 1000) // 6th of January 2022
function putPriceIntoCache(prices, chainId, append) {
  if (append === undefined) {
    throw new Error('Explicit append is required')
  }
  const start = Date.now()
  if (!prices || !chainId) {
    throw new Error('Invalid arguments')
  }
  
  let ret = true
  const groupByTokenAndPeriod = prices.reduce((acc, price) => {
    const token = price.token
    if (!acc[token]) {
      acc[token] = {}
    }
    if (!acc[token][price.period]) {
      acc[token][price.period] = []
    }
    if (price.timestamp < PRICE_START_TIMESTAMP) {
      ret = false
      return acc;
    }
    acc[token][price.period].push(price)
    return acc
  }, {})
  
  function priceToCandle(price) {
    return {
      t: price.timestamp,
      o: Number((price.open / 1e30).toFixed(2)),
      c: Number((price.close / 1e30).toFixed(2)),
      h: Number((price.high / 1e30).toFixed(2)),
      l: Number((price.low / 1e30).toFixed(2))
    }
  }

  for (const token in groupByTokenAndPeriod) {
    for (let [period, prices_] of Object.entries(groupByTokenAndPeriod[token])) {
      if (prices_.length === 0) {
        continue
      }
      const firstCandle = priceToCandle(prices_[prices_.length - 1]) // prices are requested in descending order
      const candles = prices_.filter(price => {
        if (seenPrices.has(price.id)) {
          return false
        }
        seenPrices.add(price.id)
        return true
      }).reverse().map(priceToCandle)

      cachedPrices[chainId][token] = cachedPrices[chainId][token] || {}
      cachedPrices[chainId][token][period] = cachedPrices[chainId][token][period] || []
      if (append) {
        const l = cachedPrices[chainId][token][period].length
        const lastStoredCandle = cachedPrices[chainId][token][period][l - 1]
        if (lastStoredCandle && !isEqual(lastStoredCandle, firstCandle)) {
          logger.debug("replace data for last stored candle token: %s close before: %s close after: %s",
            token,
            lastStoredCandle.c,
            firstCandle.c
          )
          // replace last stored candle with the new one with the same timestamp
          cachedPrices[chainId][token][period][l - 1] = firstCandle
        }
        cachedPrices[chainId][token][period].push(...candles)
      } else {
        cachedPrices[chainId][token][period].unshift(...candles)
      }
      
      if (!IS_PRODUCTION) {
        let prev = null
        cachedPrices[chainId][token][period].forEach(p => {
          if (prev && p.t < prev.t) {
            throw new Error(`Invalid order chainId ${chainId} token ${token} period ${period}`)
          }
          if (prev && p.t === prev.t) {
            throw new Error(`Duplicated timestamp chainId ${chainId} token ${token} period ${period}`)
          }
          prev = p
        })
      }
    }
  }
  logger.info("Put %s prices into cache total chain %s took %sms hostname: %s",
    prices.length,
    chainId,
    Date.now() - start,
    process.env.HOSTNAME
  )
  
  return ret
}

function getPriceRange(prices, from, to, inbound = false) {
  const indexFrom = binSearchPrice(prices, from, inbound)
  const indexTo = binSearchPrice(prices, to, !inbound) + 1

  return prices.slice(indexFrom, indexTo)
}

function binSearchPrice(prices, timestamp, gt = true) {
  let left = 0
  let right = prices.length - 1
  let mid
  while (left + 1 < right) {
    mid = Math.floor((left + right) / 2)
    if (prices[mid].t < timestamp) {
      left = mid
    } else {
      right = mid
    }
  }
  const ret = gt ? right : left
  return ret
}

function getPricesLimit(limit, preferableChainId = ARBITRUM, symbol, period) {
  const prices = getPrices(preferableChainId, symbol, period)
  return prices.slice(Math.max(prices.length - limit, 0))
}

function getPricesFromTo(from, to, preferableChainId = ARBITRUM, symbol, period) {
  const start = Date.now()
  const cacheKey = `${from}:${to}:${preferableChainId}:${symbol}:${period}`
  const fromCache = ttlCache.get(cacheKey)
  if (fromCache) {
    logger.debug('from cache')
    return fromCache
  }

  const prices = getPriceRange(getPrices(preferableChainId, symbol, period), from, to)
  ttlCache.set(cacheKey, prices)
  logger.info('getPricesFromTo took %sms cacheKey %s', Date.now() - start, cacheKey)
  return prices
}

function getPrices(preferableChainId = ARBITRUM, symbol, period) {
  const tokenAddress = addresses[preferableChainId][symbol]?.toLowerCase()
  if (!tokenAddress) {
    return []
  }
  if (!cachedPrices[preferableChainId]) {
    return []
  }
  if (!cachedPrices[preferableChainId][tokenAddress]) {
    return []
  }
  if (!cachedPrices[preferableChainId][tokenAddress][period]) {
    return []
  }
  
  return cachedPrices[preferableChainId][tokenAddress][period]
}

let latestUpdateTimestamp = Math.floor(Date.now() / 1000)
const CANDLE_PROPS = 'timestamp token period id open high low close'

async function loadNewPrices(chainId, period) {
  const logger = getLogger('prices.loadNewPrices')
  if (!chainId) {
    throw new Error('requires chainId')
  }
  logger.info('chainId: %s period: %s',
    chainId,
    period
  )
  
  const getQuery = (after) => `{
    priceCandles(
      first: 1000
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_gte: ${after}, period: "${period}" }
    ) { ${CANDLE_PROPS} }
  }`

  const graphClient = getPricesClient(chainId)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      let after = Math.floor(Date.now() / 1000 / PERIOD_TO_SECONDS[period]) * PERIOD_TO_SECONDS[period]

      const query = getQuery(after)
      const start = Date.now()
      logger.info("requesting prices after %s for period %s", toReadable(after), period)
      const { data } = await graphClient.query({ query: gql(query) })
      logger.info("request done in %sms", Date.now() - start)
      latestUpdateTimestamp = Math.floor(Date.now() / 1000)
      const prices = data.priceCandles

      if (prices.length === 0) {
        logger.info("No prices returned")
      } else {
        logger.info("chainId: %s period: %s prices: %s", chainId, period, prices.length)
        putPriceIntoCache(prices, chainId, true)
        after = prices[0].timestamp
        logger.info("New after: %s", toReadable(after))
      }
    } catch (ex) {
      logger.warn("loop failed")
      logger.warn(ex)
    }
    await sleep(15000)
  }
}

async function loadOldPrices(chainId, period) {
  const logger = getLogger('prices.loadOldPrices')
  if (!chainId) {
    throw new Error('requires chainId')
  }
  logger.info('chainId: %s period: %s',
    chainId,
    period
  )

  const getQueryPart = (before, skip) => `
    priceCandles(
      first: 1000
      skip: ${skip}
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lte: ${before}, period: "${period}" }
    ) { ${CANDLE_PROPS} }
  `
  const getQuery = before => {
    if (period === "1d") {
      return `{
        p0: ${getQueryPart(before, 0)}
      }`
    }
    return `{
      p0: ${getQueryPart(before, 0)}
      p1: ${getQueryPart(before, 1000)}
      p2: ${getQueryPart(before, 2000)}
      p3: ${getQueryPart(before, 3000)}
      p4: ${getQueryPart(before, 4000)}
      p5: ${getQueryPart(before, 5000)}
    }`
  }
  const graphClient = getPricesClient(chainId)

  let before = Math.floor(Date.now() / 1000)
  let seenPrices = new Set()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const query = getQuery(before)
      const start = Date.now()
      logger.info("requesting prices before %s for period %s", toReadable(before), period)
      const { data } = await graphClient.query({ query: gql(query) })
      logger.info("request done in %sms", Date.now() - start)
      if (!data || !data.p0) {
        logger.info("No data returned. Break")
        break
      }
      const prices = []
      for (let i = 0; i < 6; i++) {
        const part = data[`p${i}`]
        if (!part) {
          break
        }
        for (const price of part) {
          if (seenPrices.has(price.id)) {
            continue
          }
          seenPrices.add(price.id)
          prices.push(price)
        }
      }
      if (prices.length === 0) {
        logger.info("No unseen prices returned. Break")
        break
      }
      logger.info("chainId: %s period: %s prices: %s time range %s - %s", chainId, prices.length, period, toReadable(prices[prices.length - 1].timestamp), toReadable(prices[0].timestamp))

      if (!putPriceIntoCache(prices, chainId, false)) {
        logger.info("putPriceIntoCache returned false. Stop")
        break
      }
      before = prices[prices.length - 1].timestamp
      logger.info("New before: %s", toReadable(before))
      await sleep(5000)
    } catch (ex) {
      logger.warn("loop failed, sleep 15 seconds")
      logger.warn(ex)
      await sleep(15000)
    }
  }
}

for (const period of Object.keys(PERIOD_TO_SECONDS)) {
  loadNewPrices(ARBITRUM, period)
  loadNewPrices(AVALANCHE, period)

  loadOldPrices(ARBITRUM, period)
  loadOldPrices(AVALANCHE, period)
}

function getLastUpdatedTimestamp() {
  return latestUpdateTimestamp
}

module.exports = {
  getPricesLimit,
  getPricesFromTo,
  getLastUpdatedTimestamp,
  VALID_PERIODS
}