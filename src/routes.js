import path from 'path';

import { ethers } from 'ethers'
import React from 'react';
import Logger from 'console-log-level'
import { StaticRouter } from 'react-router-dom';
import { renderToString } from 'react-dom/server';

import App from './App';
import { getContract, findNearest, queryProviderLogs, callWithRetry, UsdgSupplyRecord, LogRecord, getLogger } from './helpers'
import * as helpers from './helpers'
import { TOKENS, TOKENS_BY_ADDRESS, TOKENS_BY_SYMBOL } from './tokens'
import { db, dbAll } from './db'
import { addresses } from './addresses'

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

let cachedPrices = {}
async function loadPrices() {
  logger.info('load prices into memory...')
  const rows = await dbAll(`
    SELECT symbol, timestamp, price
    FROM prices
    ORDER BY timestamp
  `)

  rows.forEach(row => {
    cachedPrices[row.symbol] = cachedPrices[row.symbol] || []
    cachedPrices[row.symbol].push(row)
  })

  setTimeout(loadPrices, 1000 * 60 * 5)
}
loadPrices()

const _cache = {}
function getPrice(address, timestamp) {
  const token = TOKENS_BY_ADDRESS[address]
  if (!token) {
    return 1
  }
  if (token.stable) {
    return 1
  }

  if (timestamp) {
    const key = `${token.symbol}-${timestamp}`
    if (_cache[key]) {
      return _cache[key]
    }

    if (cachedPrices[token.symbol]) {
      const nearest = findNearest(cachedPrices[token.symbol], timestamp, el => el.timestamp)
      _cache[key] = nearest.price
      return _cache[key]
    }
  }

  return token.defaultPrice
}

