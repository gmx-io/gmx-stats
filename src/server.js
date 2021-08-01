import path from 'path';

import React from 'react';
import { StaticRouter } from 'react-router-dom';
import express from 'express';
import { renderToString } from 'react-dom/server';
import { ethers } from 'ethers'
import sqlite3 from 'sqlite3'
import got from 'got'

import Vault from '../abis/v1/Vault'
import Token from '../abis/v1/Token'
import App from './App';
import { findNearest } from './helpers'

const vaultAbi = Vault.abi
const tokenAbi = Token.abi

const { BigNumber } = ethers
const { formatUnits} = ethers.utils
const { AddressZero } = ethers.constants

const CHAIN_ID = 56
const addresses = {
    Vault: "0xc73A8DcAc88498FD4b4B1b2AaA37b0a2614Ff67B",
    Router: "0xD46B23D042E976F8666F554E928e0Dc7478a8E1f",
    USDG: "0x85E76cbf4893c1fbcB34dCF1239A91CE2A4CF5a7"
}

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

const app = express();

function getProvider() {
  return new ethers.providers.JsonRpcProvider("https://bsc-dataseed1.defibit.io/", CHAIN_ID)
}

function getContract(address, abi, signer) {
  const provider = getProvider()
  if (!signer) {
    signer = ethers.Wallet.createRandom().connect(provider) 
  }
  const contract = new ethers.Contract(address, abi, signer)
  return contract
}

async function callWithRetry(func, args, maxTries = 10) {
  let i = 0
  while (true) {
    try {
      return await func(...args)
    } catch (ex) {
      i++
      if (i == maxTries) {
        throw ex
      }
    }
  }
}

async function queryProviderLogs({ provider, fromBlock, toBlock, topic0, address }) {
  console.log(`query logs fromBlock=${fromBlock} toBlock=${toBlock} blocks length=${toBlock - fromBlock}`)
  provider = provider || getProvider()
  const allResult = []
  const MAX = 1000
  let chunkFromBlock = fromBlock
  let chunkToBlock = Math.min(toBlock, fromBlock + MAX)
  let i = 0
  while (true) {
    console.log(`requesting ${i} chunk ${chunkFromBlock}-${chunkToBlock}...`)
    try {
      const result = await callWithRetry(provider.getLogs.bind(provider), [{
        fromBlock: chunkFromBlock,
        toBlock: chunkToBlock,
        topic: topic0,
        address
      }])
      allResult.push(...result)
    } catch (ex) {
      console.log(`chunk ${i} failed. break`)
      console.error(ex.message)
      break
    }
    i++

    if (chunkToBlock === toBlock) {
      console.log('done')
      break
    }

    chunkFromBlock = chunkToBlock + 1
    chunkToBlock = Math.min(toBlock, chunkToBlock + MAX)
  }

  return allResult
}

const DB_PATH = path.join(__dirname, '..', 'main.db')
const db = new sqlite3.Database(DB_PATH)
const provider = getProvider()

const vault = getContract(addresses.Vault, vaultAbi)
const usdg = getContract(addresses.USDG, tokenAbi)

function LogRecord(row) {
  return {
    ...row,
    args: JSON.parse(row.args).map(el => {
      if (el && el.type === 'BigNumber') {
        return BigNumber.from(el.hex)
      }
      return el
    })
  }
}

function UsdgSupplyRecord(row) {
  return {
    ...row,
    supply: BigNumber.from(JSON.parse(row.supply).hex)
  }
}

