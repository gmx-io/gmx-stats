import { useMemo, useState, useEffect } from 'react'
import { ApolloClient, InMemoryCache, gql, HttpLink } from '@apollo/client'
import { chain, sumBy, sortBy } from 'lodash'
import fetch from 'cross-fetch';
import * as ethers from 'ethers'

const BigNumber = ethers.BigNumber
const provider = new ethers.providers.JsonRpcProvider('https://arb1.arbitrum.io/rpc')

const DEFAULT_GROUP_PERIOD = 86400

const tokenDecimals = {
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": 18,
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": 8,
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": 6
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
      setError(ex)
    }
    setLoading(false)
  }, [url])

  return [data, loading, error]
}

export function useCoingeckoPrices(symbol) {
  const _symbol = {
    BTC: 'bitcoin',
    ETH: 'ethereum'
  }[symbol]

  const now = Date.now() / 1000
  const fromTs = +new Date(2021, 7, 31) / 1000
  const days = Math.floor(now / 86400) - Math.floor(fromTs / 86400)

  const url = `https://api.coingecko.com/api/v3/coins/${_symbol}/market_chart?vs_currency=usd&days=${days}&interval=daily`

  const [data, loading, error] = useRequest(url)

  return [data ? data.prices.slice(0, -1).map(item => ({ timestamp: item[0] / 1000, value: item[1] })) : data, loading, error]
}

export function useGraph(query, { subgraph = 'gkrasulya/gmx' } = {}) {
  if (typeof query === 'string') {
    query = gql(query)
  }

  const subgraphUrl = `https://api.thegraph.com/subgraphs/name/${subgraph}`;
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
  }, [query, setData, setLoading])

  return [data, loading]
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

export function usePnlData({ groupPeriod = DEFAULT_GROUP_PERIOD } = {}) {
  const [closedPositionsData, loading, error] = useGraph(`{
    aggregatedTradeCloseds(first: 1000, orderBy: settledBlockTimestamp) {
     settledPosition {
       realisedPnl
     },
     settledBlockTimestamp
   } 
  }`, { subgraph: 'nissoh/gmx-vault' })

  const [liquidatedPositionsData] = useGraph(`{
    aggregatedTradeLiquidateds(first: 1000, orderBy: settledBlockTimestamp) {
     settledPosition {
       collateral
     },
     settledBlockTimestamp
   } 
  }`, { subgraph: 'nissoh/gmx-vault' })

  let ret = null
  if (closedPositionsData && liquidatedPositionsData) {
    ret = [
      ...closedPositionsData.aggregatedTradeCloseds.map(item => ({
        timestamp: item.settledBlockTimestamp,
        pnl: Number(item.settledPosition.realisedPnl) / 1e30
      })),
      ...liquidatedPositionsData.aggregatedTradeLiquidateds.map(item => ({
        timestamp: item.settledBlockTimestamp,
        pnl: -Number(item.settledPosition.collateral) / 1e30
      }))
     ]

    let cumulativePnl = 0 
    ret = chain(ret)
      .groupBy(item => Math.floor(item.timestamp / groupPeriod) * groupPeriod)
      .map((values, timestamp) => {
        const pnl = sumBy(values, 'pnl')
        cumulativePnl += pnl
        return {
          pnl,
          cumulativePnl,
          timestamp: Number(timestamp)
        }
      })
      .value()
  }

  return [ret, loading]
}

