import { useMemo, useState, useEffect } from 'react'
import { ApolloClient, InMemoryCache, gql, HttpLink } from '@apollo/client'
import { chain, sumBy } from 'lodash'
import fetch from 'cross-fetch';

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

export function useGraph(query, subgraph = 'gkrasulya/gmx') {
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

export function usePnlData() {
  const query = `{
    aggregatedTradeCloseds(first: 1000, orderBy: settledBlockTimestamp) {
     settledPosition {
       id,
      realisedPnl
     },
     settledBlockTimestamp
   } 
  }`

  const [graphData, loading, error] = useGraph(query, 'nissoh/gmx-vault')

  let ret = null
  if (graphData) {
    ret = graphData.aggregatedTradeCloseds.map(item => ({
      timestamp: item.settledBlockTimestamp,
      pnl: Number(item.settledPosition.realisedPnl) / 1e30
    }))

    let cumulativePnl = 0 
    ret = chain(ret)
      .groupBy(item => Math.floor(item.timestamp / 86400) * 86400)
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

export function useVolumeData() {
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

    return chain(ret)
      .groupBy(item => Math.floor(item.timestamp / 86400) * 86400)
      .map((values, timestamp) => {
        const ret = { timestamp, all: sumBy(values, 'all') }
        PROPS.forEach(prop => {
           ret[prop] = sumBy(values, prop)
        })
        return ret
      }).value()
  }, [graphData])

  return [data, loading, error]
}


export function useFeesData() {
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

    return chain(chartData)
      .groupBy(item => Math.floor(item.timestamp / 86400) * 86400)
      .map((values, timestamp) => {
        const ret = { timestamp, all: sumBy(values, 'all') }
        PROPS.forEach(prop => {
           ret[prop] = sumBy(values, prop)
        })
        return ret
      }).value()
  }, [feesData])

  return [feesChartData, loading, error]
}

export function useGlpData() {
  const query = gql(`{
    addLiquidities(first: 1000 orderBy: timestamp) {
      timestamp
      aumInUsdg
      glpSupply
    }
  }`);
  let [data, loading, error] = useGraph(query)

  const glpChartData = useMemo(() => {
    if (!data) {
      return null
    }

    return data.addLiquidities.reduce((memo, item) => {
      const last = memo[memo.length - 1]

      const aum = Number(item.aumInUsdg) / 1e18
      const glpSupply = Number(item.glpSupply) / 1e18
      const glpPrice = aum / glpSupply
      const timestamp = Math.floor(item.timestamp / 86400) * 86400

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
    }, [])
  }, [data])

  return [glpChartData, loading, error]
}

export function useGlpPerformanceData(glpData) {
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