async function getLastLogRecord({ tableName, backwards = false } = {}) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM ${tableName} ORDER BY blockNumber ${backwards ? 'ASC' : 'DESC'}`, (err, row) => {
      if (err) return reject(err)

      if (row) {
        resolve(LogRecord(row))
      }
      resolve()
    })
  })  
}

const BACKWARDS = false
const BLOCKS_PER_JOB = 10000

async function getLatestReliableBlock() {
  const number = await getLatestReliableBlockNumber() - 3
  return await provider.getBlock(number)
}

async function getLatestReliableBlockNumber() {
    return (await provider.getBlockNumber()) - 3
}

function retrieveLogsFactory({ decoder, address, tableName, getAnchorNumber, name = 'unknown' } = {}) {
  return async ({ backwards = false } = {}) => {
    console.log('retrieve %s logs backwards=%s, address=%s, blocks per job=%s',
      name,
      backwards,
      address,
      BLOCKS_PER_JOB
    )

    const latestBlockNumber = await getLatestReliableBlockNumber()
    const lastVaultRecord = await getLastLogRecord({ tableName, backwards })
    const anchorNumber = lastVaultRecord ? lastVaultRecord.blockNumber : latestBlockNumber
    console.log('anchorNumber: %s, blocks ahead: %s',
      anchorNumber,
      latestBlockNumber - anchorNumber
    )

    let toBlock
    let fromBlock
    if (backwards) {
      toBlock = anchorNumber - 1
      fromBlock = toBlock - BLOCKS_PER_JOB
    } else {
      fromBlock = anchorNumber + 1
      toBlock = Math.min(latestBlockNumber, fromBlock + BLOCKS_PER_JOB)
    }

    const logResults = await queryProviderLogs({ fromBlock, toBlock, address })
    console.log(`retrieved ${logResults.length} results`)

    for (const logResult of logResults) {
      const logData = decoder.parseLog(logResult)
      await new Promise((resolve, reject) => {
        db.run(`INSERT OR IGNORE INTO ${tableName}
          (blockNumber, blockHash, txHash, name, args, logIndex)
          VALUES (?, ?, ?, ?, ?, ?) 
        `, [
          logResult.blockNumber,
          logResult.blockHash,
          logResult.transactionHash,
          logData.name,
          JSON.stringify(logData.args),
          logResult.logIndex
        ], (err) => {
          if (err) return reject(err)
          resolve()
        })
      })
    }
  } 
}

const POOL_STATS_TYPES = ['usdgAmount', 'poolAmount', 'reservedAmount']
async function getAnchorPoolStats(backwards) {
  const stats = {}
  for (const token of TOKENS) {
    if (token.symbol === 'USDG') {
      continue
    }
    stats[token.symbol] = {}
    for (const type of POOL_STATS_TYPES) {
      const row = await dbGet(`
        SELECT value, valueHex, blockNumber
        FROM poolStats
        WHERE type = ? AND symbol = ?
        ORDER BY blockNumber ${backwards ? 'ASC' : 'DESC'} 
        LIMIT 1
      `, [type, token.symbol])
      stats[token.symbol][type] = row
    }
  }
  return stats
}

async function insertPoolStatsRow({ value, symbol, type, timestamp, blockNumber, logIndex }) {
  return await dbRun(`
    INSERT INTO poolStats (value, valueHex, symbol, type, timestamp, blockNumber, logIndex)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [formatUnits(value, 18), value.toHexString(), symbol, type, timestamp, blockNumber, logIndex])
}

async function retrieveLatestPoolStats(lastBlock) {
  let fakeLogIndex = 0
  for (const token of TOKENS) {
    if (token.symbol === 'USDG') {
      continue
    }
    const [poolAmount, usdgAmount, reservedAmount] = await Promise.all([
      vault.poolAmounts(token.address),
      vault.usdgAmounts(token.address),
      vault.reservedAmounts(token.address)
    ])
    console.log('%s poolAmount: %s, usdgAmount: %s, reserevedAmount: %s. inserting...',
      token.symbol,
      formatUnits(poolAmount, 18),
      formatUnits(usdgAmount, 18),
      formatUnits(reservedAmount, 18)
    )
    const timestamp = lastBlock.timestamp
    const blockNumber = lastBlock.number
    const symbol = token.symbol
    await insertPoolStatsRow({
      value: poolAmount,
      timestamp,
      blockNumber,
      symbol,
      type: 'poolAmount',
      logIndex: fakeLogIndex++
    })
    await insertPoolStatsRow({
      value: usdgAmount,
      timestamp,
      blockNumber,
      symbol,
      type: 'usdgAmount',
      logIndex: fakeLogIndex++
    })
    await insertPoolStatsRow({
      value: reservedAmount,
      timestamp,
      blockNumber,
      symbol,
      type: 'reservedAmount',
      logIndex: fakeLogIndex++
    })
    console.log('%s done', token.symbol)
  }
  console.log('done')
}

