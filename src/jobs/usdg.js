import { ethers } from 'ethers'

import {
	getLogger,
	UsdgSupplyRecord,
	LogRecord
} from '../helpers'
import {
	dbGet,
	dbRun,
	dbAll,
	getLatestReliableBlock
} from '../db'
import { usdgContract, chainlinkFeedContracts } from '../contracts'

const { AddressZero } = ethers.constants
const { formatUnits } = ethers.utils
const logger = getLogger('jobs/usdg')

export async function calculateUsdgSupply({ backwards = false } = {}) {
  logger.info('Calculate usdg supply based on logs')
  const row = await dbGet(`
    SELECT supply, blockNumber
    FROM usdgSupply
    ORDER BY blockNumber ${backwards ? 'ASC' : 'DESC'}
    LIMIT 1
  `)

  let anchor

  if (row) {
    anchor = UsdgSupplyRecord(row)
  } else {
    logger.info('No record in db. Retrieve')

    const [
      block,
      totalSupply
    ] = await Promise.all([
      getLatestReliableBlock(),
      usdgContract.totalSupply()
    ])

    await dbRun(`
      INSERT INTO usdgSupply (blockNumber, supply)
      VALUES (?, ?)
    `, [block.number, JSON.stringify(totalSupply)])

    logger.debug('Result! %s %s', block.number, formatUnits(totalSupply, 18))

    anchor = UsdgSupplyRecord({
      blockNumber: block.number,
      supply: totalSupply
    })
  }

  logger.info('anchor blockNumber=%s, supply=%s, backwards=%s',
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
    logger.info('no unprocessed logs. skip')
    return
  }
  logger.info('%s logs to process', logs.length)

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

    logger.info('block: %s, prev: %s, next: %s, diff: %s', 
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
