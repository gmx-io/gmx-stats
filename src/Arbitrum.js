import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { chain, sumBy } from 'lodash'
import fetch from 'cross-fetch';
import { ApolloClient, InMemoryCache, gql, HttpLink } from '@apollo/client'
import * as ethers from 'ethers'
import * as strftime from 'strftime'

import { useRequest, urlWithParams, tsToIso } from './helpers'
import './Home.css';

import {
  LineChart,
  BarChart,
  Line,
  Bar,
  Label,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
  ReferenceLine,
  Area,
  AreaChart,
  ComposedChart
} from 'recharts';
import {
  RiLoader5Fill
} from 'react-icons/ri'

const { BigNumber } = ethers
const { formatUnits} = ethers.utils

const data = [
  {
    name: 'Page A',
    uv: 4000,
    pv: 2400,
    amt: 2400,
  },
  {
    name: 'Page B',
    uv: 3000,
    pv: 1398,
    amt: 2210,
  }
]

const currencyFmt = Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const numberFmt = Intl.NumberFormat('en-US')
const NOW = Math.floor(Date.now() / 1000)

const formatNumberValue = value => {
    if (value >= 1e9) {
      return `${(value / 1e9).toFixed(value < 1e10 ? 2 : 1)}B`
    }
    if (value >= 1e6) {
      return `${(value / 1e6).toFixed(value < 1e7 ? 2 : 1)}M`
    }
    if (value >= 1e3) {
      return `${(value / 1e3).toFixed(value < 1e4 ? 2 : 1)}K`
    }
    return `${value.toFixed(1)}`
}

const formatUsdValue = value => {
  return `$${formatNumberValue(value)}`
}

const tooltipFormatterNumber = (value, name, item) => {
  return numberFmt.format(value)
}

const tooltipFormatter = (value, name, item) => {
  if (item && item.unit === '%') {
    return value.toFixed(2)
  }
  return currencyFmt.format(value)
}

const GRAPH_API_URL = "https://api.thegraph.com/subgraphs/name/gkrasulya/gmx";
// const GRAPH_API_URL = "https://api.thegraph.com/subgraphs/id/QmTZN95LgAoqW2ppogk652neBTkWVFG522Ez3wfxKejp94/graphql"
const graphClient = new ApolloClient({
  link: new HttpLink({ uri: GRAPH_API_URL, fetch }),
  cache: new InMemoryCache()
});

function useGraph(query, defaultData) {
  const [data, setData] = useState(defaultData)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    graphClient.query({query}).then(res => {
      setData(res.data)
      setLoading(false)
    })
  }, [query, setData, setLoading])

  return [data, loading]
}