async function calculatePoolStats(backwards = false) {
  console.log('Calculate pool stats based on logs')
  const anchor = await dbGet(`
    SELECT blockNumber
    FROM poolStats
    ORDER BY blockNumber ${backwards ? 'ASC' : 'DESC'}
    LIMIT 1
  `)

  let anchorBlockNumber
  if (!anchor) {
    console.log('no anchor, retrieve from chain')

    const lastBlock = await getLatestReliableBlock()
    anchorBlockNumber = await getLatestReliableBlockNumber()

    await retrieveLatestPoolStats(lastBlock)
    return
  } else {
    anchorBlockNumber = anchor.blockNumber
  }

  console.log('anchor blockNumber=%s, backwards=%s',
    anchorBlockNumber,
    backwards
  )

  const orderKey = backwards ? 'DESC' : 'ASC'
  const logs = await dbAll(`
    SELECT l.name, l.args, l.logIndex, l.blockNumber, l.txHash, b.timestamp, l.logIndex
    FROM vaultLogs l
    INNER JOIN blocks b ON b.number = l.blockNumber
    WHERE
      name in ('IncreasePoolAmount', 'DecreasePoolAmount', 'IncreaseUsdgAmount', 'DecreaseUsdgAmount', 'IncreaseReservedAmount', 'DecreaseReservedAmount')
      AND blockNumber ${backwards ? '<' : '>'} ${anchorBlockNumber}
    ORDER BY blockNumber ${orderKey}, logIndex ${orderKey}
    LIMIT 10000
  `)

  if (logs.length === 0) {
    console.log('no unprocessed logs. skip')
    return
  }
  console.log('%s logs to process', logs.length)

  const anchorStats = await getAnchorPoolStats(backwards)
  Object.keys(anchorStats).forEach(symbol => {
    console.log('%s stats %s', symbol, JSON.stringify(anchorStats[symbol])) 
  })

  for (const log of logs) {
    const record = LogRecord(log)
    const [tokenAddress, amount] = record.args
    const token = TOKENS_BY_ADDRESS[tokenAddress]

    if (!token) {
      console.warn('unsupported token address %s', tokenAddress)
      continue
    }

    let type
    let increase
    const { name, blockNumber, timestamp } = record
    if (['IncreasePoolAmount', 'DecreasePoolAmount'].includes(name)) {
      type = 'poolAmount'
      increase = name === 'IncreasePoolAmount'
    } else if (['IncreaseUsdgAmount', 'DecreaseUsdgAmount'].includes(name)) {
      type = 'usdgAmount'
      increase = name === 'IncreaseUsdgAmount'
    } else if (['IncreaseReservedAmount', 'DecreaseReservedAmount'].includes(name)) {
      type = 'reservedAmount'
      increase = name === 'IncreaseReservedAmount'
    } else {
      console.warn('unsupported event %s', name)
      continue
    }

    const stats = anchorStats[token.symbol][type]
    const shouldAdd = (increase && !backwards) || (!increase && backwards)

    const current = BigNumber.from(stats.valueHex)
    const next = shouldAdd ? current.add(amount) : current.sub(amount)

    console.log('%s %s %s (%s), prev: %s, next: %s, diff: %s, amount: %s, %s', 
      token.symbol,
      type,
      new Date(record.timestamp * 1000),
      blockNumber,
      formatUnits(current, 18),
      formatUnits(next, 18),
      formatUnits(next.sub(current), 18),
      formatUnits(amount, 18),
      name
    )

    if (next.lt(0)) {
      console.error('ZERO %s %s', current.toString(), next.toString())
      return 
    }

    await insertPoolStatsRow({
      value: next,
      symbol: token.symbol,
      type,
      timestamp,
      blockNumber,
      logIndex: record.logIndex
    })
    stats.valueHex = next.toHexString()
  }
  console.log('done')
}

async function calculateUsdgSupply(backwards = false) {
  console.log('Calculate usdg supply based on logs')
  const anchor = UsdgSupplyRecord(await dbGet(`
    SELECT supply, blockNumber
    FROM usdgSupply
    ORDER BY blockNumber ${backwards ? 'ASC' : 'DESC'}
    LIMIT 1
  `))

  console.log('anchor blockNumber=%s, supply=%s, backwards=%s',
    anchor.blockNumber,
    anchor.supply.toString(),
    backwards
  )

  const logs = await dbAll(`
    SELECT *
    FROM usdgLogs
    WHERE
      name = 'Transfer'
      AND blockNumber ${backwards ? '<' : '>'} ${anchor.blockNumber}
    ORDER BY blockNumber ${backwards ? 'DESC' : 'ASC'}
  `)

  if (logs.length === 0) {
    console.log('no unprocessed logs. skip')
    return
  }
  console.log('%s logs to process', logs.length)

  let prevSupply = anchor.supply
  let nextSupply
  for (const log of logs) {
    const record = LogRecord(log)
    const [from, to, amount] = record.args

    if (from === AddressZero) { // mint
      nextSupply = backwards ? prevSupply.sub(amount) : prevSupply.add(amount)
    } else if (to === AddressZero) { // burn
      nextSupply = backwards ? prevSupply.add(amount) : prevSupply.sub(amount)
    } else {
      continue
    }

    console.log('block: %s, prev: %s, next: %s, diff: %s', 
      record.blockNumber,
      formatUnits(prevSupply, 18),
      formatUnits(nextSupply, 18),
      formatUnits(nextSupply.sub(prevSupply), 18)
    )

    await dbRun(`
      INSERT INTO usdgSupply (blockNumber, supply)
      VALUES (?, ?)
    `, [record.blockNumber, JSON.stringify(nextSupply)])

    prevSupply = nextSupply
  }
}

