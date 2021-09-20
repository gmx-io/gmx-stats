import { contracts } from '../contracts'
import { ethers } from 'ethers'
import {
  getLogger
} from '../helpers'
import { BSC } from '../addresses'
import {
  dbGet,
  dbRun,
  getMeta,
  setMeta
} from '../db'

const logger = getLogger('jobs/chainlinkPrices')
const { BigNumber } = ethers

export async function retrieveChainlinkPrices({ symbol, chainId = BSC, backwards = false }) {
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
  while (i++ < ROUNDS_PER_JOB - 1) {
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
