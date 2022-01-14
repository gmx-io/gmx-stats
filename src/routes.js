import path from 'path';

import { ethers } from 'ethers'
import React from 'react';
import Logger from 'console-log-level'
import { StaticRouter } from 'react-router-dom';
import { renderToString } from 'react-dom/server';
import fetch from 'cross-fetch';

import App from './App';
import { ApolloClient, InMemoryCache, gql, HttpLink } from '@apollo/client'
import { findNearest, queryProviderLogs, callWithRetry, UsdgSupplyRecord, LogRecord, getLogger, fillPeriods } from './helpers'
import * as helpers from './helpers'
import { TOKENS, TOKENS_BY_ADDRESS, TOKENS_BY_SYMBOL } from './tokens'
import { tokenSymbols } from './dataProvider'
import { addresses, BSC, ARBITRUM, AVALANCHE } from './addresses'
import { dbAll } from './db'

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

const { BigNumber } = ethers
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
function putPricesIntoCache(prices, chainId) {
  for (const price of prices) {
    const token = price.token.toLowerCase()
    cachedPrices[chainId][token] = cachedPrices[chainId][token] || {}
    cachedPrices[chainId][token][price.timestamp] = Number(price.value) / 1e8
  }
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

async function precacheOldPrices(chainId) {
  logger.info('precache old prices into memory for %s...', chainId)

  let oldestTimestamp = parseInt(Date.now() / 1000)
  let i = 0
  let failCount = 0
  while (i < 100) {
    try {
      const prices = await loadPrices({ before: oldestTimestamp, chainId })
      if (prices.length === 0) {
        logger.info('All old prices loaded for chain: %s', chainId)
        break
      }

      putPricesIntoCache(prices, chainId)
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
precacheOldPrices(ARBITRUM)
precacheOldPrices(AVALANCHE)

let newestTimestamp = parseInt(Date.now() / 1000)
async function precacheNewPrices(chainId) {
  logger.info('precache new prices into memory...')

  try {
    const prices = await loadPrices({ after: newestTimestamp, chainId })
    if (prices.length > 0) {
      putPricesIntoCache(prices, chainId)
      newestTimestamp = prices[0].timestamp + 1
    }
  } catch (ex) {
    logger.warn('New prices load failed')
    logger.error(ex)
  }

  setTimeout(precacheNewPrices, 1000 * 60 * 5, chainId)
}
precacheNewPrices(ARBITRUM)
precacheNewPrices(AVALANCHE)

async function loadPrices({ before, after, chainId } = {}) {
  if (!before) {
    before = parseInt(Date.now() / 1000) + 86400 * 365
  }
  if (!after) {
    after = 0
  }
  logger.info('loadPrices chainId: %s before: %s, after: %s',
    chainId,
    new Date(before * 1000),
    new Date(after * 1000)
  )
  const query = gql(`{
    prices: chainlinkPrices(
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

export default function routes(app) {
  const GROUP_PERIOD = 86400

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

    const validSymbols = new Set(['BTC', 'ETH', 'BNB', 'UNI', 'LINK', 'AVAX'])
    const { symbol } = req.params
    if (!validSymbols.has(symbol)) {
      res.send(`Invalid symbol ${symbol}`)
      res.status(400)
      return
    }
    const preferableChainId = Number(req.query.preferableChainId || ARBITRUM)
    const validSources = new Set([ARBITRUM, AVALANCHE])
    if (!validSources.has(preferableChainId)) {
      res.send(`Invalid preferableChainId ${preferableChainId}`)
      res.status(400)
      return
    }

    const tokenAddress = addresses[preferableChainId][symbol]?.toLowerCase()
    if (!tokenAddress || !cachedPrices[preferableChainId][tokenAddress]) {
      res.send([])
      return
    }

    const prices = Object.entries(cachedPrices[preferableChainId][tokenAddress]).map(([timestamp, price]) => {
      return [Number(timestamp), price]
    }).filter(([timestamp, price]) => {
      return timestamp >= from && timestamp <= to
    }).sort((a, b) => a.timestamp - b.timestamp)

    res.set('Cache-Control', 'max-age=60')
    res.send(prices) 
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