const retrieveVaultLogs = retrieveLogsFactory({
  decoder: new ethers.utils.Interface(vaultAbi),
  name: 'Vault',
  address: addresses.Vault,
  tableName: 'vaultLogs'
})

const retrieveUsdgLogs = retrieveLogsFactory({
  decoder: new ethers.utils.Interface(tokenAbi),
  name: 'USDG',
  address: addresses.USDG,
  tableName: 'usdgLogs'
})

async function dbAll(query, ...args) {
  return new Promise((resolve, reject) => {
    args.push((err, rows) => {
      if (err) return reject(err)
      resolve(rows)
    })
    db.all(query, ...args)
  })  
}

async function dbRun(query, ...args) {
  return new Promise((resolve, reject) => {
    args.push((err) => {
      if (err) return reject(err)
      resolve()
    })
    db.run(query, ...args)
  })  
}

async function dbGet(query, ...args) {
  return new Promise((resolve, reject) => {
    args.push((err, row) => {
      if (err) return reject(err)
      resolve(row)
    })
    db.get(query, ...args)
  })
}

async function retrieveTransactionsForLogs({ tableName }) {
  console.log('retrieve transactions for logs tableName=%s...', tableName)

  const txHashes = (await dbAll(`
    SELECT
      distinct(l.txHash)
    FROM ${tableName} l
    LEFT JOIN transactions t on t.hash = l.txHash
    WHERE t.hash IS NULL
  `)).map(row => row.txHash)

  console.log('found %s logs without corresponding transactions', txHashes.length)
  if (txHashes.length === 0) {
    console.log('skip')
    return
  }

  const perChunk = 50
  const chunksCount = Math.ceil(txHashes.length / perChunk)
  let i = 0
  while (i < chunksCount) {
    const chunkNumbers = txHashes.slice(i * perChunk, i * perChunk + perChunk)
    console.log('processing transactions %s', chunkNumbers.join(','))
    const transactions = await getTransactions(chunkNumbers)  
    for (const tx of transactions) {
      await dbRun(`
        INSERT INTO transactions (hash, \`to\`, \`from\`, blockNumber)
        VALUES (?, ?, ?, ?)
      `, [tx.hash, tx.to, tx.from, tx.blockNumber])
    }
    console.log('chunk done')
    i++
  }

  console.log('done')
}

function getTransactions(hashes) {
  return Promise.all(hashes.map(provider.getTransaction.bind(provider)))
}

function getBlocks(numbers) {
  return Promise.all(numbers.map(provider.getBlock.bind(provider)))
}

async function retrieveBlocksForLogs({ tableName }) {
  console.log('retrieve blocks for logs tableName=%s...', tableName)

  const blockNumbers = (await dbAll(`
    SELECT
      distinct(l.blockNumber)
    FROM ${tableName} l
    LEFT JOIN blocks b on b.number = l.blockNumber
    WHERE b.number IS NULL
  `)).map(row => row.blockNumber)

  console.log('found %s logs without corresponding blocks', blockNumbers.length)
  if (blockNumbers.length === 0) {
    console.log('skip')
    return
  }

  const perChunk = 50
  const chunksCount = Math.ceil(blockNumbers.length / perChunk)
  let i = 0
  while (i < chunksCount) {
    const chunkNumbers = blockNumbers.slice(i * perChunk, i * perChunk + perChunk)
    console.log('processing numbers %s', chunkNumbers.join(','))
    const blocks = await getBlocks(chunkNumbers)  
    for (const block of blocks) {
      await dbRun(`
        INSERT INTO blocks (number, hash, timestamp)
        VALUES (?, ?, ?)
      `, [block.number, block.hash, block.timestamp])
    }
    console.log('chunk done')
    i++
  }
  console.log('done')
}

