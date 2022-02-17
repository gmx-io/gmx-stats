import { useMemo, useState, useEffect } from 'react'
import { ApolloClient, InMemoryCache, gql, HttpLink } from '@apollo/client'
import { chain, sumBy, sortBy, maxBy, minBy } from 'lodash'
import fetch from 'cross-fetch';
import * as ethers from 'ethers'

import { fillPeriods } from './helpers'

const BigNumber = ethers.BigNumber
const formatUnits = ethers.utils.formatUnits
const { JsonRpcProvider } = ethers.providers

const providers = {
  arbitrum: new JsonRpcProvider('https://arb1.arbitrum.io/rpc'),
  avalanche: new JsonRpcProvider('https://api.avax.network/ext/bc/C/rpc')
}

const DEFAULT_GROUP_PERIOD = 86400
const NOW_TS = parseInt(Date.now() / 1000)
const FIRST_DATE_TS = parseInt(+(new Date(2021, 7, 31)) / 1000)

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

export const tokenDecimals = {
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": 18, // WETH
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": 8, // BTC
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": 6, // USDC
  "0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0": 18, // UNI
  "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": 6, // USDT
  "0xf97f4df75117a78c1a5a0dbb814af92458539fb4": 18, // LINK
  "0xfea7a6a0b346362bf88a9e4a88416b77a57d6c2a": 18, // MIM
  "0x17fc002b466eec40dae837fc4be5c67993ddbd6f": 18, // FRAX
  "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1": 18, // DAI
}

export const tokenSymbols = {
  // Arbitrum
  '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 'BTC',
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 'ETH',
  '0xf97f4df75117a78c1a5a0dbb814af92458539fb4': 'LINK',
  '0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0': 'UNI',
  '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': 'USDC',
  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 'USDT',
  '0xfea7a6a0b346362bf88a9e4a88416b77a57d6c2a': 'MIM',
  '0x17fc002b466eec40dae837fc4be5c67993ddbd6f': 'FRAX',
  '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1': 'DAI',

  // Avalanche
  '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7': 'AVAX',
  '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab': 'WETH.e',
  '0x50b7545627a5162f82a992c33b87adc75187b218': 'WBTC.e',
  '0x130966628846bfd36ff31a822705796e8cb8c18d': 'MIM',
  '0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664': 'USDC.e',
  '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e': 'USDC'
}

function getTokenDecimals(token) {
  return tokenDecimals[token] || 18
}

const knownSwapSources = {
  arbitrum: {
    '0xabbc5f99639c9b6bcb58544ddf04efa6802f4064': 'GMX',
    '0x09f77e8a13de9a35a7231028187e9fd5db8a2acb': 'GMX',
    '0x3b6067d4caa8a14c63fdbe6318f27a0bbc9f9237': 'Dodo',
    '0x11111112542d85b3ef69ae05771c2dccff4faa26': '1inch'
  },
  avalanche: {
    '0x4296e307f108b2f583ff2f7b7270ee7831574ae5': 'GMX',
    '0x5f719c2f1095f7b9fc68a68e35b51194f4b6abe8': 'GMX',
    '0xc4729e56b831d74bbc18797e0e17a295fa77488c': 'Yak',
    '0x409e377a7affb1fd3369cfc24880ad58895d1dd9': 'Dodo',
    '0x6352a56caadc4f1e25cd6c75970fa768a3304e64': 'OpenOcean'
  }
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

export function useCoingeckoPrices(symbol, { from = FIRST_DATE_TS } = {}) {
  // token ids https://api.coingecko.com/api/v3/coins
  const _symbol = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    LINK: 'chainlink',
    UNI: 'uniswap',
    AVAX: 'avalanche-2'
  }[symbol]

  const now = Date.now() / 1000
  const days = Math.ceil(now / 86400) - Math.ceil(from / 86400) - 1

  const url = `https://api.coingecko.com/api/v3/coins/${_symbol}/market_chart?vs_currency=usd&days=${days}&interval=daily`

  const [res, loading, error] = useRequest(url)

  const data = useMemo(() => {
    if (!res || res.length === 0) {
      return null
    }

    const ret = res.prices.map(item => {
      // -1 is for shifting to previous day
      // because CG uses first price of the day, but for GLP we store last price of the day
      const timestamp = item[0] - 1
      const groupTs = parseInt(timestamp / 1000 / 86400) * 86400
      return {
        timestamp: groupTs,
        value: item[1]
      }
    })
    return ret
  }, [res])

  return [data, loading, error]
}

