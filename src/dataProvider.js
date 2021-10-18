import { useMemo, useState, useEffect } from 'react'
import { ApolloClient, InMemoryCache, gql, HttpLink } from '@apollo/client'
import { chain, sumBy, sortBy, maxBy, minBy } from 'lodash'
import fetch from 'cross-fetch';
import * as ethers from 'ethers'

import { fillPeriods } from './helpers'

const BigNumber = ethers.BigNumber
const formatUnits = ethers.utils.formatUnits
const provider = new ethers.providers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');

const DEFAULT_GROUP_PERIOD = 86400

const tokenDecimals = {
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": 18, // WETH
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": 8, // BTC
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": 6, // USDC
  "0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0": 18, // UNI
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": 6, // USDT
  "0xf97f4df75117a78c1a5a0dbb814af92458539fb4": 18 // LINK
}

function getTokenDecimals(token) {
  return tokenDecimals[token] || 18
}

const knownSwapSources = {
  "0xabbc5f99639c9b6bcb58544ddf04efa6802f4064": 'GMX',
  "0x3b6067d4caa8a14c63fdbe6318f27a0bbc9f9237": 'Dodo'
}

const defaultFetcher = url => fetch(url).then(res => res.json())
export function useRequest(url, defaultValue, fetcher = defaultFetcher) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState()
  const [data, setData] = useState(defaultValue) 

  useEffect(async () => {
    try {
      setLoading(true)
      const data = await fetcher(url)
      setData(data)
    } catch (ex) {
      console.error(ex)
      setError(ex)
    }
    setLoading(false)
  }, [url])

  return [data, loading, error]
}

export function useCoingeckoPrices(symbol) {
  const _symbol = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    LINK: 'chainlink',
    UNI: 'uniswap'
  }[symbol]

  const now = Date.now() / 1000
  const fromTs = +new Date(2021, 8, 1) / 1000
  const days = Math.floor(now / 86400) - Math.floor(fromTs / 86400)

  const url = `https://api.coingecko.com/api/v3/coins/${_symbol}/market_chart?vs_currency=usd&days=${days}&interval=daily`

  let [data, loading, error] = useRequest(url)

  if (data && data.prices.length > 1) {
    data = data.prices.map(item => {
      // -1 is for shifting to previous day
      // because CG uses first price of the day, but for GLP we store last price of the day
      const groupTs = parseInt((item[0] - 1) / 1000 / 86400) * 86400
      return {
        timestamp: groupTs,
        value: item[1]
      }
    })
  }

  return [data, loading, error]
}

function getImpermanentLoss(change) {
  return 2 * Math.sqrt(change) / (1 + change) - 1
} 

export function useGraph(querySource, { subgraph = 'gmx-io/gmx-stats', subgraphUrl = null } = {}) {
  const query = gql(querySource)

  if (!subgraphUrl) {
    subgraphUrl = `https://api.thegraph.com/subgraphs/name/${subgraph}`;
  }
  const client = new ApolloClient({
    link: new HttpLink({ uri: subgraphUrl, fetch }),
    cache: new InMemoryCache()
  })
  const [data, setData] = useState()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.query({query}).then(res => {
      setData(res.data)
      setLoading(false)
    })
  }, [querySource, setData, setLoading])

  return [data, loading]
}

export function useGambitPoolStats({ from, to, groupPeriod }) {
  const [data, loading, error] = useGraph(`{
    hourlyPoolStats (
      first: 1000,
      where: { id_gte: ${from}, id_lte: ${to} }
      orderBy: id
      orderDirection: desc
    ) {
      id,
      usdgSupply,
      BTC,
      ETH,
      BNB,
      USDC,
      USDT,
      BUSD
    }
  }`, { subgraph: 'gkrasulya/gambit' })

  const ret = useMemo(() => {
    if (!data) {
       return null
    } 
    let ret = data.hourlyPoolStats.map(item => {
      return Object.entries(item).reduce((memo, [key, value]) => {
        if (key === 'id') memo.timestamp = value
        else if (key === 'usdgSupply') memo.usdgSupply = value / 1e18
        else memo[key] = value / 1e30
        return memo
      }, {})
    })

    ret = chain(ret)
      .sortBy('timestamp')
      .groupBy(item => Math.floor(item.timestamp / groupPeriod) * groupPeriod)
      .map((values, timestamp) => {
        return {
          ...values[values.length - 1],
          timestamp
        }
      })
      .value()

     return fillPeriods(ret, { period: groupPeriod, from, to, interpolate: false, extrapolate: true })
  }, [data])

  return [ret, loading, error]
}

