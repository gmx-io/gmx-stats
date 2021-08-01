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

function Home() {
  const usdgSupplyData = useRequest('/api/usdgSupply', [])
  const usdgSupplyChartData = usdgSupplyData.map(item => {
    const supply = BigNumber.from(item.supply.hex)
    return {
      value: parseInt(formatUnits(supply, 18)),
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

  const tooltipFormatter = useCallback((value, ...args) => {
    return numberFmt.format(parseInt(value))
  }, [])

  const tooltipLabelFormatter = useCallback((label, items) => {
    if (label.constructor !== Date) {
      label = new Date(label * 1000)
    }
    const date = strftime('%d.%m', label)
    const all = items && items[0] && items[0].payload && items[0].payload.all
    if (all) {
      return `${date}, ${numberFmt.format(all)}`
    }
    return date
  }, [])

  const showPool = false

  return (
    <div className="Home">
      <h2>Volume</h2>
      {volumeStats &&
        <p className="stats">
          Today: <b>{numberFmt.format(volumeStats.today)}</b><br />
          Last 7 days: <b>{numberFmt.format(volumeStats.last7days)}</b>
        </p>
      }
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={volumeChartData}>
          <CartesianGrid strokeDasharray="10 10" />
          <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
          <YAxis dataKey="all" tickFormatter={tooltipFormatter} width={120} />
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
            <Label value="1.5% threshold" position="insideTop" />
          </ReferenceLine>
          <ReferenceLine x={1624924800} strokeWidth={2} stroke="lightblue">
            <Label value="1inch integration" position="insideTop" />
          </ReferenceLine>
        </BarChart>
      </ResponsiveContainer>

      <h2>Collected Fees</h2>
      {feesStats &&
        <p className="stats">
          Today: <b>{numberFmt.format(feesStats.today)}</b><br />
          Last 7 days: <b>{numberFmt.format(feesStats.last7days)}</b>
        </p>
      }
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={feesChartData}>
          <CartesianGrid strokeDasharray="10 10" />
          <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
          <YAxis dataKey="all" tickFormatter={tooltipFormatter} width={120} />
          <Tooltip
            formatter={tooltipFormatter}
            labelFormatter={tooltipLabelFormatter}
            contentStyle={{ textAlign: 'left' }}
          />
          <Legend />
          <Bar type="monotone" dataKey="swap" stackId="a" name="Swap, mint & burn USDG" fill="#3483eb" />
          <Bar type="monotone" dataKey="margin" stackId="a" name="Margin & liquidations" fill="#eb8334" />
        </BarChart>
      </ResponsiveContainer>

      {showPool && 
      <>
      <h2>Pool</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={poolAmountsChartData}>
          <CartesianGrid strokeDasharray="10 10" />
          <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
          <YAxis dataKey="all" tickFormatter={tooltipFormatter} width={120} />
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
      </>
      }

      <h2>USDG Supply</h2>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          width={1000}
          height={400}
          data={usdgSupplyChartData}
        >
          <CartesianGrid strokeDasharray="10 10" />
          <XAxis dataKey="date" tickFormatter={tooltipLabelFormatter} />
          <YAxis dataKey="value" tickFormatter={tooltipFormatter} width={120} />
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
  );
}

export default Home;
