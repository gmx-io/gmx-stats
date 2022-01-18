import { ethers } from 'ethers'
import React from 'react';
import { StaticRouter } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import fetch from 'cross-fetch';

import App from './App';
import { ApolloClient, InMemoryCache, gql, HttpLink } from '@apollo/client'
import { getLogger } from './helpers'
import { addresses, ARBITRUM, AVALANCHE } from './addresses'

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

const arbitrumGraphClient = new ApolloClient({
  link: new HttpLink({ uri: 'https://api.thegraph.com/subgraphs/name/gmx-io/gmx-stats', fetch }),
  cache: new InMemoryCache()
})

const avalancheGraphClient = new ApolloClient({
  link: new HttpLink({ uri: 'https://api.thegraph.com/subgraphs/name/gdev8317/gmx-avalanche-staging', fetch }),
  cache: new InMemoryCache()
})

const cachedPrices = {
  [ARBITRUM]: {},
  [AVALANCHE]: {}
}
function putPricesIntoCache(prices, chainId, entitiesKey) {
  if (!prices || !chainId || !entitiesKey) {
    throw new Error('Invalid arguments')
  }
  const delimeter = entitiesKey === "chainlinkPrices" ? 1e8 : 1e30
  for (const price of prices) {
    const token = price.token.toLowerCase()
    cachedPrices[chainId][entitiesKey] = cachedPrices[chainId][entitiesKey] || {}
    cachedPrices[chainId][entitiesKey][token] = cachedPrices[chainId][entitiesKey][token] || {}
    cachedPrices[chainId][entitiesKey][token][price.timestamp] = Number(price.value) / delimeter
  }
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function precacheOldPrices(chainId, entitiesKey) {
  logger.info('precache old prices into memory for %s...', chainId)

  let oldestTimestamp = parseInt(Date.now() / 1000)
  let i = 0
  let failCount = 0
  while (i < 100) {
    try {
      const prices = await loadPrices({ before: oldestTimestamp, chainId, entitiesKey })
      if (prices.length === 0) {
        logger.info('All old prices loaded for chain: %s', chainId)
        break
      }

      putPricesIntoCache(prices, chainId, entitiesKey)
      oldestTimestamp = prices[prices.length - 1].timestamp - 1
    } catch (ex) {
      failCount++
      logger.warn('Old prices load failed')
      logger.error(ex)
      if (failCount > 10) {
        logger.warn('too many load failures. stop')
        break
      }
      await sleep(500)
    }
    i++
  }
}
precacheOldPrices(ARBITRUM, "chainlinkPrices")
precacheOldPrices(ARBITRUM, "fastPrices")
precacheOldPrices(AVALANCHE, "chainlinkPrices")
precacheOldPrices(AVALANCHE, "fastPrices")

let newestTimestamp = parseInt(Date.now() / 1000)
async function precacheNewPrices(chainId, entitiesKey) {
  logger.info('precache new prices into memory...')

  try {
    const prices = await loadPrices({ after: newestTimestamp, chainId, entitiesKey })
    if (prices.length > 0) {
      putPricesIntoCache(prices, chainId, entitiesKey)
      newestTimestamp = prices[0].timestamp + 1
    }
  } catch (ex) {
    logger.warn('New prices load failed')
    logger.error(ex)
  }

  setTimeout(precacheNewPrices, 1000 * 60 * 5, chainId, entitiesKey)
}
precacheNewPrices(ARBITRUM, "chainlinkPrices")
precacheNewPrices(ARBITRUM, "fastPrices")
precacheNewPrices(AVALANCHE, "chainlinkPrices")
precacheNewPrices(AVALANCHE, "fastPrices")

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
    new Date(before * 1000),
    new Date(after * 1000)
  )
  const query = gql(`{
    prices: ${entitiesKey}(
      first: 1000
      orderBy: timestamp
      orderDirection: desc
      where: {
        timestamp_lte: ${before}
        timestamp_gte: ${after}
      }
    ) { value, timestamp, token }
  }`)

  const graphClient = chainId === AVALANCHE ? avalancheGraphClient : arbitrumGraphClient;
  const { data } = await graphClient.query({query})
  return data.prices
}

function filterAndNormalizePrices(obj, from, to) {
  let firstTimestamp
  const prices = Object.entries(obj).map(([timestamp, price]) => {
    if (!firstTimestamp) {
      firstTimestamp = timestamp
    }
    return [Number(timestamp), price]
  }).filter(([timestamp]) => {
    return timestamp >= from && timestamp <= to
  }).sort((a, b) => a.timestamp - b.timestamp)
  return [prices, firstTimestamp]
}