function getImpermanentLoss(change) {
  return 2 * Math.sqrt(change) / (1 + change) - 1
} 

function getChainSubgraph(chainName) {
  return chainName === "arbitrum" ? "gmx-io/gmx-stats" : "gmx-io/gmx-avalanche-stats"
}

export function useGraph(querySource, { subgraph = null, subgraphUrl = null, chainName = "arbitrum" } = {}) {
  const query = gql(querySource)

  if (!subgraphUrl) {
    if (!subgraph) {
      subgraph = getChainSubgraph(chainName)
    }
    subgraphUrl = `https://api.thegraph.com/subgraphs/name/${subgraph}`;
  }

  const client = new ApolloClient({
    link: new HttpLink({ uri: subgraphUrl, fetch }),
    cache: new InMemoryCache()
  })
  const [data, setData] = useState()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
  }, [querySource, setLoading])

  useEffect(() => {
    client.query({query}).then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(ex => {
      console.warn('Subgraph request failed error: %s subgraphUrl: %s', ex.message, subgraphUrl)
      setError(ex)
      setLoading(false)
    })
  }, [querySource, setData, setError, setLoading])

  return [data, loading, error]
}

export function useGambitVolumeData({ from, to }) {
  const [graphData, loading, error] = useGraph(`{
    volumeStats(
      first: 1000,
      where: { id_gte: ${from}, id_lte: ${to}, period: daily }
      orderBy: id
      orderDirection: desc
    ) {
      id
      margin
      swap
      liquidation
      mint
      burn
    }
  }`, {
    subgraph: 'gmx-io/gmx-bsc-stats'
  })

  let data
  if (graphData) {
    data = sortBy(graphData.volumeStats, item => item.id).map(({ id, margin, swap, liquidation, mint, burn }) => {
      margin = margin / 1e30
      swap = swap / 1e30
      liquidation = liquidation / 1e30
      mint = mint / 1e30
      burn = burn / 1e30
      const all = margin + swap + liquidation + mint + burn
      return {
        timestamp: id,
        all,
        margin,
        swap,
        liquidation,
        mint,
        burn
      }
    })
  }

  return [data, loading]
}

export function useGambitFeesData({ from, to }) {
  const [graphData, loading, error] = useGraph(`{
    feeStats(
      first: 1000,
      where: { id_gte: ${from}, id_lte: ${to}, period: daily }
      orderBy: id
      orderDirection: desc
    ) {
      id
      margin
      swap
      mint
      burn
      marginCumulative
      swapCumulative
      liquidationCumulative
      mintCumulative
      burnCumulative
    }
  }`, {
    subgraph: 'gmx-io/gmx-bsc-stats'
  })

  let data
  if (graphData) {
    data = sortBy(graphData.feeStats, item => item.id).map(({ id, margin, swap, mint, burn }) => {
      margin = margin / 1e30
      swap = swap / 1e30
      const liquidation = 0
      mint = mint / 1e30
      burn = burn / 1e30
      const all = margin + swap + mint + burn
      return {
        timestamp: id,
        all,
        margin,
        swap,
        liquidation,
        mint,
        burn
      }
    })
  }

  return [data, loading]
}

