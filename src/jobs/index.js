import Logger from 'console-log-level'
import { ethers } from 'ethers'
import got from 'got'

import { TOKENS, TOKENS_BY_ADDRESS } from '../tokens'
import { db, dbRun, dbAll, dbGet } from '../db'
import { contracts } from '../contracts'
import { vaultAbi, tokenAbi } from '../contracts'
import { addresses, BSC, ARBITRUM } from '../addresses'
import {
	LogRecord,
	UsdgSupplyRecord,
	getLatestReliableBlockNumber,
	getLatestReliableBlock,
	queryProviderLogs,
	getBlocks,
	getTransactions,
	getLogger
} from '../helpers'

import { calculateUsdgSupply } from './usdg'

const { formatUnits} = ethers.utils
const { BigNumber } = ethers
const { AddressZero } = ethers.constants

const logger = getLogger('jobs')

const RUN_JOBS_LOCALY = false
const DEFAULT_JOB_INTERVAL = 3000
const BACKWARDS = false
const BLOCKS_PER_JOB = 1000

export default function ({ db }) {
	const jobs = [
	  {
	    name: 'BTC ChainlinkPrices Arbitrum',
	    run: async () => {
	      await retrieveChainlinkPrices({ symbol: 'BTC', chainId: ARBITRUM, backwards: BACKWARDS })
	    },
	    interval: 1000 * 60 * 10,
	    // disabled: true
	  },
	  {
	    name: 'ETH ChainlinkPrices Arbitrum',
	    run: async () => {
	      await retrieveChainlinkPrices({ symbol: 'ETH', chainId: ARBITRUM, backwards: BACKWARDS })
	    },
	    interval: 1000 * 60 * 10,
	    // disabled: true
	  },
	  {
	    name: 'BTC ChainlinkPrices BSC',
	    run: async () => {
	      await retrieveChainlinkPrices({ symbol: 'BTC', chainId: BSC, backwards: BACKWARDS })
	    },
	    interval: DEFAULT_JOB_INTERVAL * 10,
	    // disabled: true
	  },
	  {
	    name: 'ETH ChainlinkPrices BSC',
	    run: async () => {
	      await retrieveChainlinkPrices({ symbol: 'ETH', chainId: BSC, backwards: BACKWARDS })
	    },
	    interval: DEFAULT_JOB_INTERVAL * 10,
	    // disabled: true
	  },
	  {
	    name: 'BNB ChainlinkPrices BSC',
	    run: async () => {
	      await retrieveChainlinkPrices({ symbol: 'BNB', chainId: BSC, backwards: BACKWARDS })
	    },
	    interval: DEFAULT_JOB_INTERVAL * 10,
	    // disabled: true
	  },
	  {
	    name: 'PoolStats',
	    run: async () => {
	      calculatePoolStats({ backwards: BACKWARDS })
	    },
	    interval: DEFAULT_JOB_INTERVAL * 3,
	    // disabled: true
	  },
	  {
	    name: 'VaultLogs',
	    run: async () => {
	      await retrieveVaultLogs({ backwards: BACKWARDS })
	      await retrieveQueuedBlocks({ tableName: 'vaultLogs' })
	      await retrieveQueuedTransactions({ tableName: 'vaultLogs' })
	    },
	    interval: DEFAULT_JOB_INTERVAL,
	    // disabled: true
	  },
	  {
	    name: 'Usdg',
	    run: async () => {
	      await retrieveUsdgLogs({ backwards: BACKWARDS })
	      await retrieveQueuedBlocks({ tableName: 'usdgLogs' })
	      await retrieveQueuedTransactions({ tableName: 'usdgLogs' })
	      await calculateUsdgSupply({ db, backwards: BACKWARDS })
	    },
	    interval: DEFAULT_JOB_INTERVAL * 3,
	    // disabled: true
	  },
	  {
	    name: 'CoingeckoPrices',
	    run: async () => {
	      await retrievePrices()
	    },
	    interval: DEFAULT_JOB_INTERVAL * 30,
	    // disabled: true
	  }
	]

	async function getMeta(key) {
	  const row = await dbGet('SELECT value FROM meta WHERE key = ?', [key]) 
	  if (!row) {
	    return null
	  }
	  const ret = JSON.parse(row.value)
	  if (ret.type === 'BigNumber') {
	    return BigNumber.from(ret.hex)
	  }
	  return ret
	}

	async function setMeta(key, value) {
	  const valueJson = JSON.stringify(value)
	  logger.info('setMeta %s %s %s', key, valueJson, typeof value)
	  await dbRun(`
	    INSERT INTO meta (key, value)
	    VALUES (?, ?)
	    ON CONFLICT(key) DO UPDATE SET value = ?
	  `, key, valueJson, valueJson)
	}

	async function retrievePrices() {
	  logger.info('retrieve prices')

	  for (const token of TOKENS) {
	    if (!token.coingeckoId) {
	      logger.info('no coingeckoId for %s. skip', token.symbol)
	      continue
	    }
	    const url = `https://api.coingecko.com/api/v3/coins/${token.coingeckoId}/market_chart?vs_currency=usd&days=30`
	    logger.info('token %s, coingeckoId %s, url %s', token.symbol, token.coingeckoId, url)
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
	    logger.info('%s done', token.symbol)
	  }
	  logger.info('done')
	}

	async function retrieveChainlinkPrices({ symbol, chainId = BSC, backwards = false }) {
	  logger.info('Retrieve chainlink prices chainId: %s, symbol: %s, backwards: %s',
	  	chainId,
	  	symbol,
	  	backwards
	  )
	  const { chainlinkFeedContracts } = contracts[chainId]
	  if (!(symbol in chainlinkFeedContracts)) {
	    logger.warn('unknown symbol %s. Skip', symbol) 
	    return
	  }
	  const feed = chainlinkFeedContracts[symbol]
	  const chainIdSuffix = chainId === BSC ? '' : `_${chainId}`
	  const tableName = `chainlinkPrices${chainIdSuffix}`
	  console.log('tableName: %s', tableName)

	  const latestRound = await feed.latestRound()

	  const metaKey = `chainlink_prices_${symbol}_${backwards ? 'oldest' : 'newest'}_round${chainIdSuffix}`
	  let lastProcessedRound = await getMeta(metaKey)

	  if (!lastProcessedRound) {
	    logger.info('meta %s is null, retrieve from existing prices', metaKey) 
	    const row = await dbGet(`
	      SELECT round
	      FROM ${tableName}
	      WHERE symbol = ?
	      ORDER BY timestamp ${backwards ? 'ASC' : 'DESC'}
	      LIMIT 1
	    `, [symbol])
	    if (row) {
	      lastProcessedRound = BigNumber.from(row.round)
	      logger.info('Record found, row round is: %s', row.round)
	    } else {
	      logger.info('No records')
	    }
	  }

	  logger.info('latestRound: %s, metaKey: %s, lastProcessedRound: %s',
	    latestRound,
	    metaKey,
	    lastProcessedRound
	  )

	  const anchorRound = lastProcessedRound
	    ? lastProcessedRound
	    : (backwards ? latestRound.add(1) : latestRound.sub(1))
	  const ROUNDS_PER_JOB = 100

	  logger.info('anchorRound: %s', anchorRound.toString())

	  let i = 0
	  let round = backwards ? anchorRound.sub(1) : anchorRound.add(1)
	  const roundDataPromises = []
	  while (i++ < ROUNDS_PER_JOB) {
	    if (round.gt(latestRound) || round.lt(0)) {
	      logger.info('round %s is out of rage. Stop', round.toString())
	      break
	    }

	    roundDataPromises.push(feed.getRoundData(round))
	    round = backwards ? round.sub(1) : round.add(1)
	  }

	  const roundDatas = await Promise.all(roundDataPromises)
	  if (roundDatas.length === 0) {
	    logger.info('0 rounds retrieved. Stop')
	    return
	  }

	  for (const roundData of roundDatas) {
	    if (!roundData[0]) {
	      logger.warn('No data for round %s. Stop', round)
	      break
	    }

	    await dbRun(`
	      INSERT OR IGNORE INTO ${tableName} (symbol, round, timestamp, price)
	      VALUES (?, ?, ?, ?)
	    `, [symbol, roundData.roundId, roundData.updatedAt, roundData.answer.toNumber()])
	  }

	  await setMeta(metaKey, roundDatas[roundDatas.length - 1].roundId)
	}

	function retrieveLogsFactory({ decoder, address, tableName, name = 'unknown' } = {}) {
	  return async ({ backwards = false } = {}) => {
	    logger.info('retrieve %s logs backwards=%s, address=%s, blocks per job=%s',
	      name,
	      backwards,
	      address,
	      BLOCKS_PER_JOB
	    )

	    const latestBlockNumber = await getLatestReliableBlockNumber()

	    const lastProcessedBlockMetaKey = `${tableName}_${backwards ? 'oldest' : 'newest'}ProcessedBlock`
	    let lastProcessedBlock = await getMeta(lastProcessedBlockMetaKey)

	    if (!lastProcessedBlock) {
	      logger.info('%s is null, retrieve from logs')
	      const row = dbGet(`
	        SELECT blockNumber
	        FROM ${tableName}
	        ORDER BY blockNumber ${backwards ? 'ASC' : 'DESC'}
	        LIMIT 1
	      `)
	      if (row) {
	        lastProcessedBlock = row.blockNumber
	        logger.info('Record found, row blockNumber is: %s', row.blockNumber)
	      } else {
	        logger.info('No records')
	      }
	    }

	    logger.info('lastProcessedBlockMetaKey: %s, lastProcessedBlock: %s',
	      lastProcessedBlockMetaKey,
	      lastProcessedBlock
	    )

	    if (lastProcessedBlock <= 0) {
			logger.info('lastProcessedBlock <= 0. Skip')	    	
			return
	    }

	    const anchorNumber = lastProcessedBlock ? lastProcessedBlock : latestBlockNumber
	    logger.info('anchorNumber: %s, blocks ahead: %s',
	      anchorNumber,
	      latestBlockNumber - anchorNumber
	    )

	    let toBlock
	    let fromBlock
	    if (backwards) {
	      toBlock = anchorNumber - 1
	      fromBlock = Math.max(toBlock - BLOCKS_PER_JOB, 0)
	    } else {
	      fromBlock = anchorNumber + 1
	      toBlock = Math.min(latestBlockNumber, fromBlock + BLOCKS_PER_JOB)
	    }

	    const logResults = await queryProviderLogs({ fromBlock, toBlock, address, backwards })
	    logger.info('retrieved %s results', logResults.length)

	    logger.info('insert data into db')
	    for (const logResult of logResults) {
	      const logData = decoder.parseLog(logResult)
	      await new Promise((resolve, reject) => {
	        db.serialize(async () => {
	          try {
	            await dbRun('BEGIN')
	            await dbRun(`INSERT OR IGNORE INTO blocksQueue (number) VALUES (?)`, [logResult.blockNumber])
	            await dbRun(`INSERT OR IGNORE INTO transactionsQueue (hash) VALUES (?)`, [logResult.transactionHash])
	            await dbRun(`INSERT OR IGNORE INTO ${tableName}
	              (blockNumber, blockHash, txHash, name, args, logIndex)
	              VALUES (?, ?, ?, ?, ?, ?) 
	            `, [
	              logResult.blockNumber,
	              logResult.blockHash,
	              logResult.transactionHash,
	              logData.name,
	              JSON.stringify(logData.args),
	              logResult.logIndex
	            ])
	            await dbRun('COMMIT')
	            resolve()
	          } catch (ex) {
	          	try {
		            await dbRun('ROLLBACK')
	          	} catch {}
	            reject(ex)
	          }
	        })
	      })
	    }
	    setMeta(lastProcessedBlockMetaKey, backwards ? fromBlock : toBlock)
	    logger.info('logs insertion done')
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
	    INSERT OR IGNORE INTO poolStats (value, valueHex, symbol, type, timestamp, blockNumber, logIndex)
	    VALUES (?, ?, ?, ?, ?, ?, ?)
	  `, [formatUnits(value, 18), value.toHexString(), symbol, type, timestamp, blockNumber, logIndex])
	}

	async function retrieveLatestPoolStats(lastBlock) {
	  const vaultContract = contracts[BSC].vaultContract
	  let fakeLogIndex = 0
	  for (const token of TOKENS) {
	    if (token.symbol === 'USDG') {
	      continue
	    }
	    const [poolAmount, usdgAmount, reservedAmount] = await Promise.all([
	      vaultContract.poolAmounts(token.address),
	      vaultContract.usdgAmounts(token.address),
	      vaultContract.reservedAmounts(token.address)
	    ])
	    logger.info('%s poolAmount: %s, usdgAmount: %s, reserevedAmount: %s. inserting...',
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
	    logger.info('%s done', token.symbol)
	  }
	  logger.info('done')
	}

	async function calculatePoolStats({ backwards = false } = {}) {
	  logger.info('Calculate pool stats based on logs')
	  const anchor = await dbGet(`
	    SELECT blockNumber
	    FROM poolStats
	    ORDER BY blockNumber ${backwards ? 'ASC' : 'DESC'}
	    LIMIT 1
	  `)

	  let anchorBlockNumber
	  if (!anchor) {
	    logger.info('no anchor, retrieve from chain')

	    const lastBlock = await getLatestReliableBlock()
	    anchorBlockNumber = await getLatestReliableBlockNumber()

	    await retrieveLatestPoolStats(lastBlock)
	  } else {
	    anchorBlockNumber = anchor.blockNumber
	  }

	  logger.info('anchor blockNumber=%s, backwards=%s',
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
	      AND l.blockNumber ${backwards ? '<' : '>'} ${anchorBlockNumber}
	    ORDER BY l.blockNumber ${orderKey}, l.logIndex ${orderKey}
	    LIMIT 10000
	  `)

	  if (logs.length === 0) {
	    logger.info('no unprocessed logs. skip')
	    return
	  }
	  logger.info('%s logs to process', logs.length)

	  const anchorStats = await getAnchorPoolStats(backwards)
	  Object.keys(anchorStats).forEach(symbol => {
	    logger.info('%s stats %s', symbol, JSON.stringify(anchorStats[symbol])) 
	  })

	  for (const log of logs) {
	    const record = LogRecord(log)
	    const [tokenAddress, amount] = record.args
	    const token = TOKENS_BY_ADDRESS[tokenAddress]

	    if (!token) {
	      logger.warn('unsupported token address %s', tokenAddress)
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
	      logger.warn('unsupported event %s', name)
	      continue
	    }

	    const stats = anchorStats[token.symbol][type]
	    const shouldAdd = (increase && !backwards) || (!increase && backwards)

	    const current = BigNumber.from(stats.valueHex)
	    const next = shouldAdd ? current.add(amount) : current.sub(amount)

	    logger.info('%s %s %s (%s), prev: %s, next: %s, diff: %s, tx %s (%s)', 
	      token.symbol,
	      type,
	      new Date(record.timestamp * 1000),
	      blockNumber,
	      formatUnits(current, 18).slice(0, 7),
	      formatUnits(next, 18).slice(0, 7),
	      formatUnits(next.sub(current), 18).slice(0, 7),
	      name,
	      record.txHash,
	      record.logIndex
	    )

	    if (next.lt(0)) {
	      logger.error('ZERO %s %s', current.toString(), next.toString())
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
	  logger.info('done')
	}

	const retrieveVaultLogs = retrieveLogsFactory({
	  decoder: new ethers.utils.Interface(vaultAbi),
	  name: 'Vault',
	  address: addresses[BSC].Vault,
	  tableName: 'vaultLogs'
	})

	const retrieveUsdgLogs = retrieveLogsFactory({
	  decoder: new ethers.utils.Interface(tokenAbi),
	  name: 'USDG',
	  address: addresses[BSC].USDG,
	  tableName: 'usdgLogs'
	})

	function sleep(period) {
	  return new Promise(resolve => {
	    setTimeout(resolve, period)
	  })
	}

	async function initJobs() {
	  const activeJobs = jobs.filter(job => !job.disabled)
	  logger.info('Init jobs %s, total: %s', activeJobs.map(job => job.name).join(', '), activeJobs.length)
	  if (activeJobs.length === 0) {
	    logger.info('skip')
	    return
	  }

	  let i = 0
	  while (true) {
	    const now = Date.now()
	    const job = activeJobs[i % activeJobs.length]

	    if (!job.lastRun || now - job.lastRun > job.interval) {
	      logger.info('run job %s', job.name)
	      try {
	        await job.run()
	        logger.info('job %s finished in %s ms', job.name, Date.now() - now)
	      } catch (ex) {
	        logger.error('job %s failed', job.name)
	        logger.error(ex)
          if (process.env.NODE_ENV !== 'production') {
            throw ex
          }
	      }
	      job.lastRun = Date.now()
	    }

	    i++
	    await sleep(200)
	  }
	}

	async function retrieveQueuedTransactions({ tableName }) {
	  logger.info('retrieve transactions for logs tableName=%s...', tableName)

	  const txHashes = (await dbAll(`
	    SELECT DISTINCT(hash) FROM transactionsQueue
	  `)).map(row => row.hash)

	  logger.info('found %s logs without corresponding transactions', txHashes.length)
	  if (txHashes.length === 0) {
	    logger.info('skip')
	    return
	  }

	  const perChunk = 50
	  const chunksCount = Math.ceil(txHashes.length / perChunk)
	  let i = 0
	  while (i < chunksCount) {
	    const chunkNumbers = txHashes.slice(i * perChunk, i * perChunk + perChunk)
	    logger.info('processing transactions %s', chunkNumbers.join(','))
	    const transactions = await getTransactions(chunkNumbers)  
	    for (const tx of transactions) {
	      await dbRun(`
	        INSERT OR IGNORE INTO transactions (hash, \`to\`, \`from\`, blockNumber)
	        VALUES (?, ?, ?, ?)
	      `, [tx.hash, tx.to, tx.from, tx.blockNumber])
	      await dbRun(`DELETE FROM transactionsQueue WHERE hash = ?`, [tx.hash])
	    }
	    logger.info('chunk done')
	    i++
	  }

	  logger.info('done')
	}

	async function retrieveQueuedBlocks({ tableName }) {
	  logger.info('retrieve blocks for logs tableName=%s...', tableName)

	  const blockNumbers = (await dbAll(`
	    SELECT DISTINCT(number) FROM blocksQueue
	  `)).map(row => row.number)

	  logger.info('found %s logs without corresponding blocks', blockNumbers.length)
	  if (blockNumbers.length === 0) {
	    logger.info('skip')
	    return
	  }

	  const perChunk = 10
	  const chunksCount = Math.ceil(blockNumbers.length / perChunk)
	  let i = 0
	  while (i < chunksCount) {
	    const chunkNumbers = blockNumbers.slice(i * perChunk, i * perChunk + perChunk)
	    logger.info('processing numbers %s', chunkNumbers.join(','))
	    const blocks = await getBlocks(chunkNumbers)  
	    for (const block of blocks) {
	      await dbRun(`
	        INSERT OR IGNORE INTO blocks (number, hash, timestamp)
	        VALUES (?, ?, ?)
	      `, [block.number, block.hash, block.timestamp])
	      await dbRun(`DELETE FROM blocksQueue WHERE number = ?`, [block.number])
	    }
	    logger.info('chunk done')
	    i++
	  }
	  logger.info('done')
	}

  if (process.env.NODE_ENV === 'production' || RUN_JOBS_LOCALY) {
    initJobs()
  }
}