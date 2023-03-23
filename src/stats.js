import { gql } from '@apollo/client'
import { ethers } from 'ethers'

import TtlCache from './ttl-cache'
import { getStatsClient } from './graph'
import { ARBITRUM, AVALANCHE } from './addresses'

const CACHE_TTL = 300
const ttlCache = new TtlCache(CACHE_TTL, 10)

setInterval(() => {
  console.log("Updating 24 hour volume cache")
  get24HourVolume(false);
}, Math.max(CACHE_TTL - 30, 10) * 1000);

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