export default function routes(app) {
  const GROUP_PERIOD = 86400

  app.get('/api/usdgSupply', async (req, res) => {
    const period = Number(req.query.period) || GROUP_PERIOD
    const from = req.query.from || 0
    const to = req.query.to || Math.round(Date.now() / 1000)
    const rows = await dbAll(`
      SELECT s.supply, b.number, (b.timestamp / ${period} * ${period}) as timestamp
      FROM usdgSupply s
      INNER JOIN blocks b ON b.number = s.blockNumber
      WHERE b.timestamp >= ?
      GROUP BY b.timestamp / ${period}
      ORDER BY b.number
    `, [from])

    const records = fillPeriods(rows.map(UsdgSupplyRecord), {
      from,
      to,
      period,
      extrapolate: false
    })

    return res.send(records)
  })

  function mergeSorted(arrA, arrB) {
    const output = []

    let i = 0
    let j = 0
    let prevA = arrA[0]
    let prevB = arrB[0]
    console.log('arrA.length', arrA.length)
    console.log('arrB.length', arrB.length)
    while (true) {
      const a = arrA[i]
      const b = arrB[j]

      if (i === arrA.length && j === arrB.length) {
        break
      }

      if (!b) {
        output.push(a)
        i++
      } else if (!a) {
        output.push(b)
        j++
      } else if (a.timestamp < b.timestamp) {
        output.push(a)
        i++
      } else {
        output.push(b)
        j++
      }

      prevA = a
      prevB = b
    }

    return output
  }

  function fillPeriods(arr, { period, from, to, interpolate = true, extrapolate = false }) {
    let i = 0
    let prevTimestamp = from ? from - period : arr[0].timestamp
    let prevPeriodStep = Math.floor(prevTimestamp / period)
    let prevItem
    const ret = []

    console.log('fillPeriods period: %s, from: %s, to: %s', period, new Date(from * 1000), new Date(to * 1000))
    while (i < arr.length) {
      const item = arr[i]
      const periodStep = Math.floor(item.timestamp / period) 

      if (periodStep - 1 > prevPeriodStep) {
        const diff = periodStep - prevPeriodStep
        let j = 1
        while (j < diff) {
          let newItem = { timestamp: (prevPeriodStep + j) * period }
          if (interpolate) {
            newItem = { ...prevItem, ...newItem }
          }
          ret.push(newItem)
          j++
        }
      }

      ret.push(item)

      if (to && i === arr.length - 1) {
        const lastPeriodStep = Math.floor(to / period)
        if (lastPeriodStep > periodStep) {
          const diff = lastPeriodStep - periodStep
          let j = 0
          while (j < diff) {
            let newItem = { timestamp: (periodStep + j + 1) * period }
            if (extrapolate) {
              newItem = { ...item, ...newItem }
            }
            ret.push(newItem)
            j++
          }
        }
      }

      prevItem = item
      prevPeriodStep = periodStep
      i++
    }

    return ret
  }

  function fillNa(arr, keys) {
    const prevValues = {}
    for (const el of arr) {
      for (const key of keys) {
        if (!el[key]) {
          if (prevValues[key]) {
            el[key] = prevValues[key]
          }
        } else {
          prevValues[key] = el[key]
        }
      } 
    }
    return arr
  }

  app.get('/api/prices/:symbol', async (req, res) => {
    const validSymbols = new Set(['BTC', 'ETH', 'BNB'])
    const from = Number(req.query.from) || Math.round(Date.now() / 1000) - 86400 * 3
    const to = Number(req.query.to) || Math.round(Date.now() / 1000)
    const { symbol } = req.params
    if (!validSymbols.has(symbol)) {
      res.send(`Unknown symbol ${symbol}`)
      res.status(400)
      return
    }
    console.log(from, to)
    console.log('symbol: %s, from: %s (%s), to: %s (%s)',
      symbol,
      from,
      new Date(from * 1000).toISOString(),
      to,
      new Date(to * 1000).toISOString(),
    )

    const chainlinkPrices = await dbAll(`
      SELECT timestamp, price
      FROM chainlinkPrices
      WHERE timestamp BETWEEN ? AND ? AND symbol = ?
      ORDER BY timestamp
    `, [from, to, symbol])

    const poolAmounts = await dbAll(`
      SELECT timestamp, value poolAmount
      FROM poolStats
      WHERE timestamp BETWEEN ? AND ? AND symbol = ? AND type = 'poolAmount'
    `, [from, to, symbol])

    let vaultLogs = await dbAll(`
      SELECT l.name, l.args, b.timestamp
      FROM vaultLogs l
      INNER JOIN blocks b ON b.number = l.blockNumber
      WHERE b.timestamp BETWEEN ? AND ? AND name IN ('IncreasePosition')
    `, [from, to])
    vaultLogs = vaultLogs.reduce((memo, row) => {
      const record = LogRecord(row)
      if (record.name === 'IncreasePosition') {
        const indexTokenSymbol = TOKENS_BY_ADDRESS[record.args[3]].symbol
        if (indexTokenSymbol === symbol) {
          memo.push({
            increase: 40000
          })
        }
      }
      return memo
    }, [])

    let output = mergeSorted(chainlinkPrices, poolAmounts)
    output = fillNa(output, ['price', 'poolAmount'])

    res.send(output)
  })

  app.get('/api/poolStats', async (req, res) => {
    const period = Number(req.query.period) || GROUP_PERIOD
    const from = req.query.from || 0
    const to = req.query.to || Math.round(Date.now() / 1000)
    const rows = await dbAll(`
      SELECT
        AVG(value) value,
        type,
        symbol,
        timestamp / ${period} * ${period} as timestamp
      FROM poolStats
      WHERE timestamp >= ?
      GROUP BY timestamp, type, symbol
      ORDER BY blockNumber
    `, [from])

    let data = rows.reduce((memo, row) => {
      let last = memo[memo.length - 1]
      if (!last || last.timestamp !== row.timestamp) {
        memo.push({
          timestamp: row.timestamp
        })
        last = memo[memo.length - 1]
      }

      const token = TOKENS_BY_SYMBOL[row.symbol]
      if (row.type === 'usdgAmount') {
        row.valueUsd = row.value
      } else {
        const price = getPrice(token.address, row.timestamp)

        row.valueUsd = row.value * price
      }
      last[token.symbol] = last[token.symbol] || {}
      last[token.symbol][row.type] = row
      return memo
    }, [])

    data = fillPeriods(data, {
      from,
      to,
      period
    })

    res.send(data)
  })

  const SWAP_EVENTS_SET = new Set(['Swap', 'BuyUSDG', 'SellUSDG'])
  const MARGIN_EVENTS_SET = new Set(['IncreasePosition', 'DecreasePosition', 'LiquidatePosition'])
  function isSwapEvent(name) {
    return SWAP_EVENTS_SET.has(name)
  }
  function isMarginEvent(name) {
    return MARGIN_EVENTS_SET.has(name)
  }

  app.get('/api/users', async (req, res) => {
    const period = Number(req.query.period) || GROUP_PERIOD
    const from = req.query.from || 0
    const to = req.query.to || Math.round(Date.now() / 1000)
    const rows = await dbAll(`
      SELECT COUNT(DISTINCT t.\`from\`) count, l.name, b.timestamp / ${period} * ${period} timestamp
      FROM vaultLogs l
      INNER JOIN blocks b ON b.number = l.blockNumber
      INNER JOIN transactions t ON t.hash = l.txHash
      WHERE
        l.name in ('IncreasePosition', 'DecreasePosition', 'Swap', 'BuyUSDG', 'SellUSDG')
        AND b.timestamp >= ?
      GROUP BY timestamp / ${period}, name
    `, [from]) 

    let data = rows.reduce((memo, row) => {
      const { timestamp, name } = row
      const type = isSwapEvent(name) ? 'swap' : 'margin'

      memo[timestamp] = memo[timestamp] || {}
      memo[timestamp][type] = memo[timestamp][type] || 0
      memo[timestamp][type] += row.count

      return memo
    }, {})

    data = Object.entries(data).map(([timestamp, item]) => {
      return {
        timestamp,
        swap: item.swap || 0,
        margin: item.margin || 0
      }
    })

    data = fillPeriods(data, {
      from,
      to,
      period
    })

    res.send(data)
  })

  app.get('/api/swapSources', async (req, res) => {
    const period = Number(req.query.period) || GROUP_PERIOD
    const from = req.query.from || 0
    const to = req.query.to || Math.round(Date.now() / 1000)
    const rawSource = req.query.rawSource

    const rows = await dbAll(`
      SELECT l.args, l.name, b.number, b.timestamp, t.\`to\`
      FROM vaultLogs l
      INNER JOIN blocks b ON b.number = l.blockNumber
      INNER JOIN transactions t ON t.hash = l.txHash
      WHERE
        l.name in ('Swap', 'BuyUSDG', 'SellUSDG')
        AND b.timestamp >= ?
    `, [from])

    let data = rows.reduce((memo, row) => {
      const timeKey = Math.floor(row.timestamp / period) * period
      const record = LogRecord(row)

      let value = 0
      if (record.name === 'Swap') {
        const tokenInAddress = record.args[1]
        const tokenOutAddress = record.args[2]
        const amountIn = record.args[3]
        const amountOut = record.args[4]

        const tokenIn = TOKENS_BY_ADDRESS[tokenInAddress]
        const tokenOut = TOKENS_BY_ADDRESS[tokenInAddress]

        if (tokenIn.stable) {
          value = Number(formatUnits(amountIn, 18))
        } else if (tokenOut.stable) {
          value = Number(formatUnits(amountOut, 18))
        } else {
          value = Number(formatUnits(amountIn, 18)) * getPrice(tokenInAddress, row.timestamp)
        }
      } else if (record.name === 'BuyUSDG') {
        value = Number(formatUnits(record.args[3], 18))
      } else {
        const token = record.args[1]
        value = Number(formatUnits(record.args[3], 18)) * getPrice(token, row.timestamp)
      }

      let source

      if (rawSource) {
        source = row.to
      } else {
        if (row.to === addresses.WardenSwapRouter) {
          source = 'warden'
        } else if (row.to === addresses.OneInchRouter) {
          source = '1inch' 
        } else if (row.to === addresses.Router) {
          source = 'gmx'
        } else if (row.to === addresses.DodoexRouter) {
          source = 'dodoex'
        } else if (row.to === addresses.MetamaskRouter) {
          source = 'metamask'
        } else {
          source = 'other'
        }
      }

      memo[timeKey] = memo[timeKey] || {}
      memo[timeKey][source] = memo[timeKey][source] || 0
      memo[timeKey][source] += value
      return memo
    }, {})

    data = Object.entries(data).map(([timestamp, item]) => {
      return {
        timestamp,
        metrics: { ...item }
      }
    })

    data = fillPeriods(data, {
      from,
      to,
      period
    })

    res.send(data)
  })

  function getTradeFromLogRecord(record) {
    let value = 0
    let type = null
    if (record.name === 'Swap') {
      const tokenInAddress = record.args[1]
      const tokenOutAddress = record.args[2]
      const amountIn = record.args[3]
      const amountOut = record.args[4]

      const tokenIn = TOKENS_BY_ADDRESS[tokenInAddress]
      const tokenOut = TOKENS_BY_ADDRESS[tokenInAddress]

      if (tokenIn.stable) {
        value = Number(formatUnits(amountIn, 18))
      } else if (tokenOut.stable) {
        value = Number(formatUnits(amountOut, 18))
      } else {
        value = Number(formatUnits(amountIn, 18)) * getPrice(tokenInAddress, record.timestamp)
      }
      type = 'swap'
    } else if (record.name === 'BuyUSDG') {
      value = Number(formatUnits(record.args[3], 18))
      type = 'mint'
    } else if (record.name === 'SellUSDG') {
      const token = record.args[1]
      value = Number(formatUnits(record.args[3], 18)) * getPrice(token, record.timestamp)
      type = 'burn'
    } else if (record.name === 'LiquidatePosition') {
      value = Number(formatUnits(record.args[5], 30))
      type = 'liquidation'
    } else {
      value = Number(formatUnits(record.args[5], 30))
      type = 'margin'
    }

    return { type, value }
  }

  function sumObjects(a, b) {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    return Array.from(new Set([...aKeys, ...bKeys])).reduce((memo, key) => {
      memo[key] = (a[key] || 0) + (b[key] || 0)
      return memo
    }, {})
  }

  app.get('/api/volumeByHour', async (req, res) => {
    const from = req.query.from || 0
    const to = req.query.to || Math.round(Date.now() / 1000)
    const rows = await dbAll(`
      SELECT l.args, l.name, b.number, b.timestamp, strftime('%H', b.timestamp, 'unixepoch') hour
      FROM vaultLogs l
      INNER JOIN blocks b ON b.number = l.blockNumber
      WHERE
        l.name in ('IncreasePosition', 'DecreasePosition', 'LiquidatePosition', 'Swap', 'BuyUSDG', 'SellUSDG')
        AND b.timestamp BETWEEN ? and ?
    `, [from, to])

    const grouped = rows.reduce((memo, row) => {
      const record = LogRecord(row)
      memo[record.hour] = memo[record.hour] || {}

      const { type, value } = getTradeFromLogRecord(record)
      memo[record.hour][type] = memo[record.hour][type] || 0
      memo[record.hour][type] += value
      return memo
    }, {})

    const data = Object.keys(grouped).sort().map(key => {
      return {
        hour: key,
        metrics: grouped[key]
      }
    })

    res.send(data)
  })

  app.get('/api/volume', async (req, res) => {
    const period = Number(req.query.period) || GROUP_PERIOD
    const from = req.query.from || 0
    const to = req.query.to || Math.round(Date.now() / 1000)
    const rows = await dbAll(`
      SELECT l.args, l.name, b.number, b.timestamp
      FROM vaultLogs l
      INNER JOIN blocks b ON b.number = l.blockNumber
      WHERE
        l.name in ('IncreasePosition', 'DecreasePosition', 'LiquidatePosition', 'Swap', 'BuyUSDG', 'SellUSDG')
        AND b.timestamp BETWEEN ? AND ?
    `, [from, to])

    let data = rows.reduce((memo, row) => {
      const key = Math.floor(row.timestamp / period) * period
      const record = LogRecord(row)
      memo[key] = memo[key] || {}

      const { type, value } = getTradeFromLogRecord(record)

      memo[key][type] = memo[key][type] || 0
      memo[key][type] += value
      return memo
    }, {})

    data = Object.entries(data).map(([timestamp, item]) => {
      return {
        timestamp: Number(timestamp),
        metrics: {
          ...item
        }
      }
    })

    data = fillPeriods(data, {
      from,
      to,
      period
    })

    res.send(data)
  })

  app.get('/api/liquidations', async (req, res) => {
    const from = req.query.from || Math.round(Date.now() / 1000) - 86400 * 3
    const to = req.query.to || Math.round(Date.now() / 1000)
    const rows = await dbAll(`
      SELECT l.args, b.timestamp
      FROM vaultLogs l
      INNER JOIN blocks b ON b.number = l.blockNumber
      WHERE
        name = 'LiquidatePosition'
        AND b.timestamp BETWEEN ? AND ?
      ORDER BY b.timestamp
    `, [from, to])

    let output = rows.map(row => {
      const record = LogRecord(row)
      const collateral = record.args[6] 
      const isLong = record.args[4] 
      const value = collateral / 1e30
      return {
        timestamp: row.timestamp,
        collateral: value,
        isLong
      }
    })

    output = fillPeriods(output, {
      from,
      to,
      period: 60 * 5,
      interpolate: false
    })

    res.send(output)
  })

  app.get('/api/marginPnl', async (req, res) => {
    const from = req.query.from || Math.round(Date.now() / 1000) - 86400 * 3
    const to = req.query.to || Math.round(Date.now() / 1000)
    const rows = await dbAll(`
      SELECT l.args, b.timestamp, l.name
      FROM vaultLogs l
      INNER JOIN blocks b ON b.number = l.blockNumber
      WHERE
        name in ('UpdatePnl', 'IncreasePosition', 'DecreasePosition')
        AND b.timestamp BETWEEN ? AND ?
      ORDER BY b.timestamp
    `, [from, to]) 

    const positionByKey = rows.reduce((memo, row) => {
      const record = LogRecord(row)
      if (record.name !== 'UpdatePnl') {
        const [key, , , token, , , isLong] = record.args
        const symbol = TOKENS_BY_ADDRESS[token].symbol
        memo[key] = {
          symbol,
          isLong
        }
      }
      return memo
    }, {})

    let net = BigNumber.from(0)
    let profits = BigNumber.from(0)
    let loss = BigNumber.from(0)

    const netByLong = {
      true: BigNumber.from(0),
      false: BigNumber.from(0)
    }
    const netBySymbol = {
      BTC: BigNumber.from(0),
      ETH: BigNumber.from(0),
      BNB: BigNumber.from(0)
    }

    const usdToNumber = usd => Number(formatUnits(usd, 30))
    let output = rows.filter(row => row.name === 'UpdatePnl').map(row => {
      const record = LogRecord(row)
      const [key, hasProfit, delta] = record.args
      const position = positionByKey[key]
      let isLong
      let symbol
      if (position) {
        isLong = position.isLong
        symbol = position.symbol
      }

      if (hasProfit) {
        net = net.add(delta)
        profits = profits.add(delta)
        if (position) {
          netByLong[isLong] = netByLong[isLong].add(delta)
          netBySymbol[symbol] = netBySymbol[symbol].add(delta)
        }
      } else {
        net = net.sub(delta)
        loss = loss.sub(delta)
        if (position) {
          netByLong[isLong] = netByLong[isLong].sub(delta)
          netBySymbol[symbol] = netBySymbol[symbol].sub(delta)
        }
      }
      return {
        timestamp: row.timestamp,
        metrics: {
          net: usdToNumber(net),
          profits: usdToNumber(profits),
          loss: usdToNumber(loss),
          long: usdToNumber(netByLong[true]),
          short: usdToNumber(netByLong[false]),
          BTC: usdToNumber(netBySymbol.BTC),
          ETH: usdToNumber(netBySymbol.ETH),
          BNB: usdToNumber(netBySymbol.BNB),
        }
      }
    })

    output = fillPeriods(output, {
      from,
      to,
      period: 60 * 5,
      extrapolate: true
    })

    res.send(output)
  })

  app.get('/api/fees', async (req, res) => {
    const period = Number(req.query.period) || GROUP_PERIOD
    const disableGrouping = req.query.disableGrouping
    const from = req.query.from || 0
    const to = req.query.to || Math.round(Date.now() / 1000)

    const rows = await dbAll(`
      SELECT l.args, l.name, b.number, b.timestamp, l.txHash
      FROM vaultLogs l
      INNER JOIN blocks b ON b.number = l.blockNumber
      WHERE
        l.name in ('CollectMarginFees', 'CollectSwapFees', 'Swap', 'BuyUSDG', 'SellUSDG', 'LiquidatePosition')
        AND b.timestamp >= ?
    `, [from])

    const eventsInTx = rows.reduce((memo, row) => {
      memo[row.txHash] = memo[row.txHash] || {}
      memo[row.txHash][row.name] = true
      return memo
    }, {})

    const filterEventsSet = new Set(['CollectMarginFees', 'CollectSwapFees', 'LiquidatePosition'])
    let feesData = rows.filter(row => filterEventsSet.has(row.name)).map(row => {
      const record = LogRecord(row)
      let type
      let feeUsd
      if (row.name === 'LiquidatePosition') {
        type = 'liquidation'
        // TODO use real marginFee
        const fees = record.args[5].div(1000) // 0.1%
        feeUsd = parseFloat(formatUnits(fees, 30))
      } else if (row.name === 'CollectMarginFees') {
        type = eventsInTx[row.txHash].LiquidatePosition ? 'liquidation' : 'margin'
        feeUsd = parseFloat(formatUnits(record.args[1], 30))
      } else {
        const feeToken = parseFloat(formatUnits(record.args[1], 18))
        feeUsd = feeToken * getPrice(record.args[0], record.timestamp)
        if (eventsInTx[row.txHash].Swap) {
          type = 'swap'
        } else {
          type = eventsInTx[row.txHash].SellUSDG ? 'burn' : 'mint'
        }
      }

      return {
        timestamp: record.timestamp,
        feeUsd,
        name: record.name,
        token: record.args[0],
        type
      }
    })

    if (disableGrouping) {
      feesData = feesData.map(item => {
        return {
          timestamp: item.timestamp,
          type: item.type,
          value: item.feeUsd
        }
      })

      feesData = fillPeriods(feesData, {
        from,
        to,
        period: 1000 * 60 * 5
      })
    } else {
      const grouped = feesData.reduce((memo, el) => {
        const { timestamp, type, feeUsd } = el
        const key = Math.floor(timestamp / period) * period

        memo[key] = memo[key] || {}
        memo[key][type] = (memo[key][type] || 0) + feeUsd
        return memo
      }, {})

      feesData = Object.entries(grouped).map(([timestamp, item]) => {
        return {
          timestamp,
          metrics: {
            ...item
          }
        }
      })

      feesData = fillPeriods(feesData, {
        from,
        to,
        period
      })
    }

    res.send(feesData)
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
                <title>GMX stats</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
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