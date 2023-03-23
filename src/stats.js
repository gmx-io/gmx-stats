import { gql } from '@apollo/client'
import { ethers } from 'ethers'
import { getLogger } from './helpers'

import TtlCache from './ttl-cache'
import { getStatsClient } from './graph'
import { ARBITRUM, AVALANCHE } from './addresses'

const CACHE_TTL = 300
const ttlCache = new TtlCache(CACHE_TTL, 10)

const logger = getLogger('stats')

async function updateCache() {
  try {
    const start = Date.now()
    await get24HourVolume(false);
    logger.info('24h volume updated in %sms', Date.now() - start)
  } catch (ex) {
    logger.error(ex)
  }
  
  setTimeout(updateCache, CACHE_TTL / 2 * 1000);
}
updateCache();

async function get24HourVolumeForChain(chainId) {
  const client = getStatsClient(chainId);
  const query = `{
    volumeStats(
      orderBy: ${chainId === ARBITRUM ? "id" : "timestamp"},
      orderDirection: desc,
      first: 24
      where: { period: hourly }
    ) {
      swap
      margin
      liquidation
      mint
      burn
    }
  }`;


  const { data } = await client.query({ query: gql(query) })

  const volume = data.volumeStats.reduce((acc, item) => {
    return acc.add(item.swap).add(item.margin).add(item.liquidation).add(item.mint).add(item.burn);
  }, ethers.BigNumber.from(0));
  
  return volume;
}

export async function get24HourVolume(useCache = true) {
  const cached = ttlCache.get('24HourVolume')
  if (useCache && cached) {
    return cached
  }
  
  logger.info('Requesting 24h volume from subgraphs')
  const [arbitrumVolume, avalancheVolume] = await Promise.all([
    get24HourVolumeForChain(ARBITRUM),
    get24HourVolumeForChain(AVALANCHE)
  ]);

  const totalVolume = arbitrumVolume.add(avalancheVolume);
  const ret = {
    [ARBITRUM]: arbitrumVolume.toString(),
    [AVALANCHE]: avalancheVolume.toString(),
    total: totalVolume.toString()
  }
  ttlCache.set('24HourVolume', ret)

  return ret
}
