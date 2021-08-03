import React, { useEffect, useState, useCallback, useMemo } from 'react';
import * as ethers from 'ethers'
import * as strftime from 'strftime'

import logo from './react.svg';
import './Home.css';

const { BigNumber } = ethers
const { formatUnits} = ethers.utils

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
  ReferenceLine
} from 'recharts';
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

const defaultFetcher = url => fetch(url).then(res => res.json())
function useRequest(url, defaultValue, fetcher = defaultFetcher) {
  const [data, setData] = useState(defaultValue) 
  useEffect(() => {
    fetcher(url).then(setData)
  }, [url])

  return data
}

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

function Home() {
  const INTERVAL = 86400
  const SECONDS_PER_DAY = 86400
  const from = Math.floor(+new Date(2021, 8, 25) / SECONDS_PER_DAY)

  const usdgSupplyData = useRequest(`/api/usdgSupply?from=${from}`, [])
  const usdgSupplyChartData = usdgSupplyData.map(item => {
    const supply = BigNumber.from(item.supply.hex)
    return {
      value: parseInt(formatUnits(supply, 18)),
      date: new Date(item.timestamp * 1000)
    }
  })

  const usersData = useRequest('/api/users', [])
  const usersChartData = usersData.map(item => {
    return {
      margin: item.margin || 0,
      swap: item.swap || 0,
      all: item.margin + item.swap,
      date: new Date(item.timestamp * 1000)
    }
  })

  const feesData = useRequest('/api/fees', [])
  const feesChartData = feesData.map(item => {
    return {
      margin: item.margin || 0,
      swap: item.swap || 0,
      all: item.margin + item.swap,
      date: new Date(item.timestamp * 1000)
    }
  })
  const feesStats = useMemo(() => {
    if (!feesData || feesData.length === 0) {
      return
    }
    const getAll = el => (el.margin || 0) + (el.swap || 0)
    return {
      today: getAll(feesData[feesData.length - 1]),
      last7days: feesData.slice(-7).reduce((memo, el) => {
        return memo + getAll(el)
      }, 0)
    }
  }, [feesData])

  const swapSourcesData = useRequest('/api/swapSources', [])
  const swapSourcesChartData = swapSourcesData.map(item => {
    return {
      gmx: item.gmx,
      warden: item.warden,
      dodoex: item.dodoex,
      metamask: item.metamask,
      leverNetwork: item.leverNetwork,
      '1inch': item['1inch'],
      other: item.other,
      all: (item.warden || 0) + (item.other || 0) + (item.gmx || 0) + (item['1inch'] || 0) + (item.dodex || 0) + (item.metamask || 0) + (item.leverNetwork || 0),
      date: new Date(item.timestamp * 1000)
    }
  })

  const poolStatsData = useRequest('/api/poolStats', [])
  const poolAmountsChartData = useMemo(() => {
    return poolStatsData.map(item => {
      const tokens = ['BTC', 'BNB', 'USDT', 'USDC', 'ETH', 'BUSD']
      return {
        ...tokens.reduce((memo, symbol) => {
          const valueUsd = (item[symbol] && item[symbol].poolAmount) ? item[symbol].poolAmount.valueUsd : 0
          memo.all += valueUsd
          memo[symbol] = memo[symbol] || 0
          memo[symbol] += valueUsd
          return memo
        }, {all: 0}),
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [poolStatsData])

  const volumeData = useRequest('/api/volume', [])
  const volumeChartData = useMemo(() => {
    return volumeData.map(item => {
      return {
        margin: item.margin || 0,
        swap: item.swap || 0,
        burn: item.burn || 0,
        mint: item.mint || 0,
        liquidation: item.liquidation || 0,
        all: item.margin + item.swap,
        timestamp: item.timestamp
      }
    })
  }, [volumeData])
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

  const tooltipFormatter = useCallback(value => {
    return formatUsdValue(value)
  }, [])

  const tooltipLabelFormatter = useCallback((label, args) => {
    if (label.constructor !== Date) {
      label = new Date(label * 1000)
    }
    const date = strftime('%d.%m', label)
    const all = args && args[0] && args[0].payload && args[0].payload.all
    if (all) {
      return `${date}, ${formatUsdValue(all)}`
    }
    return date
  }, [])

  const tooltipLabelFormatterUnits = useCallback((label, args) => {
    const all = args && args[0] && args[0].payload && args[0].payload.all

    if (label.constructor !== Date) {
      return `${label}, total: ${all}`
    }

    const date = strftime('%d.%m', label)
    return `${date}, total: ${all}`
  })

  const CHART_HEIGHT = 300
  const YAXIS_WIDTH = 65

  return (
    <div className="Home">
      <div className="chart-grid">
        <div className="chart-cell half">
          <h2>Volume</h2>
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
              <YAxis dataKey="all" tickFormatter={tooltipFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" dataKey="swap" stackId="a" name="Swap" fill="#ee64b8" />
              <Bar type="monotone" dataKey="margin" stackId="a" name="Margin trading" fill="#8884ff" />
              <Bar type="monotone" dataKey="mint" stackId="a" name="Mint USDG" fill="#22c761" />
              <Bar type="monotone" dataKey="burn" stackId="a" name="Burn USDG" fill="#ab6100" />
              <Bar type="monotone" dataKey="liquidation" stackId="a" name="Liquidation" fill="#c90000" />

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
          <h2>Collected Fees</h2>
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
              <YAxis dataKey="all" tickFormatter={tooltipFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" dataKey="swap" stackId="a" name="Swap, Mint & Burn USDG" fill="#3483eb" />
              <Bar type="monotone" dataKey="margin" stackId="a" name="Margin & Liquidations" fill="#eb8334" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-cell">
          <h2>Pool</h2>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={poolAmountsChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" tickFormatter={tooltipFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" dataKey="BTC" stackId="a" name="BTC" fill="#3483eb" />
              <Bar type="monotone" dataKey="ETH" stackId="a" name="ETH" fill="#eb8334" />
              <Bar type="monotone" dataKey="BNB" stackId="a" name="BNB" fill="#ee64b8" />
              <Bar type="monotone" dataKey="USDC" stackId="a" name="USDC" fill="#8884ff" />
              <Bar type="monotone" dataKey="USDT" stackId="a" name="USDT" fill="#ab6100" />
              <Bar type="monotone" dataKey="BUSD" stackId="a" name="BUSD" fill="#c90000" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-cell">
          <h2>Swap Sources</h2>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={swapSourcesChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" tickFormatter={tooltipFormatter} width={YAXIS_WIDTH} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={tooltipLabelFormatter}
                contentStyle={{ textAlign: 'left' }}
              />
              <Legend />
              <Bar type="monotone" dataKey="1inch" stackId="a" name="1inch" fill="#ee64b8" />
              <Bar type="monotone" dataKey="dodoex" stackId="a" name="Dodoex" fill="#c90000" />
              <Bar type="monotone" dataKey="warden" stackId="a" name="WardenSwap" fill="#eb8334" />
              <Bar type="monotone" dataKey="metamask" stackId="a" name="MetaMask" fill="#ab6100" />
              <Bar type="monotone" dataKey="gmx" stackId="a" name="GMX direct" fill="#8884ff" />
              <Bar type="monotone" dataKey="leverNetwork" stackId="a" name="LeverNetwork" fill="#6e64b8" />
              <Bar type="monotone" dataKey="other" stackId="a" name="Other" fill="#22c761" />
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
          <h2>USDG Supply</h2>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <LineChart
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
              <Line type="monotone" dataKey="value" name="USDG Supply" stroke="#9984d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-cell">
          <h2>Unique users</h2>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <BarChart syncId="syncId" data={usersChartData}>
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
              <YAxis dataKey="all" width={YAXIS_WIDTH} />
              <Tooltip labelFormatter={tooltipLabelFormatterUnits} />
              <Legend />
              <Bar type="monotone" dataKey="margin" stackId="a" name="Margin trading" fill="#eb8334" />
              <Bar type="monotone" dataKey="swap" stackId="a" name="Swaps, Mint & Burn USDG" fill="#3483eb" />
            </BarChart>
          </ResponsiveContainer>
          <div className="chart-description">
            <p>Includes users routed through other protocols (like 1inch)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
