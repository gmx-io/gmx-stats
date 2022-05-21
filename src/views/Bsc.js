import React, { useEffect, useState, useCallback, useMemo } from 'react';
import * as ethers from 'ethers'
import * as strftime from 'strftime'

import { urlWithParams, tsToIsoDate, COINCOLORS } from '../helpers'
import {
  useRequest,
  useGambitPoolStats,
  useGambitVolumeData,
  useGambitFeesData
} from '../dataProvider'

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

const numberFmt = Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const NOW = Math.floor(Date.now() / 1000)

const formatUsdValue = value => {
    if (value >= 1e9) {
      return `$${(value / 1e9).toFixed(value < 1e10 ? 2 : 1)}B`
    }
    if (value >= 1e6) {
      return `$${(value / 1e6).toFixed(value < 1e7 ? 2 : 1)}M`
    }
    if (value >= 1e3) {
      return `$${(value / 1e3).toFixed(value < 1e4 ? 2 : 1)}K`
    }
    return `$${value.toFixed(1)}`
}

const tooltipFormatter = (value, name, item) => {
  if (item && item.unit === '%') {
    return value.toFixed(2)
  }
  return numberFmt.format(value)
}

function Bsc() {
  const [from, setFrom] = useState(tsToIsoDate(Date.now() - 86400000 * 30))
  const [to, setTo] = useState()

  const setDateRange = useCallback(range => {
    setFrom(new Date(Date.now() - range * 1000).toISOString().slice(0, 10))
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

  // const [feesData, feesLoading] = useRequest(urlWithParams('/api/fees', params), [])
  const [feesData, feesLoading] = useGambitFeesData(params)
  const feesStats = useMemo(() => {
    if (!feesData || feesData.length === 0) {
      return
    }
    return {
      lastItem: feesData[feesData.length - 1].all,
      allItems: feesData.reduce((memo, el) => {
        return memo + el.all
      }, 0)
    }
  }, [feesData])


  const [poolStatsData, poolStatsLoading] = useGambitPoolStats({ from: fromTs, to: toTs, groupPeriod: period })
  const poolAmountsChartData = useMemo(() => {
    if (!poolStatsData) {
      return []
    }

    return poolStatsData.map(item => {
      const tokens = ['BTC', 'BNB', 'USDT', 'USDC', 'ETH', 'BUSD']
      const allValueUsd = tokens.reduce((memo, symbol) => {
          return memo + item[symbol]
      }, 0)

      if (displayPercentage) {
        return {
          ...tokens.reduce((memo, symbol) => {
            const valueUsd = item[symbol]
            memo[symbol] = valueUsd / allValueUsd * 100
            return memo
          }, {}),
          all: 100,
          date: new Date(item.timestamp * 1000)
        }
      }

      return {
        ...tokens.reduce((memo, symbol) => {
          const valueUsd = item[symbol]
          memo[symbol] = valueUsd
          return memo
        }, {}),
        all: allValueUsd,
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [poolStatsData, displayPercentage])

  const usdgSupplyChartData = useMemo(() => {
    if (!poolStatsData) {
      return null
    }
    return poolStatsData.map(item => {
      const tokens = ['BTC', 'BNB', 'USDT', 'USDC', 'ETH', 'BUSD']
      const allValueUsd = tokens.reduce((memo, symbol) => {
          return memo + item[symbol]
      }, 0)
      const price = allValueUsd / item.usdgSupply
      return {
        value: item.usdgSupply,
        price,
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [poolStatsData])

  // const [volumeData, volumeLoading] = useRequest(urlWithParams('/api/volume', params), [])
  const [volumeData, volumeLoading] = useGambitVolumeData(params)
  const volumeStats = useMemo(() => {
    if (!volumeData || volumeData.length === 0) {
      return
    }
    return {
      lastItem: volumeData[volumeData.length - 1].all,
      allItems: volumeData.reduce((memo, el) => {
        return memo + el.all
      }, 0)
    }
  }, [volumeData])

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
    const dateFmtString = period >= SECONDS_IN_DAY ? '%d.%m' : '%d.%m %H:%M'
    const date = strftime(dateFmtString, label)
    const all = item && item.payload.all
    if (all) {
      if (item && item.unit === '%') {
        return date
      }
      return `${date}, ${numberFmt.format(all)}`
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
    <div className="Bsc">
      <h1>Gambit Analytics / Binance Smart Chain</h1>
      <p style={{color: "orange", fontWeight: "bold", fontSize: 18}}>
        Gambit on Binance Smart Chain is not operating currently. GMX operates on Arbitrum and Avalanche
      </p>
      <div className="form">
        <p>
          <label>Period</label>
          <input type="date" value={from} onChange={evt => setFrom(evt.target.value)} />
          &nbsp;—&nbsp;
          <input type="date" value={to} onChange={evt => setTo(evt.target.value)} />
          <button onClick={evt => setDateRange(86400 * 29)}>30 days</button>
          <button onClick={evt => setDateRange(86400 * 6)}>7 days</button>
        </p>
      </div>
      <div className="chart-grid">
        <div className="chart-cell">
          <h3>Volume</h3>
          {volumeStats &&
            <p className="stats">
              Last record: <b>{numberFmt.format(volumeStats.lastItem)}</b><br />
              Selected period: <b>{numberFmt.format(volumeStats.allItems)}</b>
            </p>
          }
          { volumeLoading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={volumeData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" unit={dynamicUnit} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" unit={dynamicUnit} dataKey="swap" stackId="a" name="Swap" fill="#FE88B1" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="mint" stackId="a" name="Mint USDG" fill="#92E0C8" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="burn" stackId="a" name="Burn USDG" fill="#F89C74" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="liquidation" stackId="a" name="Liquidation" fill="#00BFEA" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="margin" stackId="a" name="Margin trading" fill="#949FE1" />

              <ReferenceLine x={1624406400} strokeWidth={2} stroke="lightblue">
                <Label value="1.5% threshold" angle={90} position="insideMiddle" />
              </ReferenceLine>
              <ReferenceLine x={1624924800} strokeWidth={2} stroke="lightblue">
                <Label value="1inch integration" angle={90} position="insideMiddle" />
              </ReferenceLine>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-cell">
          <h3>Collected Fees</h3>
          {feesStats &&
            <p className="stats">
              Last record: <b>{numberFmt.format(feesStats.lastItem)}</b><br />
              Selected period: <b>{numberFmt.format(feesStats.allItems)}</b>
            </p>
          }
          { feesLoading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={feesData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" unit={dynamicUnit} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" unit={dynamicUnit} dataKey="swap" stackId="a" name="Swap" fill="#FE88B1" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="mint" stackId="a" name="Mint USDG" fill="#92E0C8" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="burn" stackId="a" name="Burn USDG" fill="#F89C74" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="liquidation" stackId="a" name="Liquidation" fill="#00BFEA" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="margin" stackId="a" name="Margin trading" fill="#949FE1" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-cell">
          <h3>
            Pool
          </h3>
          { poolStatsLoading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={poolAmountsChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" unit={dynamicUnit} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" unit={dynamicUnit} dataKey="USDC" stackId="a" name="USDC" fill={COINCOLORS[4]} />
              <Bar type="monotone" unit={dynamicUnit} dataKey="USDT" stackId="a" name="USDT" fill={COINCOLORS[5]} />
              <Bar type="monotone" unit={dynamicUnit} dataKey="BUSD" stackId="a" name="BUSD" fill={COINCOLORS[12]} />
              <Bar type="monotone" unit={dynamicUnit} dataKey="BTC" stackId="a" name="BTC" fill={COINCOLORS[1]} />
              <Bar type="monotone" unit={dynamicUnit} dataKey="ETH" stackId="a" name="ETH" fill={COINCOLORS[0]} />
              <Bar type="monotone" unit={dynamicUnit} dataKey="BNB" stackId="a" name="BNB" fill={COINCOLORS[13]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-cell">
          <h3>USDG</h3>
          { poolStatsLoading && <RiLoader5Fill size="3em" className="loader" /> }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <ComposedChart
              data={usdgSupplyChartData}
              syncId="syncId"
            >
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} />
              <YAxis dataKey="value" tickFormatter={tooltipFormatter} width={YAXIS_WIDTH} />
              <YAxis dataKey="price" tickFormatter={tooltipFormatter} orientation="right" yAxisId="right" width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <ooltip />
              <Legend />
              <Area type="monotone" dataKey="value" name="Supply" stroke="#9984d8" fillOpacity={0.5} fill="#8884d8" strokeWidth={2} />
              <Line type="monotone" dot={false} dataKey="price" yAxisId="right" name="Price" stroke="#FE88B1" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default Bsc;
