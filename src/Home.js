import React, { useEffect, useState, useCallback, useMemo } from 'react';
import * as ethers from 'ethers'
import * as strftime from 'strftime'

import { useRequest, urlWithParams } from './helpers'
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

const formatUsdValue = value => {
    if (value > 1e9) {
      return `$${(value / 1e9).toFixed(value < 1e10 ? 2 : 1)}B`
    }
    if (value > 1e6) {
      return `$${(value / 1e6).toFixed(value < 1e7 ? 2 : 1)}M`
    }
    if (value > 1e3) {
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

function Home() {
  const [from, setFrom] = useState(new Date(Date.now() - 86400000 * 30).toISOString().slice(0, -5))
  const [to, setTo] = useState(new Date().toISOString().slice(0, -5))

  const fromTs = +new Date(from) / 1000
  const toTs = +new Date(to) / 1000

  const SECONDS_IN_HOUR = 3600
  const SECONDS_IN_DAY = 86400
  const [period, setPeriod] = useState(SECONDS_IN_DAY)
  const today = Math.floor(Date.now() / 1000 / SECONDS_IN_DAY) * SECONDS_IN_DAY
  const params = { period, from: fromTs, to: toTs }

  const [displayPercentage, setDisplayPercentage] = useState(false)
  const dynamicUnit = displayPercentage ? '%' : ''

  const usdgSupplyData = useRequest(urlWithParams('/api/usdgSupply', params), [])
  const usdgSupplyChartData = useMemo(() => {
    return usdgSupplyData.map(item => {
      const supply = BigNumber.from(item.supply.hex)
      return {
        value: parseInt(formatUnits(supply, 18)),
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [usdgSupplyData])

  const usersData = useRequest(urlWithParams('/api/users', params), [])
  const usersChartData = useMemo(() => {
    return usersData.map(item => {
      const allValue = (item.margin || 0) + (item.swap || 0)
      const margin = displayPercentage ? (item.margin || 0) / allValue * 100 : item.margin
      const swap = displayPercentage ? (item.swap || 0) / allValue * 100 : item.swap
      return {
        margin,
        swap,
        all: displayPercentage ? 100 : allValue,
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [usersData, displayPercentage])

  const feesData = useRequest(urlWithParams('/api/fees', params), [])
  const feesChartData = useMemo(() => {
    return feesData.map(item => {
      const allValue = Object.values(item.metrics).reduce((memo, el) => memo + el)
      return {
        ...Object.entries(item.metrics).reduce((memo, [key, value]) => {
          memo[key] = displayPercentage ? value / allValue * 100 : value
          return memo
        }, {}),
        all: displayPercentage ? 100 : allValue,
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [feesData, displayPercentage])
  const feesStats = useMemo(() => {
    if (!feesData || feesData.length === 0) {
      return
    }
    const getAll = metrics => Object.values(metrics).reduce((memo, value) => memo + value)
    return {
      today: getAll(feesData[feesData.length - 1].metrics),
      last7days: feesData.slice(-7).reduce((memo, el) => {
        return memo + getAll(el.metrics)
      }, 0)
    }
  }, [feesData])

  const swapSourcesData = useRequest(urlWithParams('/api/swapSources', params), [])
  const swapSourcesChartData = useMemo(() => {
    return swapSourcesData.map(item => {
      const allValue = Object.values(item.metrics).reduce((memo, value) => memo + value)

      const metrics = Object.entries(item.metrics).reduce((memo, [key, value]) => {
        memo[key] = displayPercentage ? value / allValue * 100 : value
        return memo
      }, {})

      return {
        ...metrics,
        all: displayPercentage ? 100 : allValue,
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [swapSourcesData, displayPercentage])

  const poolStatsData = useRequest(urlWithParams('/api/poolStats', params), [])
  const poolAmountsChartData = useMemo(() => {
    return poolStatsData.map(item => {
      const tokens = ['BTC', 'BNB', 'USDT', 'USDC', 'ETH', 'BUSD']
      const allValueUsd = tokens.reduce((memo, symbol) => {
          const valueUsd = (item[symbol] && item[symbol].poolAmount) ? item[symbol].poolAmount.valueUsd : 0
          return memo + valueUsd
      }, 0)

      if (displayPercentage) {
        return {
          ...tokens.reduce((memo, symbol) => {
            const valueUsd = (item[symbol] && item[symbol].poolAmount) ? item[symbol].poolAmount.valueUsd : 0
            memo[symbol] = valueUsd / allValueUsd * 100
            return memo
          }, {}),
          all: 100,
          date: new Date(item.timestamp * 1000)
        }
      }

      return {
        ...tokens.reduce((memo, symbol) => {
          const valueUsd = (item[symbol] && item[symbol].poolAmount) ? item[symbol].poolAmount.valueUsd : 0
          memo[symbol] = valueUsd
          return memo
        }, {}),
        all: allValueUsd,
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [poolStatsData, displayPercentage])

  const volumeData = useRequest(urlWithParams('/api/volume', params), [])
  const volumeChartData = useMemo(() => {
    return volumeData.map(item => {
      const allValue = (item.margin || 0) + (item.swap || 0) + (item.burn || 0) + (item.mint || 0) + (item.liquidation || 0)
      const metrics = ['margin', 'swap', 'burn', 'mint', 'liquidation'].reduce((memo, key) => {
        if (item[key]) {
          memo[key] = displayPercentage ? item[key] / allValue * 100 : item[key]
        }
        return memo
      }, {})
      return {
        ...metrics,
        all: displayPercentage ? 100 : allValue,
        timestamp: item.timestamp
      }
    })
  }, [volumeData, displayPercentage])
  const volumeStats = useMemo(() => {
    if (!volumeData || volumeData.length === 0) {
      return
    }
    const getAll = el => (el.margin || 0) + (el.swap || 0) + (el.burn || 0) + (el.mint || 0) + (el.liquidation || 0)
    return {
      today: getAll(volumeData[volumeData.length - 1]),
      last7days: volumeData.slice(-7).reduce((memo, el) => {
        return memo + getAll(el)
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
    <div className="Home">
      <h1>GMX analytics</h1>
      <div className="form">
        <p>
          <label>Period</label>
          <input type="datetime-local" value={from} onChange={evt => setFrom(evt.target.value)} />
          &nbsp;—&nbsp;
          <input type="datetime-local" value={to} onChange={evt => setTo(evt.target.value)} />
        </p>
        <p>
          <input id="displayPercentageCheckbox" type="checkbox" checked={displayPercentage} onChange={evt => setDisplayPercentage(evt.target.checked)} />
          <label htmlFor="displayPercentageCheckbox">Show relative shares</label>
        </p>
      </div>
      <div className="chart-grid">
        <div className="chart-cell half">
          <h3>Volume</h3>
          {volumeStats &&
            <p className="stats">
              Today: <b>{numberFmt.format(volumeStats.today)}</b><br />
              Last 7 days: <b>{numberFmt.format(volumeStats.last7days)}</b>
            </p>
          }
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
          <h3>Collected Fees</h3>
          {feesStats &&
            <p className="stats">
              Today: <b>{numberFmt.format(feesStats.today)}</b><br />
              Last 7 days: <b>{numberFmt.format(feesStats.last7days)}</b>
            </p>
          }
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={feesChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
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
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-cell">
          <h3>Pool</h3>
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
              <Bar type="monotone" unit={dynamicUnit} dataKey="USDC" stackId="a" name="USDC" fill="#8884ff" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="USDT" stackId="a" name="USDT" fill="#ab6100" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="BUSD" stackId="a" name="BUSD" fill="#c90000" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="BTC" stackId="a" name="BTC" fill="#3483eb" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="ETH" stackId="a" name="ETH" fill="#eb8334" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="BNB" stackId="a" name="BNB" fill="#ee64b8" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-cell">
          <h3>Swap Sources</h3>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={swapSourcesChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" unit={dynamicUnit} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" unit={dynamicUnit} dataKey="1inch" stackId="a" name="1inch" fill="#ee64b8" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="dodoex" stackId="a" name="Dodoex" fill="#c90000" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="warden" stackId="a" name="WardenSwap" fill="#eb8334" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="metamask" stackId="a" name="MetaMask" fill="#ab6100" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="gmx" stackId="a" name="GMX" fill="#8884ff" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="stabilize" stackId="a" name="Stabilize" fill="#666" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="other" stackId="a" name="Other" fill="#22c761" />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-description">
            <ul>
              <li>Includes Swaps, USDG Mint and Burn.</li>
              <li>Source is identified by transaction recipient. E.g. if a swap transaction was sent to MetaMask Router and was routed MetaMask -> 1inch -> GMX than the swap source would be "MetaMask", not "1inch"</li>
            </ul>
          </div>
        </div>

        <div className="chart-cell">
          <h3>USDG Supply</h3>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <AreaChart
              data={usdgSupplyChartData}
              syncId="syncId"
            >
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} />
              <YAxis dataKey="value" tickFormatter={tooltipFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <ooltip />
              <Legend />
              <Area type="monotone" dataKey="value" name="USDG Supply" stroke="#9984d8" fillOpacity={0.5} fill="#8884d8" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-cell">
          <h3>Unique users</h3>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={usersChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" unit={displayPercentage ? '%' : ''} width={YAXIS_WIDTH} />
              <Tooltip
                labelFormatter={tooltipLabelFormatterUnits}
                formatter={value => displayPercentage ? value.toFixed(2) : value}
              />
              <Legend />
              <Bar type="monotone" unit={dynamicUnit} dataKey="margin" stackId="a" name="Margin trading" fill="#eb8334" />
              <Bar type="monotone" unit={dynamicUnit} dataKey="swap" stackId="a" name="Swaps, Mint & Burn USDG" fill="#3483eb" />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-description">
            <p>Includes users routed through other protocols (like 1inch)</p>
          </div>
        </div>

        <div className="chart-cell">
        </div>
      </div>
    </div>
  );
}

export default Home;