const JOB_PERIOD = 1000 * 5

async function schedulePoolStatsJob() {
  await calculatePoolStats(true) 
  setTimeout(() => {
    schedulePoolStatsJob(true)
  }, JOB_PERIOD)
}

async function scheduleVaultLogsJob() {
  await retrieveVaultLogs({ backwards: true })
  await retrieveBlocksForLogs({ tableName: 'vaultLogs' })
  await retrieveTransactionsForLogs({ tableName: 'vaultLogs' })

  setTimeout(() => {
    scheduleVaultLogsJob()
  }, JOB_PERIOD)
}

async function scheduleUsdgLogsJob() {
  await retrieveUsdgLogs()
  await retrieveBlocksForLogs({ tableName: 'usdgLogs' })
  await retrieveTransactionsForLogs({ tableName: 'usdgLogs' })

  setTimeout(() => {
    scheduleUsdgLogsJob()
  }, JOB_PERIOD)
}

async function scheduleUsdgSupplyJob() {
  await calculateUsdgSupply(true)

  setTimeout(() => {
    scheduleUsdgSupplyJob()
  }, JOB_PERIOD)
}

async function retrievePrices() {
  console.log('retrieve prices')

  for (const token of TOKENS) {
    if (!token.coingeckoId) {
      console.log('no coingeckoId for %s. skip', token.symbol)
      continue
    }
    const url = `https://api.coingecko.com/api/v3/coins/${token.coingeckoId}/market_chart?vs_currency=usd&days=30`
    console.log('token %s, coingeckoId %s, url %s', token.symbol, token.coingeckoId, url)
    const data = await got(url, {
      responseType: 'json'
    })
    const prices = data.body.prices

    for (const [timestamp, price] of prices) {
      await dbRun(`
        INSERT OR IGNORE INTO prices (timestamp, price, symbol)
        VALUES (?, ?, ?)
      `, [
        parseInt(timestamp / 1000), // coingecko returns milliseconds
        price,
        token.symbol
      ])
    }
    console.log('%s done', token.symbol)
  }

  await loadPrices()
  console.log('done')
}

async function main() {
  while (true) {
    try {
      await runVaultLogsJob()
    } catch (ex) {
      console.error(ex)
    }
    await new Promise(resolve => {
      setTimeout(resolve, 10000)
    })
  }
}

const TOKENS = [
  {
    symbol: 'BTC',
    address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    defaultPrice: 35000,
    coingeckoId: 'bitcoin'
  },
  {
    symbol: 'ETH',
    address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    defaultPrice: 2000,
    coingeckoId: 'ethereum'
  },
  {
    symbol: 'BNB',
    address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    defaultPrice: 300,
    coingeckoId: 'binancecoin'
  },
  {
    symbol: 'USDG',
    address: '0x85E76cbf4893c1fbcB34dCF1239A91CE2A4CF5a7',
    defaultPrice: 1
  },
  {
    symbol: 'BUSD',
    address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    defaultPrice: 1,
    stable: true 
  },
  {
    symbol: 'USDT',
    address: '0x55d398326f99059fF775485246999027B3197955',
    defaultPrice: 1,
    stable: true 
  },
  {
    symbol: 'USDC',
    address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    defaultPrice: 1,
    stable: true 
  }
]
const TOKENS_BY_SYMBOL = TOKENS.reduce((memo, token) => {
  memo[token.symbol] = token
  return memo
}, {})
const TOKENS_BY_ADDRESS = TOKENS.reduce((memo, token) => {
  memo[token.address] = token
  return memo
}, {})

let cachedPrices = {}
async function loadPrices() {
  console.log('load prices into memory...')
  const rows = await dbAll(`
    SELECT symbol, timestamp, price
    FROM prices
    ORDER BY timestamp
  `)

  rows.forEach(row => {
    cachedPrices[row.symbol] = cachedPrices[row.symbol] || []
    cachedPrices[row.symbol].push(row)
  })
}

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

function ts2date(timestamp) {
  const d = new Date(timestamp * 1000)
  let month = d.getMonth() + 1
  if (month < 10) month = `0${month}`
  let day = d.getDate()
  if (day < 10) day = `0${day}`
  return `${d.getFullYear()}-${month}-${day}`
}