export function useSwapSources({ groupPeriod = DEFAULT_GROUP_PERIOD } = {}) {
  const query = gql(`{
    swaps(first: 1000 orderBy: id orderDirection: desc) {
      tokenIn
      tokenInPrice
      amountIn
      transaction {
        to
      }
    }
  }`)
  const [graphData, loading, error] = useGraph(query)

  let total = 0
  let data = useMemo(() => {
    if (!graphData) {
      return null
    }

    let ret = sortBy(graphData.swaps, item => item.timestamp).reduce((memo, item) => {
      const to = knownSwapSources[item.transaction.to] || item.transaction.to
      const denominator = BigNumber.from(10).pow(tokenDecimals[item.tokenIn])
      const volume = BigNumber.from(item.amountIn)
        .mul(item.tokenInPrice)
        .div(denominator)

      memo[to] = memo[to] || 0
      memo[to] += Number(volume.toString()) / 1e30
      total += Number(volume.toString()) / 1e30
      return memo
    }, {})

    return sortBy(Object.keys(ret).map(key => ({
      name: key,
      value: ret[key] / total * 100
    })), item => -item.value)
  }, [graphData])

  return [data, loading, error]
}

export function useVolumeData({ groupPeriod = DEFAULT_GROUP_PERIOD } = {}) {
	const PROPS = 'margin liquidation swap mint burn'.split(' ')
  const query = gql(`{
    hourlyVolumes(first: 1000 orderBy: id) {
      id
      ${PROPS.join('\n')}
    }
  }`)
  const [graphData, loading, error] = useGraph(query)

  const data = useMemo(() => {
    if (!graphData) {
      return null
    }

    let ret =  graphData.hourlyVolumes.map(item => {
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


export function useFeesData({ groupPeriod = DEFAULT_GROUP_PERIOD } = {}) {
  const PROPS = 'margin liquidation swap mint burn'.split(' ')
  const feesQuery = gql(`{
    hourlyFees(first: 1000 orderBy: id) {
      id
      ${PROPS.join('\n')}
    }
  }`)
  let [feesData, loading, error] = useGraph(feesQuery)
  const feesChartData = useMemo(() => {
    if (!feesData) {
      return null
    }

    let chartData =  feesData.hourlyFees.map(item => {
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
          timestamp,
          all,
          cumulative
        }
        PROPS.forEach(prop => {
           ret[prop] = sumBy(values, prop)
        })
        return ret
      }).value()
  }, [feesData])

  return [feesChartData, loading, error]
}

export function useGlpData({ groupPeriod = DEFAULT_GROUP_PERIOD } = {}) {
  const query = gql(`{
    hourlyGlpStats(first: 1000, orderBy: id, orderDirection: desc) {
      id
      aumInUsdg
      glpSupply
    }
  }`);
  let [data, loading, error] = useGraph(query)

  const glpChartData = useMemo(() => {
    if (!data) {
      return null
    }

    let prevGlpSupply
    let prevAum
    return sortBy(data.hourlyGlpStats, item => item.id).reduce((memo, item) => {
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

export function useGlpPerformanceData(glpData, { groupPeriod = DEFAULT_GROUP_PERIOD } = {}) {
  const [btcPrices] = useCoingeckoPrices('BTC')
  const [ethPrices] = useCoingeckoPrices('ETH')

  const glpPerformanceChartData = useMemo(() => {
    if (!btcPrices || !ethPrices || !glpData) {
      return null
    }

    const BTC_WEIGHT = 0.25
    const ETH_WEIGHT = 0.25
    const GLP_START_PRICE = 1.19
    const btcCount = GLP_START_PRICE * BTC_WEIGHT / btcPrices[0].value
    const ethCount = GLP_START_PRICE * ETH_WEIGHT / ethPrices[0].value

    const ret = []
    for (let i = 0; i < btcPrices.length; i++) {
      const btcPrice = btcPrices[i].value
      const ethPrice = ethPrices[i].value
      const glpPrice = glpData[i]?.glpPrice 

      const syntheticPrice = btcCount * btcPrice + ethCount * ethPrice + GLP_START_PRICE / 2

      ret.push({
        timestamp: btcPrices[i].timestamp,
        syntheticPrice,
        glpPrice,
        ratio: glpPrice / syntheticPrice
      })
    }

    return ret
  }, [btcPrices, ethPrices, glpData])

  return [glpPerformanceChartData]
}