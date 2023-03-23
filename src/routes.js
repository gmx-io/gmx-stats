import { ethers } from 'ethers'
import React from 'react';
import { StaticRouter } from 'react-router-dom';
import { renderToString } from 'react-dom/server';

import { createHttpError }  from './utils';
import { ARBITRUM, AVALANCHE } from './addresses'
import { getPricesLimit, getLastUpdatedTimestamp, VALID_PERIODS } from './prices'
import { get24HourVolume } from './stats'

import App from './App';
import { getLogger } from './helpers'
import { queryEarnData } from './dataProvider'

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

const { formatUnits } = ethers.utils

const logger = getLogger('routes')

export default function routes(app) {
  app.get('/api/earn/:account', async (req, res, next) => {
    const chainName = req.query.chain || 'arbitrum'
    const validChainNames = new Set(['arbitrum', 'avalanche'])
    if (!validChainNames.has(chainName)) {
      next(createHttpError(400, `Valid chains are: ${Array.from(validChainNames)}`))
      return
    }
    try {
      const earnData = await queryEarnData(chainName, req.params.account)
      res.send(earnData)
    } catch (ex) {
      logger.error(ex)
      next(createHttpError(500, ex.message))
      return
    }
  })

  app.get('/api/gmx-supply', async (req, res) => {
    const apiResponse = await fetch('https://api.gmx.io/gmx_supply')
    const data = (await apiResponse.text()).toString()
    res.set('Content-Type', 'text/plain')
    res.send(formatUnits(data))
  })
  
  app.get('/api/volume/24h', async (req, res, next) => {
    const volumeData = await get24HourVolume()
    res.send(volumeData)
  });

  app.get('/api/candles/:symbol', async (req, res, next) => {
    const period = req.query.period?.toLowerCase()
    if (!period || !VALID_PERIODS.has(period)) {
      next(createHttpError(400, `Invalid period. Valid periods are ${Array.from(VALID_PERIODS)}`))
      return
    }
    
    const validSymbols = new Set(['BTC', 'ETH', 'BNB', 'UNI', 'LINK', 'AVAX'])
    const symbol = req.params.symbol
    if (!validSymbols.has(symbol)) {
      next(createHttpError(400, `Invalid symbol ${symbol}`))
      return
    }
    const preferableChainId = Number(req.query.preferableChainId)
    const validSources = new Set([ARBITRUM, AVALANCHE])
    if (!validSources.has(preferableChainId)) {
      next(createHttpError(400, `Invalid preferableChainId ${preferableChainId}. Valid options are ${ARBITRUM}, ${AVALANCHE}`))
      return
    }
    
    const MAX_LIMIT = 5000
    let limit = 5000
    if (req.query.limit) {
      limit = Number(req.query.limit)
      if (Number.isNaN(limit)) {
        next(createHttpError(400, `Invalid limit ${req.query.limit}`))
        return
      }
      if (limit > MAX_LIMIT) {
        limit = MAX_LIMIT 
      }
    }

    let prices
    try {
      prices = getPricesLimit(limit, preferableChainId, req.params.symbol, period)
    } catch (ex) {
      next(ex)
      return
    }

    res.set('Cache-Control', 'max-age=60')
    res.send({
      prices,
      period,
      updatedAt: getLastUpdatedTimestamp()
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

  // eslint-disable-next-line no-unused-vars
  app.use('/api', function (err, req, res, _) {
    res.set('Content-Type', 'text/plain')
    const statusCode = Number(err.code) || 500
    let response = ''
    if (IS_PRODUCTION) {
      if (err.code === 400) {
        response = err.message
      }
    } else {
      response = err.stack
    }
    res.status(statusCode)
    res.send(response)
  })
}