if (require.main) {
  app
    .disable('x-powered-by')
    .use(express.static(process.env.RAZZLE_PUBLIC_DIR))

  app.get('/ping', (req, res) => {
    res.send('ok')
  });

  const GROUP_PERIOD = 86400

  app.get('/api/usdgSupply', async (req, res) => {
    const rows = await dbAll(`
      SELECT s.supply, b.number, (b.timestamp / ${GROUP_PERIOD} * ${GROUP_PERIOD}) as timestamp
      FROM usdgSupply s
      INNER JOIN blocks b ON b.number = s.blockNumber
      GROUP BY timestamp / ${GROUP_PERIOD} 
      ORDER BY b.number
    `)

    const records = rows.map(UsdgSupplyRecord)

    return res.send(records)
  })

  app.get('/api/poolStats', async (req, res) => {
    const rows = await dbAll(`
      SELECT
        AVG(value) value,
        type,
        symbol,
        timestamp / ${3600} * ${3600} as timestamp
      FROM poolStats
      GROUP BY timestamp / ${3600}, type, symbol
      ORDER BY blockNumber
    `)

    const data = rows.reduce((memo, row) => {
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
        console.log(row.value, row.type, token.symbol, price)
        row.valueUsd = row.value * price
      }
      last[token.symbol] = last[token.symbol] || {}
      last[token.symbol][row.type] = row
      return memo
    }, [])
    res.send(data)
  })

  app.get('/api/volume', async (req, res) => {
    const rows = await dbAll(`
      SELECT l.args, l.name, b.number, b.timestamp
      FROM vaultLogs l
      INNER JOIN blocks b ON b.number = l.blockNumber
      WHERE l.name in ('IncreasePosition', 'DecreasePosition', 'LiquidatePosition', 'Swap', 'BuyUSDG', 'SellUSDG')
    `)

    let data = rows.reduce((memo, row) => {
      const key = Math.floor(row.timestamp / GROUP_PERIOD) * GROUP_PERIOD
      const record = LogRecord(row)
      memo[key] = memo[key] || {}

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
          value = Number(formatUnits(amountIn, 18)) * getPrice(tokenInAddress, row.timestamp)
        }
        type = 'swap'
      } else if (record.name === 'BuyUSDG') {
        value = Number(formatUnits(record.args[3], 18))
        type = 'mint'
      } else if (record.name === 'SellUSDG') {
        const token = record.args[1]
        value = Number(formatUnits(record.args[3], 18)) * getPrice(token, row.timestamp)
        type = 'burn'
      } else if (record.name === 'LiquidatePosition') {
        value = Number(formatUnits(record.args[5], 30))
        type = 'liquidation'
      } else {
        value = Number(formatUnits(record.args[5], 30))
        type = 'margin'
      }
      memo[key][type] = memo[key][type] || 0
      memo[key][type] += value
      return memo
    }, {})

    data = Object.entries(data).map(([timestamp, item]) => {
      return {
        timestamp: Number(timestamp),
        swap: item.swap,
        margin: item.margin,
        mint: item.mint,
        burn: item.burn,
        liquidation: item.liquidation,
      }
    })

    res.send(data)
  })

  app.get('/api/fees', async (req, res) => {
    const rows = await dbAll(`
      SELECT l.args, l.name, b.number, b.timestamp
      FROM vaultLogs l
      INNER JOIN blocks b ON b.number = l.blockNumber
      WHERE l.name in ('CollectMarginFees', 'CollectSwapFees')
    `)

    let feesData = rows.map(row => {
      const record = LogRecord(row)

      return {
        timestamp: record.timestamp,
        feeUsd: parseFloat(formatUnits(record.args[1], 30)),
        feeToken: parseFloat(formatUnits(record.args[1], 18)),
        name: record.name,
        token: record.args[0]
      }
    })

    const grouped = feesData.reduce((memo, el) => {
      const key = Math.floor(el.timestamp / GROUP_PERIOD) * GROUP_PERIOD

      memo[key] = memo[key] || {}
      memo[key].all = memo[key].all || 0

      if (el.name == 'CollectMarginFees') {
        memo[key].margin = (memo[key].margin || 0) + el.feeUsd
      } else {
        let type;
        const feeUsd = el.feeToken * getPrice(el.token, el.timestamp)
        memo[key].swap = (memo[key].swap || 0) + feeUsd
      }
      return memo
    }, {})

    feesData = Object.entries(grouped).map(([timestamp, item]) => {
      return {
        timestamp,
        ...item
      }
    })

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

  retrievePrices()

  // schedulePoolStatsJob()

  // scheduleVaultLogsJob()
  // scheduleUsdgLogsJob()
  // scheduleUsdgSupplyJob()
}

export default app;