export function useGambitPoolStats({ from, to, groupPeriod }) {
  const [data, loading, error] = useGraph(`{
    poolStats (
      first: 1000,
      where: { id_gte: ${from}, id_lte: ${to} }
      orderBy: id
      orderDirection: desc
    ) {
      id,
      usdgSupply,
      BTC_usd,
      ETH_usd,
      BNB_usd,
      USDC_usd,
      USDT_usd,
      BUSD_usd
    }
  }`, { subgraph: 'gkrasulya/gambit' })

  const ret = useMemo(() => {
    if (!data) {
       return null
    } 
    let ret = data.poolStats.map(item => {
      return Object.entries(item).reduce((memo, [key, value]) => {
        if (key === 'id') memo.timestamp = value
        else if (key === 'usdgSupply') memo.usdgSupply = value / 1e18
        else memo[key.substr(0, key.length - 4)] = value / 1e30
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

export function useLastBlock(chainName = "arbitrum") {
  const [data, setData] = useState()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  useEffect(() => {
    providers[chainName].getBlock()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [])

  return [data, loading, error]
}

export function useLastSubgraphBlock(chainName = "arbitrum") {
  const [data, loading, error] = useGraph(`{
    _meta {
      block {
        number
      }
    } 
  }`, { chainName })
  const [block, setBlock] = useState(null)

  useEffect(() => {
    if (!data) {
      return
    } 

    providers[chainName].getBlock(data._meta.block.number).then(block => {
      setBlock(block)
    })
  }, [data, setBlock])

  return [block, loading, error]
}

export function useTradersData({ from = FIRST_DATE_TS, to = NOW_TS, chainName = "arbitrum" } = {}) {
  const [closedPositionsData, loading, error] = useGraph(`{
    tradingStats(
      first: 1000
      orderBy: timestamp
      orderDirection: desc
      where: { period: "daily", timestamp_gte: ${from}, timestamp_lte: ${to} }
    ) {
      timestamp
      profit
      loss
      profitCumulative
      lossCumulative
      longOpenInterest
      shortOpenInterest
    }
  }`, { chainName })
  const [feesData] = useFeesData({ from, to, chainName })
  const marginFeesByTs = useMemo(() => {
    if (!feesData) {
      return {}
    }

    let feesCumulative = 0
    return feesData.reduce((memo, { timestamp, margin: fees}) => {
      feesCumulative += fees
      memo[timestamp] = {
        fees,
        feesCumulative
      }
      return memo
    }, {})
  }, [feesData])

  let ret = null
  const data = closedPositionsData ? sortBy(closedPositionsData.tradingStats, i => i.timestamp).map(dataItem => {
    const longOpenInterest = dataItem.longOpenInterest / 1e30
    const shortOpenInterest = dataItem.shortOpenInterest / 1e30
    const openInterest = longOpenInterest + shortOpenInterest

    const fees = (marginFeesByTs[dataItem.timestamp]?.fees || 0)
    const feesCumulative = (marginFeesByTs[dataItem.timestamp]?.feesCumulative || 0)

    const profit = dataItem.profit / 1e30
    const loss = dataItem.loss / 1e30
    const profitCumulative = dataItem.profitCumulative / 1e30
    const lossCumulative = dataItem.lossCumulative / 1e30
    const pnlCumulative = profitCumulative - lossCumulative
    const pnl = profit - loss
    return {
      longOpenInterest,
      shortOpenInterest,
      openInterest,
      profit,
      loss: -loss,
      profitCumulative,
      lossCumulative: -lossCumulative,
      pnl,
      pnlCumulative,
      timestamp: dataItem.timestamp
    }
  }) : null

  if (data) {
    const maxProfit = maxBy(data, item => item.profit).profit
    const maxLoss = minBy(data, item => item.loss).loss
    const maxProfitLoss = Math.max(maxProfit, -maxLoss)

    const maxPnl = maxBy(data, item => item.pnl).pnl
    const minPnl = minBy(data, item => item.pnl).pnl
    const maxCumulativePnl = maxBy(data, item => item.pnlCumulative).pnlCumulative
    const minCumulativePnl = minBy(data, item => item.pnlCumulative).pnlCumulative

    const profitCumulative = data[data.length - 1].profitCumulative
    const lossCumulative = data[data.length - 1].lossCumulative
    const stats = {
      maxProfit,
      maxLoss,
      maxProfitLoss,
      profitCumulative,
      lossCumulative,
      maxCumulativeProfitLoss: Math.max(profitCumulative, -lossCumulative),

      maxAbsOfPnlAndCumulativePnl: Math.max(
        Math.abs(maxPnl),
        Math.abs(maxCumulativePnl),
        Math.abs(minPnl),
        Math.abs(minCumulativePnl)
      ),
    }

    ret = {
      data,
      stats
    }
  }

  return [ret, loading]
}

function getSwapSourcesFragment(skip = 0, from, to) {
  return `
    hourlyVolumeBySources(
      first: 1000
      skip: ${skip}
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_gte: ${from}, timestamp_lte: ${to} }
    ) {
      timestamp
      source
      swap
    }
  `
}
export function useSwapSources({ from = FIRST_DATE_TS, to = NOW_TS, chainName = "arbitrum" } = {}) {
  const query = `{
    a: ${getSwapSourcesFragment(0, from, to)}
    b: ${getSwapSourcesFragment(1000, from, to)}
    c: ${getSwapSourcesFragment(2000, from, to)}
    d: ${getSwapSourcesFragment(3000, from, to)}
    e: ${getSwapSourcesFragment(4000, from, to)}
  }`
  const [graphData, loading, error] = useGraph(query, { chainName })

  let total = 0
  let data = useMemo(() => {
    if (!graphData) {
      return null
    }

    const {a, b, c, d, e} = graphData
    let ret = chain([...a, ...b, ...c, ...d, ...e])
      .groupBy(item => parseInt(item.timestamp / 86400) * 86400)
      .map((values, timestamp) => {
        let all = 0
        const retItem = {
          timestamp: Number(timestamp),
          ...values.reduce((memo, item) => {
            const source = knownSwapSources[chainName][item.source] || item.source
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

export function useTotalVolumeFromServer() {
  const [data, loading] = useRequest('https://gmx-server-mainnet.uw.r.appspot.com/total_volume')

  return useMemo(() => {
    if (!data) {
      return [data, loading]
    }

    const total = data.reduce((memo, item) => {
      return memo + parseInt(item.data.volume) / 1e30
    }, 0)
    return [total, loading]
  }, [data, loading])
}

function getServerHostname(chainName) {
  if (chainName == "avalanche") {
    return 'gmx-avax-server.uc.r.appspot.com'
  }
  return 'gmx-server-mainnet.uw.r.appspot.com'
}

export function useVolumeDataFromServer({ from = FIRST_DATE_TS, to = NOW_TS, chainName = "arbitrum" } = {}) {
  const PROPS = 'margin liquidation swap mint burn'.split(' ')
  const [data, loading] = useRequest(`https://${getServerHostname(chainName)}/daily_volume`, null, async url => {
    let after
    const ret = []
    while (true) {
      const res = await (await fetch(url + (after ? `?after=${after}` : ''))).json()
      if (res.length === 0) return ret
      for (const item of res) {
        if (item.data.timestamp < from) {
          return ret
        }
        ret.push(item)
      }
      after = res[res.length - 1].id
    }
  })

  const ret = useMemo(() => {
     if (!data) {
       return null
     } 

     const tmp = data.reduce((memo, item) => {
        const timestamp = item.data.timestamp
        if (timestamp < from || timestamp > to) {
          return memo
        }

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
        memo[timestamp] = memo[timestamp] || {}
        memo[timestamp][type] = memo[timestamp][type] || 0
        memo[timestamp][type] += volume
        return memo
     }, {})

    let cumulative = 0
    const cumulativeByTs = {}
    return Object.keys(tmp).sort().map(timestamp => {
      const item = tmp[timestamp]
      let all = 0

      let movingAverageAll
      const movingAverageTs = timestamp - MOVING_AVERAGE_PERIOD
      if (movingAverageTs in cumulativeByTs) {
        movingAverageAll = (cumulative - cumulativeByTs[movingAverageTs]) / MOVING_AVERAGE_DAYS
      }

      PROPS.forEach(prop => {
        if (item[prop]) all += item[prop]
      })
      cumulative += all
      cumulativeByTs[timestamp] = cumulative
      return {
        timestamp,
        all,
        cumulative,
        movingAverageAll,
        ...item
      }
    })
  }, [data, from, to])

  return [ret, loading]
}

export function useUsersData({ from = FIRST_DATE_TS, to = NOW_TS, chainName = "arbitrum" } = {}) {
  const query = `{
    userStats(
      first: 1000
      orderBy: timestamp
      orderDirection: desc
      where: { period: "daily", timestamp_gte: ${from}, timestamp_lte: ${to} }
    ) {
      uniqueCount
      uniqueSwapCount
      uniqueMarginCount
      uniqueMintBurnCount
      uniqueCountCumulative
      uniqueSwapCountCumulative
      uniqueMarginCountCumulative
      uniqueMintBurnCountCumulative
      actionCount
      actionSwapCount
      actionMarginCount
      actionMintBurnCount
      timestamp
    }
  }`
  const [graphData, loading, error] = useGraph(query, { chainName })

  const prevUniqueCountCumulative = {}
  const data = graphData ? sortBy(graphData.userStats, 'timestamp').map(item => {
    const newCountData = ['', 'Swap', 'Margin', 'MintBurn'].reduce((memo, type) => {
      memo[`new${type}Count`] = prevUniqueCountCumulative[type]
        ? item[`unique${type}CountCumulative`] - prevUniqueCountCumulative[type]
        : item[`unique${type}Count`]
      prevUniqueCountCumulative[type] = item[`unique${type}CountCumulative`]
      return memo
    }, {})
    const oldCount = item.uniqueCount - newCountData.newCount
    const oldPercent = (oldCount / item.uniqueCount * 100).toFixed(1)
    return {
      all: item.uniqueCount,
      uniqueSum: item.uniqueSwapCount + item.uniqueMarginCount + item.uniqueMintBurnCount,
      oldCount,
      oldPercent,
      ...newCountData,
      ...item
    }
  }) : null

  return [data, loading, error]
}

export function useFundingRateData({ from = FIRST_DATE_TS, to = NOW_TS, chainName = "arbitrum" } = {}) {
  const query = `{
    fundingRates(
      first: 1000,
      orderBy: timestamp,
      orderDirection: desc,
      where: { period: "daily", id_gte: ${from}, id_lte: ${to} }
    ) {
      id,
      token,
      timestamp,
      startFundingRate,
      startTimestamp,
      endFundingRate,
      endTimestamp
    }
  }`
  const [graphData, loading, error] = useGraph(query, { chainName })


  const data = useMemo(() => {
    if (!graphData) {
      return null
    }

    const groups = graphData.fundingRates.reduce((memo, item) => {
      const symbol = tokenSymbols[item.token]
      memo[item.timestamp] = memo[item.timestamp] || {
        timestamp: item.timestamp
      }
      const group = memo[item.timestamp]
      const timeDelta = parseInt((item.endTimestamp - item.startTimestamp) / 3600) * 3600

      let fundingRate = 0
      if (item.endFundingRate && item.startFundingRate) {
        const fundingDelta = item.endFundingRate - item.startFundingRate
        const divisor = timeDelta / 86400
        fundingRate = fundingDelta / divisor / 10000 * 365
      }
      group[symbol] = fundingRate
      return memo
    }, {})

    return fillNa(sortBy(Object.values(groups), 'timestamp'), ['ETH', 'USDC', 'USDT', 'BTC', 'LINK', 'UNI', 'MIM'])
  }, [graphData])

  return [data, loading, error]
}

const MOVING_AVERAGE_DAYS = 7
const MOVING_AVERAGE_PERIOD = 86400 * MOVING_AVERAGE_DAYS

export function useVolumeData({ from = FIRST_DATE_TS, to = NOW_TS, chainName = "arbitrum" } = {}) {
	const PROPS = 'margin liquidation swap mint burn'.split(' ')
  const timestampProp = chainName === "arbitrum" ? "id" : "timestamp"
  const query = `{
    volumeStats(
      first: 1000,
      orderBy: ${timestampProp},
      orderDirection: desc
      where: { period: daily, ${timestampProp}_gte: ${from}, ${timestampProp}_lte: ${to} }
    ) {
      ${timestampProp}
      ${PROPS.join('\n')}
    }
  }`
  const [graphData, loading, error] = useGraph(query, { chainName })

  const data = useMemo(() => {
    if (!graphData) {
      return null
    }

    let ret =  sortBy(graphData.volumeStats, timestampProp).map(item => {
      const ret = { timestamp: item[timestampProp] };
      let all = 0;
      PROPS.forEach(prop => {
        ret[prop] = item[prop] / 1e30
        all += ret[prop]
      })
      ret.all = all
      return ret
    })

    let cumulative = 0
    const cumulativeByTs = {}
    return ret.map(item => {
      cumulative += item.all

      let movingAverageAll
      const movingAverageTs = item.timestamp - MOVING_AVERAGE_PERIOD
      if (movingAverageTs in cumulativeByTs) {
        movingAverageAll = (cumulative - cumulativeByTs[movingAverageTs]) / MOVING_AVERAGE_DAYS
      }

      return {
        movingAverageAll,
        cumulative,
        ...item
      }
    })
  }, [graphData])

  return [data, loading, error]
}

export function useFeesData({ from = FIRST_DATE_TS, to = NOW_TS, chainName = "arbitrum" } = {}) {
  const PROPS = 'margin liquidation swap mint burn'.split(' ')
  const feesQuery = `{
    feeStats(
      first: 1000
      orderBy: id
      orderDirection: desc
      where: { period: daily, id_gte: ${from}, id_lte: ${to} }
    ) {
      id
      margin
      marginAndLiquidation
      swap
      mint
      burn
      ${chainName === "avalanche" ? "timestamp" : ""}
    }
  }`
  let [feesData, loading, error] = useGraph(feesQuery, {
    chainName
  })

  const feesChartData = useMemo(() => {
    if (!feesData) {
      return null
    }

    let chartData = sortBy(feesData.feeStats, 'id').map(item => {
      const ret = { timestamp: item.timestamp || item.id };

      PROPS.forEach(prop => {
        if (item[prop]) {
          ret[prop] = item[prop] / 1e30
        }
      })

      ret.liquidation = item.marginAndLiquidation / 1e30 - item.margin / 1e30
      ret.all = PROPS.reduce((memo, prop) => memo + ret[prop], 0)
      return ret
    })

    let cumulative = 0
    const cumulativeByTs = {}
    return chain(chartData)
      .groupBy(item => item.timestamp)
      .map((values, timestamp) => {
        const all = sumBy(values, 'all')
        cumulative += all

        let movingAverageAll
        const movingAverageTs = timestamp - MOVING_AVERAGE_PERIOD
        if (movingAverageTs in cumulativeByTs) {
          movingAverageAll = (cumulative - cumulativeByTs[movingAverageTs]) / MOVING_AVERAGE_DAYS
        }

        const ret = {
          timestamp: Number(timestamp),
          all,
          cumulative,
          movingAverageAll
        }
        PROPS.forEach(prop => {
           ret[prop] = sumBy(values, prop)
        })
        cumulativeByTs[timestamp] = cumulative
        return ret
      })
      .value()
      .filter(item => item.timestamp >= from)
  }, [feesData])

  return [feesChartData, loading, error]
}

export function useAumPerformanceData({ from = FIRST_DATE_TS, to = NOW_TS, groupPeriod }) {
  const [feesData, feesLoading] = useFeesData({ from, to, groupPeriod })
  const [glpData, glpLoading] = useGlpData({ from, to, groupPeriod })
  const [volumeData, volumeLoading] = useVolumeData({ from, to, groupPeriod })

  const dailyCoef = 86400 / groupPeriod

  const data = useMemo(() => {
    if (!feesData || !glpData || !volumeData) {
      return null
    }

    const ret = feesData.map((feeItem, i) => {
      const glpItem = glpData[i]
      const volumeItem = volumeData[i]
      let apr = (feeItem?.all && glpItem?.aum) ? feeItem.all /  glpItem.aum * 100 * 365 * dailyCoef : null
      if (apr > 10000) {
        apr = null
      }
      let usage = (volumeItem?.all && glpItem?.aum) ? volumeItem.all / glpItem.aum * 100 * dailyCoef : null
      if (usage > 10000) {
        usage = null
      }

      return {
        timestamp: feeItem.timestamp,
        apr,
        usage
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

export function useGlpData({ from = FIRST_DATE_TS, to = NOW_TS, chainName = "arbitrum" } = {}) {
  const timestampProp = chainName === 'arbitrum' ? 'id' : 'timestamp'
  const query = `{
    glpStats(
      first: 1000
      orderBy: ${timestampProp}
      orderDirection: desc
      where: {period: daily, ${timestampProp}_gte: ${from}, ${timestampProp}_lte: ${to}}
    ) {
      ${timestampProp}
      aumInUsdg
      glpSupply
      distributedUsd
      distributedEth
    }
  }`
  let [data, loading, error] = useGraph(query, { chainName })

  let cumulativeDistributedUsdPerGlp = 0
  let cumulativeDistributedEthPerGlp = 0
  const glpChartData = useMemo(() => {
    if (!data) {
      return null
    }

    const getTimestamp = item => item.timestamp || parseInt(item[timestampProp])
    
    let prevGlpSupply
    let prevAum
    return sortBy(data.glpStats, item => item[timestampProp]).filter(item => item[timestampProp] % 86400 === 0).reduce((memo, item) => {
      const last = memo[memo.length - 1]

      const aum = Number(item.aumInUsdg) / 1e18
      const glpSupply = Number(item.glpSupply) / 1e18

      const distributedUsd = Number(item.distributedUsd) / 1e30
      const distributedUsdPerGlp = (distributedUsd / glpSupply) || 0
      cumulativeDistributedUsdPerGlp += distributedUsdPerGlp

      const distributedEth = Number(item.distributedEth) / 1e18
      const distributedEthPerGlp = (distributedEth / glpSupply) || 0
      cumulativeDistributedEthPerGlp += distributedEthPerGlp

      const glpPrice = aum / glpSupply
      const timestamp = parseInt(item[timestampProp])

      const newItem = {
        timestamp,
        aum,
        glpSupply,
        glpPrice,
        cumulativeDistributedEthPerGlp,
        cumulativeDistributedUsdPerGlp,
        distributedUsdPerGlp,
        distributedEthPerGlp
      }

      if (last && last.timestamp === timestamp) {
        memo[memo.length - 1] = newItem
      } else {
        memo.push(newItem)
      }

      return memo
    }, []).map(item => {
      let { glpSupply, aum } = item
      if (!glpSupply) {
        glpSupply = prevGlpSupply
      }
      if (!aum) {
        aum = prevAum
      }
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

export function useGlpPerformanceData(glpData, feesData, { from = FIRST_DATE_TS, chainName = "arbitrum" } = {}) {
  const [btcPrices] = useCoingeckoPrices('BTC', { from })
  const [ethPrices] = useCoingeckoPrices('ETH', { from })
  const [avaxPrices] = useCoingeckoPrices('AVAX', { from })

  const glpPerformanceChartData = useMemo(() => {
    if (!btcPrices || !ethPrices || !avaxPrices || !glpData || !feesData) {
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
    const STABLE_WEIGHT = 1 - BTC_WEIGHT - ETH_WEIGHT
    const GLP_START_PRICE = glpDataById[btcPrices[0].timestamp]?.glpPrice || 1.19

    const btcFirstPrice = btcPrices[0]?.value
    const ethFirstPrice = ethPrices[0]?.value
    const avaxFirstPrice = avaxPrices[0]?.value

    const indexBtcCount = GLP_START_PRICE * BTC_WEIGHT / btcFirstPrice
    const indexEthCount = GLP_START_PRICE * ETH_WEIGHT / ethFirstPrice

    const lpBtcCount = GLP_START_PRICE * 0.5 / btcFirstPrice
    const lpEthCount = GLP_START_PRICE * 0.5 / ethFirstPrice
    const lpAvaxCount = GLP_START_PRICE * 0.5 / avaxFirstPrice

    const ret = []
    let cumulativeFeesPerGlp = 0
    let cumulativeEsgmxRewardsPerGlp = 0
    let lastGlpPrice = 0

    let prevEthPrice = 3400
    let prevAvaxPrice = 1000
    for (let i = 0; i < btcPrices.length; i++) {
      const btcPrice = btcPrices[i].value
      const ethPrice = ethPrices[i]?.value || prevEthPrice
      const avaxPrice = avaxPrices[i]?.value || prevAvaxPrice
      prevAvaxPrice = avaxPrice
      prevEthPrice = ethPrice

      const timestampGroup = parseInt(btcPrices[i].timestamp / 86400) * 86400
      const glpItem = glpDataById[timestampGroup]
      const glpPrice = glpItem?.glpPrice ?? lastGlpPrice
      lastGlpPrice = glpPrice
      const glpSupply = glpDataById[timestampGroup]?.glpSupply
      const dailyFees = feesDataById[timestampGroup]?.all
      const syntheticPrice = indexBtcCount * btcPrice + indexEthCount * ethPrice + GLP_START_PRICE * STABLE_WEIGHT
      const lpBtcPrice = (lpBtcCount * btcPrice + GLP_START_PRICE / 2) * (1 + getImpermanentLoss(btcPrice / btcFirstPrice))
      const lpEthPrice = (lpEthCount * ethPrice + GLP_START_PRICE / 2) * (1 + getImpermanentLoss(ethPrice / ethFirstPrice))
      const lpAvaxPrice = (lpAvaxCount * avaxPrice + GLP_START_PRICE / 2) * (1 + getImpermanentLoss(avaxPrice / avaxFirstPrice))

      if (dailyFees && glpSupply) {
        const INCREASED_GLP_REWARDS_TIMESTAMP = 1635714000
        const GLP_REWARDS_SHARE = timestampGroup >= INCREASED_GLP_REWARDS_TIMESTAMP ? 0.7 : 0.5
        const collectedFeesPerGlp = dailyFees / glpSupply * GLP_REWARDS_SHARE
        cumulativeFeesPerGlp += collectedFeesPerGlp

        cumulativeEsgmxRewardsPerGlp += glpPrice * 0.8 / 365
      }

      let glpPlusFees = glpPrice
      if (glpPrice && glpSupply && cumulativeFeesPerGlp) {
        glpPlusFees = glpPrice + cumulativeFeesPerGlp
      }

      let glpApr
      let glpPlusDistributedUsd
      let glpPlusDistributedEth
      if (glpItem) {
        if (glpItem.cumulativeDistributedUsdPerGlp) {
          glpPlusDistributedUsd = glpPrice + glpItem.cumulativeDistributedUsdPerGlp
          // glpApr = glpItem.distributedUsdPerGlp / glpPrice * 365 * 100 // incorrect?
        }
        if (glpItem.cumulativeDistributedEthPerGlp) {
          glpPlusDistributedEth = glpPrice + glpItem.cumulativeDistributedEthPerGlp * ethPrice
        }
      }

      ret.push({
        timestamp: btcPrices[i].timestamp,
        syntheticPrice,
        lpBtcPrice,
        lpEthPrice,
        lpAvaxPrice,
        glpPrice,
        btcPrice,
        ethPrice,
        glpPlusFees,
        glpPlusDistributedUsd,
        glpPlusDistributedEth,

        performanceLpEth: (glpPrice / lpEthPrice * 100).toFixed(1),
        performanceLpEthCollectedFees: (glpPlusFees / lpEthPrice * 100).toFixed(1),
        performanceLpEthDistributedUsd: (glpPlusDistributedUsd / lpEthPrice * 100).toFixed(1),
        performanceLpEthDistributedEth: (glpPlusDistributedEth / lpEthPrice * 100).toFixed(1),

        performanceLpBtcCollectedFees: (glpPlusFees / lpBtcPrice * 100).toFixed(1),

        performanceSynthetic: (glpPrice / syntheticPrice * 100).toFixed(1),
        performanceSyntheticCollectedFees: (glpPlusFees / syntheticPrice * 100).toFixed(1),
        performanceSyntheticDistributedUsd: (glpPlusDistributedUsd / syntheticPrice * 100).toFixed(1),
        performanceSyntheticDistributedEth: (glpPlusDistributedEth / syntheticPrice * 100).toFixed(1),

        glpApr
      })
    }

    return ret
  }, [btcPrices, ethPrices, glpData, feesData])

  return [glpPerformanceChartData]
}
