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
import { addresses, BSC, ARBITRUM } from './addresses'
import { dbAll } from './db'
import { contracts } from './contracts'

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

const graphClient = new ApolloClient({
  link: new HttpLink({ uri: 'https://api.thegraph.com/subgraphs/name/gmx-io/gmx-stats', fetch }),
  cache: new InMemoryCache()
})

const cachedPrices = {}
function putPricesIntoCache(prices) {
  for (const price of prices) {
    const symbol = tokenSymbols[price.token]
    if (!symbol) {
      continue
    }
    cachedPrices[symbol] = cachedPrices[symbol] || {}
    cachedPrices[symbol][price.timestamp] = Number(price.value) / 1e30
  }
}

async function precacheOldPrices() {
  logger.info('precache old prices into memory...')

  let oldestTimestamp
  let i = 0
  while (i < 100) {
    try {
      const prices = await loadPrices({ before: oldestTimestamp })
      if (prices.length === 0) {
        break
      }

      putPricesIntoCache(prices)
      oldestTimestamp = prices[prices.length - 1].timestamp
    } catch (ex) {
      logger.warn('Old prices load failed')
      console.error(ex)
    }
    i++
  }
}
precacheOldPrices()

let newestTimestamp = parseInt(Date.now() / 1000)
async function precacheNewPrices() {
  logger.info('precache new prices into memory...')

  try {
    const prices = await loadPrices({ after: newestTimestamp })
    if (prices.length > 0) {
      putPricesIntoCache(prices)
      newestTimestamp = prices[0].timestamp
    }
  } catch (ex) {
    logger.warn('New prices load failed')
    console.error(ex)
  }

  setTimeout(precacheNewPrices, 1000 * 60)
}
precacheNewPrices()

async function loadPrices({ before, after } = {}) {
  logger.info('loadPrices before: %s, after: %s', before, after)
  if (!after) {
    after = 0
  }
  if (!before) {
    before = 1861822800
  }
  const query = gql(`{
    fastPrices(
      first: 1000
      orderBy: timestamp
      orderDirection: desc
      where: {
        timestamp_lte: ${before}
      }
    ) {
      value
      timestamp
      token
    }
  }`)
  const res = await graphClient.query({query})
  return res.data.fastPrices
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

    const validSymbols = new Set(['BTC', 'ETH', 'BNB', 'UNI', 'LINK'])
    const { symbol } = req.params
    if (!validSymbols.has(symbol)) {
      res.send(`Invalid symbol ${symbol}`)
      res.status(400)
      return
    }
    const preferableChainId = Number(req.query.preferableChainId || BSC)
    const validSources = new Set([BSC, ARBITRUM])
    if (!validSources.has(preferableChainId)) {
      res.send(`Invalid preferableChainId ${preferableChainId}`)
      res.status(400)
      return
    }

    if (!cachedPrices[symbol]) {
      res.send([])
      return
    }

    const prices = Object.entries(cachedPrices[symbol]).map(([timestamp, price]) => {
      return [Number(timestamp), price]
    }).filter(([timestamp, price]) => {
      return timestamp >= from && timestamp <= to
    }).sort((a, b) => a.timestamp - b.timestamp)

    res.set('Cache-Control', 'max-age=60')
    res.send(prices) 
  })

  app.get('/*', (req, res) => {
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
  });
}