function getPrices(from, to, preferableChainId = ARBITRUM, preferableSource = "chainlink", symbol) {
  if (preferableSource !== "chainlink" && preferableSource !== "fast") {
    const err = new Error(`Invalid preferableSource ${preferableSource}. Valid options are: chainlink, fast`)
    err.code = 400
    throw err
  }

  const validSymbols = new Set(['BTC', 'ETH', 'BNB', 'UNI', 'LINK', 'AVAX'])
  if (!validSymbols.has(symbol)) {
    const err = new Error(`Invalid symbol ${symbol}`)
    err.code = 400
    throw err
  }
  preferableChainId = Number(preferableChainId)
  const validSources = new Set([ARBITRUM, AVALANCHE])
  if (!validSources.has(preferableChainId)) {
    const err = new Error(`Invalid preferableChainId ${preferableChainId}`)
    err.code = 400
    throw err
  }

  const tokenAddress = addresses[preferableChainId][symbol]?.toLowerCase()
  if (!tokenAddress || !cachedPrices[preferableChainId].chainlinkPrices
    || !cachedPrices[preferableChainId].chainlinkPrices[tokenAddress]
  ) {
    return []
  }

  const entitiesKey = preferableSource === "chainlink" ? "chainlinkPrices" : "fastPrices"

  const rawPrices = cachedPrices[preferableChainId][entitiesKey][tokenAddress]
  let [prices, firstTimestamp] = filterAndNormalizePrices(rawPrices, from, to)

  if (preferableSource === "fast" && firstTimestamp > from) {
    // there is no enough fast price data. upfill it with chainlink prices
    const [chainlinkPrices] = filterAndNormalizePrices(cachedPrices[preferableChainId].chainlinkPrices[tokenAddress], from, firstTimestamp)
    prices = [...chainlinkPrices, ...prices]
  }

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
  let o = prevPrice
  let h = prevPrice
  let l = prevPrice
  let c = prevPrice
  for (let i = 1; i < prices.length; i++) {
    const [ts, price] = prices[i]
    const tsGroup = Math.floor(ts / periodTime) * periodTime
    if (prevTsGroup !== tsGroup) {
      candles.push({ t: prevTsGroup, o, h, l, c })
      o = c
      h = Math.max(o, c)
      l = Math.min(o, c)
    }
    c = price
    h = Math.max(h, price)
    l = Math.min(l, price)
    prevTsGroup = tsGroup
  }

  return candles
}

export default function routes(app) {
  app.get('/api/gmx-supply', async (req, res) => {
    const apiResponse = await fetch('https://api.gmx.io/gmx_supply')
    const data = (await apiResponse.text()).toString()
    res.send(formatUnits(data))
  })

  app.get('/api/chart/:symbol', async (req, res) => {
    let from = Number(req.query.from) || Math.round(Date.now() / 1000) - 86400 * 90
    from = Math.floor(from / 300) * 300
    let to = Number(req.query.to) || Math.round(Date.now() / 1000)
    to = Math.ceil(to / 300) * 300

    let prices
    try {
      prices = getPrices(from, to, req.query.preferableChainId, req.query.entitiesKey, req.params.symbol)
    } catch (ex) {
      if (ex.code === 400) {
        res.send(ex.message)
        res.status(400)
        return
      }
      throw ex
    }

    res.set('Cache-Control', 'max-age=60')
    res.send(prices)
  })

  app.get('/api/candles/:symbol', async (req, res) => {
    let from = Number(req.query.from) || Math.round(Date.now() / 1000) - 86400 * 90
    from = Math.floor(from / 300) * 300
    let to = Number(req.query.to) || Math.round(Date.now() / 1000)
    to = Math.ceil(to / 300) * 300

    let prices
    try {
      prices = getPrices(from, to, req.query.preferableChainId, req.query.preferableSource, req.params.symbol)
    } catch (ex) {
      if (ex.code === 400) {
        res.send(ex.message)
        res.status(400)
        return
      }
      throw ex
    }

    const period = req.query.period?.toLowerCase()
    if (!period || !periodsMap[period]) {
      res.send(`Invalid period. Valid periods are ${Object.keys(periodsMap)}`)
      res.status(400)
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

    if (context.url) {
      res.redirect(context.url);
    } else {
      res.status(200).send(
        `<!doctype html>
            <html lang="">
            <head>
                <meta http-equiv="X-UA-Compatible" content="IE=edge" />
                <meta charset="utf-8" />
                <title>GMX analytics</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <link rel="icon" type="image/png" href="/favicon.png" />
                ${cssLinksFromAssets(assets, 'client')}
            </head>
            <body>
                <div id="root">${markup}</div>
                ${jsScriptTagsFromAssets(assets, 'client', ' defer crossorigin')}
            </body>
        </html>`
      );
    }

    next()
  });
}