function Arbitrum() {
  const [from, setFrom] = useState(tsToIso(Date.now() - 86400000 * 30))
  const [to, setTo] = useState()

  const setDatetimeRange = useCallback(range => {
    setFrom(new Date(Date.now() - range * 1000).toISOString().slice(0, -5))    
    setTo(undefined)
  }, [setFrom, setTo])

  const fromTs = +new Date(from) / 1000
  const toTs = to ? +new Date(to) / 1000 : NOW

  const SECONDS_IN_HOUR = 3600
  const SECONDS_IN_DAY = 86400
  const period = (toTs - fromTs) <= 86400 * 3 ? SECONDS_IN_HOUR : SECONDS_IN_DAY
  const today = Math.floor(Date.now() / 1000 / SECONDS_IN_DAY) * SECONDS_IN_DAY
  const params = { period, from: fromTs, to: toTs }

  const [displayPercentage, setDisplayPercentage] = useState(false)
  const dynamicUnit = displayPercentage ? '%' : ''

  const query = gql(`{
    addLiquidities(first: 1000 orderBy: timestamp) {
      timestamp
      aumInUsdg
      glpSupply
    }
  }`);
  let [data, loading] = useGraph(query)
  const addLiquiditiesChartData = useMemo(() => {
    if (!data) {
      return []
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

  const FEES_PROPS = 'margin liquidation swap mint burn'.split(' ')
  const feesQuery = gql(`{
    hourlyFees(first: 1000 orderBy: id) {
      id
      ${FEES_PROPS.join('\n')}
    }
  }`)
  let [feesData, feesLoading] = useGraph(feesQuery)
  const feesChartData = useMemo(() => {
    if (!feesData) {
      return null
    }

    let chartData =  feesData.hourlyFees.map(item => {
      const ret = { timestamp: item.id };
      let all = 0;
      FEES_PROPS.forEach(prop => {
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
        FEES_PROPS.forEach(prop => {
           ret[prop] = sumBy(values, prop)
        })
        return ret
      }).value()
  }, [feesData])

  const VOLUME_PROPS = 'margin liquidation swap mint burn'.split(' ')
  const volumeQuery = gql(`{
    hourlyVolumes(first: 1000 orderBy: id) {
      id
      ${VOLUME_PROPS.join('\n')}
    }
  }`)
  let [volumeData, volumeLoading] = useGraph(volumeQuery)
  const volumeChartData = useMemo(() => {
    if (!volumeData) {
      return null
    }

    let chartData =  volumeData.hourlyVolumes.map(item => {
      const ret = { timestamp: item.id };
      let all = 0;
      VOLUME_PROPS.forEach(prop => {
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
        VOLUME_PROPS.forEach(prop => {
           ret[prop] = sumBy(values, prop)
        })
        return ret
      }).value()
  }, [volumeData])

  const yaxisFormatterNumber = useCallback(value => {
    return formatNumberValue(value)
  })

  const yaxisFormatter = useCallback((value, ...args) => {
    if (displayPercentage) {
      return value.toFixed(2)
    }
    return formatUsdValue(value)
  }, [displayPercentage])

  const tooltipLabelFormatter = useCallback((label, args) => {
    if (!label) {
      return
    }

    if (label.constructor !== Date) {
      label = new Date(label * 1000)
    }
    const item = args && args[0] && args[0].payload && args[0]
    const dateFmtString = period >= SECONDS_IN_DAY && false ? '%d.%m' : '%d.%m %H:%M'
    const date = strftime(dateFmtString, label)
    const all = item && item.payload.all
    if (all) {
      if (item && item.unit === '%') {
        return date
      }
      return `${date}, ${currencyFmt.format(all)}`
    }
    return date
  }, [period])

  const tooltipLabelFormatterUnits = useCallback((label, args) => {
    if (!label) {
      return label
    }
    if (label.constructor !== Date) {
      label = new Date(label * 1000)
      if (!label.getDate()) {
        return label
      }
    }
    const date = strftime('%d.%m', label)

    const item = args && args[0]
    if (item && item.unit === '%') {
      return date
    }

    const all = item && item.payload.all

    if (label.constructor !== Date) {
      return `${label}, total: ${all}`
    }

    return `${date}, total: ${all}`
  })

  const CHART_HEIGHT = 300
  const YAXIS_WIDTH = 65

  return (
    <div className="Home">
      <h1>GMX analytics / Arbitrum</h1>
      <div className="chart-grid">
        <div className="chart-cell half">
          <h3>Volume</h3>
          { volumeLoading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={volumeChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" unit={dynamicUnit} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" unit={dynamicUnit} dataKey="swap" stackId="a" name="Swap" fill="#ee64b8" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="mint" stackId="a" name="Mint USDG" fill="#22c761" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="burn" stackId="a" name="Burn USDG" fill="#ab6100" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="liquidation" stackId="a" name="Liquidation" fill="#c90000" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="margin" stackId="a" name="Margin trading" fill="#8884ff" />

              <ReferenceLine x={1624406400} strokeWidth={2} stroke="lightblue">
                <Label value="1.5% threshold" angle={90} position="insideMiddle" />
              </ReferenceLine>
              <ReferenceLine x={1624924800} strokeWidth={2} stroke="lightblue">
                <Label value="1inch integration" angle={90} position="insideMiddle" />
              </ReferenceLine>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-cell half">
          <h3>Fees</h3>
          { feesLoading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={feesChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" unit={dynamicUnit} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" unit={dynamicUnit} dataKey="swap" stackId="a" name="Swap" fill="#ee64b8" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="mint" stackId="a" name="Mint USDG" fill="#22c761" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="burn" stackId="a" name="Burn USDG" fill="#ab6100" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="liquidation" stackId="a" name="Liquidation" fill="#c90000" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="margin" stackId="a" name="Margin trading" fill="#8884ff" />

              <ReferenceLine x={1624406400} strokeWidth={2} stroke="lightblue">
                <Label value="1.5% threshold" angle={90} position="insideMiddle" />
              </ReferenceLine>
              <ReferenceLine x={1624924800} strokeWidth={2} stroke="lightblue">
                <Label value="1inch integration" angle={90} position="insideMiddle" />
              </ReferenceLine>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-cell half">
          <h3>AUM / Glp Price</h3>
          { loading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ComposedChart syncId="syncId" data={addLiquiditiesChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="aum" unit={dynamicUnit} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
              <YAxis orientation="right" dataKey="glpPrice" tickFormatter={yaxisFormatter} yAxisId="right" width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Area type="monotone" unit={dynamicUnit} dataKey="aum" stackId="a" name="AUM" />
              <Line type="monotone" yAxisId="right" unit={dynamicUnit} dot={false} dataKey="glpPrice" stackId="a" name="GLP Price" stroke="#c90000" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-cell half">
          <h3>Glp Supply</h3>
          { loading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <AreaChart syncId="syncId" data={addLiquiditiesChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="glpSupply" tickFormatter={yaxisFormatterNumber} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatterNumber}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Area type="monotone" dataKey="glpSupply" stackId="a" name="GLP Supply" fill="#8884ff" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default Arbitrum;