export function useLastBlock() {
  const [data, setData] = useState()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  useEffect(() => {
    provider.getBlock()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  return [data, loading, error]
}

export function useLastSubgraphBlock() {
  const [data, loading, error] = useGraph(`{
    _meta {
      block {
        number
      }
    } 
  }`)
  const [block, setBlock] = useState(null)

  useEffect(() => {
    if (!data) {
      return
    } 

    provider.getBlock(data._meta.block.number).then(block => {
      setBlock(block)
    })
  }, [data, setBlock])

  return [block, loading, error]
}

export function useTradersData({ groupPeriod = DEFAULT_GROUP_PERIOD } = {}) {
  const [closedPositionsData, loading, error] = useGraph(`{
     c1: aggregatedTradeCloseds(first: 1000, orderBy: indexedAt, orderDirection: desc) {
      settledPosition {
        realisedPnl
      },
      indexedAt
    } 
    c2: aggregatedTradeCloseds(first: 1000, skip: 1000, orderBy: indexedAt, orderDirection: desc) {
      settledPosition {
        realisedPnl
      },
      indexedAt
    } 
    c3: aggregatedTradeCloseds(first: 1000, skip: 2000, orderBy: indexedAt, orderDirection: desc) {
      settledPosition {
        realisedPnl
      },
      indexedAt
    } 
    c4: aggregatedTradeCloseds(first: 1000, skip: 3000, orderBy: indexedAt, orderDirection: desc) {
      settledPosition {
        realisedPnl
      },
      indexedAt
    } 
    c5: aggregatedTradeCloseds(first: 1000, skip: 4000, orderBy: indexedAt, orderDirection: desc) {
      settledPosition {
        realisedPnl
      },
      indexedAt
    }
    c6: aggregatedTradeCloseds(first: 1000, skip: 5000, orderBy: indexedAt, orderDirection: desc) {
      settledPosition {
        realisedPnl
      },
      indexedAt
    }
  }`, { subgraph: 'nissoh/gmx-vault' })

  const [liquidatedPositionsData] = useGraph(`{
    l1: aggregatedTradeLiquidateds(first: 1000, orderBy: indexedAt, orderDirection: desc) {
      settledPosition {
        collateral
      },
      indexedAt
    } 
    l2: aggregatedTradeLiquidateds(first: 1000, skip: 1000, orderBy: indexedAt, orderDirection: desc) {
      settledPosition {
        collateral
      },
      indexedAt
    } 
    l3: aggregatedTradeLiquidateds(first: 1000, skip: 2000, orderBy: indexedAt, orderDirection: desc) {
      settledPosition {
        collateral
      },
      indexedAt
    }
    l4: aggregatedTradeLiquidateds(first: 1000, skip: 3000, orderBy: indexedAt, orderDirection: desc) {
      settledPosition {
        collateral
      },
      indexedAt
    }
    l5: aggregatedTradeLiquidateds(first: 1000, skip: 4000, orderBy: indexedAt, orderDirection: desc) {
      settledPosition {
        collateral
      },
      indexedAt
    }
    l6: aggregatedTradeLiquidateds(first: 1000, skip: 5000, orderBy: indexedAt, orderDirection: desc) {
      settledPosition {
        collateral
      },
      indexedAt
    }
  }`, { subgraph: 'nissoh/gmx-vault' })

  let ret = null
  if (closedPositionsData && liquidatedPositionsData) {
    let data = [
      ...sortBy([
        ...closedPositionsData.c1,
        ...closedPositionsData.c2,
        ...closedPositionsData.c3,
        ...closedPositionsData.c4,
        ...closedPositionsData.c5,
        ...closedPositionsData.c6
      ], el => el.indexedAt).map(item => {
        const pnl = Number(item.settledPosition?.realisedPnl || 0) / 1e30
        return {
          timestamp: item.indexedAt,
          pnl,
          profit: pnl > 0 ? pnl : 0,
          loss: pnl < 0 ? pnl : 0
        }
      }),
      ...sortBy([
        ...liquidatedPositionsData.l1, 
        ...liquidatedPositionsData.l2, 
        ...liquidatedPositionsData.l3,
        ...liquidatedPositionsData.l4,
        ...liquidatedPositionsData.l5,
        ...liquidatedPositionsData.l6
      ], el => el.indexedAt).map(item => ({
        timestamp: item.indexedAt,
        pnl: -Number(item.settledPosition?.collateral || 0) / 1e30
      }))
     ]

    let cumulativePnl = 0 
    let cumulativeProfit = 0
    let cumulativeLoss = 0
    data = chain(data)
      .groupBy(item => Math.floor(item.timestamp / groupPeriod) * groupPeriod)
      .map((values, timestamp) => {
        const pnl = sumBy(values, 'pnl') || 0
        const profit = sumBy(values, 'profit') || 0
        const loss = sumBy(values, 'loss') || 0
        cumulativePnl += pnl
        cumulativeProfit += profit
        cumulativeLoss += loss
        return {
          pnl,
          cumulativePnl,
          cumulativeLoss,
          cumulativeProfit,
          profit,
          loss,
          timestamp: Number(timestamp)
        }
      })
      .value()

    const maxProfit = maxBy(data, item => item.profit).profit
    const maxLoss = minBy(data, item => item.loss).loss
    const maxProfitLoss = Math.max(maxProfit, -maxLoss)

    const maxPnl = maxBy(data, item => item.pnl).pnl
    const minPnl = minBy(data, item => item.pnl).pnl
    const maxCumulativePnl = maxBy(data, item => item.cumulativePnl).cumulativePnl
    const minCumulativePnl = minBy(data, item => item.cumulativePnl).cumulativePnl

    ret = {
      data,
      stats: {
        maxProfit,
        maxLoss,
        maxProfitLoss,
        cumulativeProfit,
        cumulativeLoss,
        maxCumulativeProfitLoss: Math.max(cumulativeProfit, -cumulativeLoss),

        maxAbsOfPnlAndCumulativePnl: Math.max(
          Math.abs(maxPnl),
          Math.abs(maxCumulativePnl),
          Math.abs(minPnl), 
          Math.abs(minCumulativePnl)
        ),
      }
    }
  }

  return [ret, loading]
}

export function useSwapSources({ groupPeriod = DEFAULT_GROUP_PERIOD } = {}) {
  const query = `{
    a: hourlyVolumeBySources(first: 1000 orderBy: timestamp orderDirection: desc) {
      timestamp
      source
      swap
    },
    b: hourlyVolumeBySources(first: 1000 skip: 1000 orderBy: timestamp orderDirection: desc) {
      timestamp
      source
      swap
    }
  }`
  const [graphData, loading, error] = useGraph(query)

  let total = 0
  let data = useMemo(() => {
    if (!graphData) {
      return null
    }

    let ret = chain([...graphData.a, ...graphData.b])
      .groupBy(item => parseInt(item.timestamp / groupPeriod) * groupPeriod)
      .map((values, timestamp) => {
        let all = 0
        const retItem = {
          timestamp: Number(timestamp),
          ...values.reduce((memo, item) => {
            const source = knownSwapSources[item.source] || item.source
            if (item.swap != 0) {
              const volume = item.swap / 1e30
              memo[source] = memo[source] || 0
              memo[source] += volume
              all += volume
            }
            return memo
          }, {})
        } 

        retItem.all = all

        return retItem
      })
      .sortBy(item => item.timestamp)
      .value()

    return ret
  }, [graphData])

  return [data, loading, error]
}

export function useVolumeDataFromServer() {
  const PROPS = 'margin liquidation swap mint burn'.split(' ')
  const [data, loading] = useRequest('https://gmx-server-mainnet.uw.r.appspot.com/daily_volume', null, async url => {
    let after
    const ret = []
    while (true) {
      const res = await (await fetch(url + (after ? `?after=${after}` : ''))).json()
      if (res.length === 0) return ret
      ret.push(...res)
      after = res[res.length - 1].id
    }
  })

  const ret = useMemo(() => {
     if (!data) {
       return null
     } 

     const tmp = data.reduce((memo, item) => {
        let type
        if (item.data.action === 'Swap') {
          type = 'swap'
        } else if (item.data.action === 'SellUSDG') {
          type = 'burn'
        } else if (item.data.action === 'BuyUSDG') {
          type = 'mint'
        } else if (item.data.action.includes('LiquidatePosition')) {
          type = 'liquidation'
        } else {
          type = 'margin'
        }
        const volume = Number(item.data.volume) / 1e30
        const timestamp = item.data.timestamp
        memo[timestamp] = memo[timestamp] || {}
        memo[timestamp][type] = memo[timestamp][type] || 0
        memo[timestamp][type] += volume
        return memo
     }, {})

    let cumulative = 0
    return Object.keys(tmp).sort().map(timestamp => {
      const item = tmp[timestamp]
      let all = 0
      PROPS.forEach(prop => {
        if (item[prop]) all += item[prop]
      })
      cumulative += all
      return {
        timestamp,
        all,
        cumulative,
        ...item
      }
    })
  }, [data])

  return [ret, loading]
}

export function useUsersData({ groupPeriod = DEFAULT_GROUP_PERIOD } = {}) {
  const query = `{
    userStats(first: 1000 orderBy: timestamp orderDirection: desc where: { period_not: "total" }) {
      uniqueCount
      uniqueSwapCount
      uniqueMarginCount
      uniqueMintBurnCount
      actionCount
      actionSwapCount
      actionMarginCount
      actionMintBurnCount
      timestamp
    }
  }`
  const [graphData, loading, error] = useGraph(query)

  const data = graphData ? sortBy(graphData.userStats, 'timestamp').map(item => {
    return {
      all: item.uniqueCount,
      ...item
    }
  }) : null

  return [data, loading, error]
}

export function useVolumeData({ groupPeriod = DEFAULT_GROUP_PERIOD } = {}) {
	const PROPS = 'margin liquidation swap mint burn'.split(' ')
  const query = `{
    h1: hourlyVolumes(first: 1000, orderBy: id, orderDirection: desc) {
      id
      ${PROPS.join('\n')}
    }
    h2: hourlyVolumes(first: 1000, skip: 1000, orderBy: id, orderDirection: desc) {
      id
      ${PROPS.join('\n')}
    }
  }`
  const [graphData, loading, error] = useGraph(query)

  const data = useMemo(() => {
    if (!graphData) {
      return null
    }

    let ret =  sortBy([...graphData.h1, ...graphData.h2], 'id').map(item => {
      const ret = { timestamp: item.id };
      let all = 0;
      PROPS.forEach(prop => {
        ret[prop] = item[prop] / 1e30
        all += item[prop] / 1e30
      })
      ret.all = all
      return ret
    })

    let cumulative = 0
    return chain(ret)
      .groupBy(item => Math.floor(item.timestamp / groupPeriod) * groupPeriod)
      .map((values, timestamp) => {
        const all = sumBy(values, 'all')
        cumulative += all
        const ret = {
          timestamp,
          all,
          cumulative
        }
        PROPS.forEach(prop => {
           ret[prop] = sumBy(values, prop)
        })
        return ret
      }).value()
  }, [graphData])

  return [data, loading, error]
}

export function useFeesData({ groupPeriod = DEFAULT_GROUP_PERIOD, from = Date.now() / 1000 - 86400 * 90 } = {}) {
  const PROPS = 'margin liquidation swap mint burn'.split(' ')
  const feesQuery = `{
    f1: hourlyFees(first: 1000, orderBy: id, orderDirection: desc) {
      id
      ${PROPS.join('\n')}
    }
    f2: hourlyFees(first: 1000, skip: 1000, orderBy: id, orderDirection: desc) {
      id
      ${PROPS.join('\n')}
    }
  }`
  let [feesData, loading, error] = useGraph(feesQuery)

  const feesChartData = useMemo(() => {
    if (!feesData) {
      return null
    }

    let chartData = sortBy([...feesData.f1, ...feesData.f2], 'id').map(item => {
      const ret = { timestamp: item.id };
      let all = 0;
      PROPS.forEach(prop => {
        ret[prop] = item[prop] / 1e30
        all += item[prop] / 1e30
      })
      ret.all = all
      return ret
    })

    let cumulative = 0
    return chain(chartData)
      .groupBy(item => Math.floor(item.timestamp / groupPeriod) * groupPeriod)
      .map((values, timestamp) => {
        const all = sumBy(values, 'all')
        cumulative += all
        const ret = {
          timestamp: Number(timestamp),
          all,
          cumulative
        }
        PROPS.forEach(prop => {
           ret[prop] = sumBy(values, prop)
        })
        return ret
      })
      .value()
      .filter(item => item.timestamp >= from)
  }, [feesData])

  return [feesChartData, loading, error]
}

export function useAumPerformanceData({ groupPeriod }) {
  const [feesData, feesLoading] = useFeesData({ groupPeriod })
  const [glpData, glpLoading] = useGlpData({ groupPeriod })
  const [volumeData, volumeLoading] = useVolumeData({ groupPeriod })

  const dailyCoef = 86400 / groupPeriod

  const data = useMemo(() => {
    if (!feesData || !glpData || !volumeData) {
      return null
    }

    const ret = feesData.map((feeItem, i) => {
      const glpItem = glpData[i]
      const volumeItem = volumeData[i]

      return {
        timestamp: feeItem.timestamp,
        apr: (feeItem && glpItem) ? feeItem.all /  glpItem.aum * 100 * 365 * dailyCoef : null,
        usage: (volumeItem && glpItem) ? volumeItem.all / glpItem.aum * 100 * dailyCoef : null
      }
    })
    const averageApr = ret.reduce((memo, item) => item.apr + memo, 0) / ret.length
    ret.forEach(item => item.averageApr = averageApr)
    const averageUsage = ret.reduce((memo, item) => item.usage + memo, 0) / ret.length
    ret.forEach(item => item.averageUsage = averageUsage)
    return ret
  }, [feesData, glpData, volumeData])

  return [data, feesLoading || glpLoading || volumeLoading]
}

export function useGlpData({ groupPeriod = DEFAULT_GROUP_PERIOD } = {}) {
  const query = `{
    d1: hourlyGlpStats(first: 1000, orderBy: id, orderDirection: desc) {
      id
      aumInUsdg
      glpSupply
    }
    d2: hourlyGlpStats(first: 1000, skip: 1000, orderBy: id, orderDirection: desc) {
      id
      aumInUsdg
      glpSupply
    }
    d3: hourlyGlpStats(first: 1000, skip: 2000, orderBy: id, orderDirection: desc) {
      id
      aumInUsdg
      glpSupply
    }
  }`
  let [data, loading, error] = useGraph(query)

  const glpChartData = useMemo(() => {
    if (!data) {
      return null
    }
    
    let prevGlpSupply
    let prevAum
    return sortBy([...data.d1, ...data.d2, ...data.d3], item => item.id).reduce((memo, item) => {
      const last = memo[memo.length - 1]

      const aum = Number(item.aumInUsdg) / 1e18
      const glpSupply = Number(item.glpSupply) / 1e18
      const glpPrice = aum / glpSupply
      const timestamp = Math.floor(item.id / groupPeriod) * groupPeriod

      const newItem = {
        timestamp,
        aum,
        glpSupply,
        glpPrice
      }

      if (last && last.timestamp === timestamp) {
        memo[memo.length - 1] = newItem
      } else {
        memo.push(newItem)
      }

      return memo
    }, []).map(item => {
      const { glpSupply, aum } = item
      item.glpSupplyChange = prevGlpSupply ? (glpSupply - prevGlpSupply) / prevGlpSupply * 100 : 0
      if (item.glpSupplyChange > 1000) item.glpSupplyChange = 0
      item.aumChange = prevAum ? (aum - prevAum) / prevAum * 100 : 0
      if (item.aumChange > 1000) item.aumChange = 0
      prevGlpSupply = glpSupply
      prevAum = aum
      return item
    })

  }, [data])

  return [glpChartData, loading, error]
}

export function useGlpPerformanceData(glpData, feesData, { groupPeriod = DEFAULT_GROUP_PERIOD } = {}) {
  const [btcPrices] = useCoingeckoPrices('BTC')
  const [ethPrices] = useCoingeckoPrices('ETH')

  const glpPerformanceChartData = useMemo(() => {
    if (!btcPrices || !ethPrices || !glpData || !feesData) {
      return null
    }

    const glpDataById = glpData.reduce((memo, item) => {
      memo[item.timestamp] = item
      return memo
    }, {})

    const feesDataById = feesData.reduce((memo, item) => {
      memo[item.timestamp] = item
      return memo
    })

    const BTC_WEIGHT = 0.25
    const ETH_WEIGHT = 0.25
    const GLP_START_PRICE = glpDataById[btcPrices[0].timestamp]?.glpPrice || 1.19

    const btcFirstPrice = btcPrices[0].value
    const ethFirstPrice = ethPrices[0].value

    const indexBtcCount = GLP_START_PRICE * BTC_WEIGHT / btcFirstPrice
    const indexEthCount = GLP_START_PRICE * ETH_WEIGHT / ethFirstPrice

    const lpBtcCount = GLP_START_PRICE * 0.5 / btcFirstPrice
    const lpEthCount = GLP_START_PRICE * 0.5 / ethFirstPrice

    const ret = []
    let cumulativeFeesPerGlp = 0
    for (let i = 0; i < btcPrices.length; i++) {
      const btcPrice = btcPrices[i].value
      const ethPrice = ethPrices[i]?.value ?? 3400

      const timestampGroup = parseInt(btcPrices[i].timestamp / 86400) * 86400
      const glpPrice = glpDataById[timestampGroup]?.glpPrice ?? 0
      const glpSupply = glpDataById[timestampGroup]?.glpSupply
      const dailyFees = feesDataById[timestampGroup]?.all
      const syntheticPrice = indexBtcCount * btcPrice + indexEthCount * ethPrice + GLP_START_PRICE / 2
      const lpBtcPrice = (lpBtcCount * btcPrice + GLP_START_PRICE / 2) * (1 + getImpermanentLoss(btcPrice / btcFirstPrice))
      const lpEthPrice = (lpEthCount * ethPrice + GLP_START_PRICE / 2) * (1 + getImpermanentLoss(ethPrice / ethFirstPrice))

      if (dailyFees && glpSupply) {
        const GLP_REWARDS_SHARE = 0.5 // 50% goes to GLP
        cumulativeFeesPerGlp += dailyFees / glpSupply * GLP_REWARDS_SHARE
      }

      let glpPlusFees
      if (glpPrice && glpSupply && cumulativeFeesPerGlp) {
        glpPlusFees = glpPrice + cumulativeFeesPerGlp
      }

      ret.push({
        timestamp: btcPrices[i].timestamp,
        syntheticPrice,
        lpBtcPrice,
        lpEthPrice,
        glpPrice,
        btcPrice,
        ethPrice,
        glpPlusFees,
        performanceSynthetic: (glpPrice / syntheticPrice * 100).toFixed(2),
        performanceLpEth: (glpPrice / lpEthPrice * 100).toFixed(2)
      })
    }

    return ret
  }, [btcPrices, ethPrices, glpData, feesData])

  return [glpPerformanceChartData]
}