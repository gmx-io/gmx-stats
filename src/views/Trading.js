import React, { useEffect, useState, useCallback, useMemo } from 'react';
import * as ethers from 'ethers'
import * as strftime from 'strftime'

import { urlWithParams, tsToIso } from '../helpers'
import { useRequest } from '../dataProvider'

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

// function fillTicks(dataset, { from, to, interval }) {
//  let i = 0
//  let prevItem
//  while (true) {
//    const item = dataset[i] 
//    const intervalGroup = Math.floor(item.timestamp / interval)
//    if (prevItem && )
//  }
// }

function Trading() {
  const [from, setFrom] = useState(tsToIso(Date.now() - 86400000 * 3))
  const [to, setTo] = useState()

  const fromTs = +new Date(from) / 1000
  const toTs = to ?? +new Date(to) / 1000

  const params = {from: fromTs, to: toTs}
  const [btcData] = useRequest(urlWithParams(`/api/prices/BTC`, params), [])
  const [ethData] = useRequest(urlWithParams(`/api/prices/ETH`, params), [])
  const [bnbData] = useRequest(urlWithParams(`/api/prices/BNB`, params), [])

  const assetChartData = useMemo(() => {
    const all = {}
    const options = [
      ['BTC', btcData],
      ['ETH', ethData],
      ['BNB', bnbData]
    ]

    options.forEach(([name, assetData]) => {
      if (!assetData || assetData.length === 0) {
        return
      }
      let maxPrice = 0
      let minPrice = Infinity
      all[name] = {
        data: assetData.map(item => {
          const price = item.price / 1e8
          if (price > maxPrice) {
            maxPrice = price
          }
          if (price < minPrice) {
            minPrice = price
          }
          return {
            date: new Date(item.timestamp * 1000),
            price: price,
            poolAmount: item.poolAmount
          }
        })
      }
      all[name].maxPrice = maxPrice
      all[name].minPrice = minPrice
    })

    return all
  }, [btcData, ethData, bnbData])

  const [pnlData] = useRequest(urlWithParams('/api/marginPnl', params), [])
  const pnlChartData = useMemo(() => {
    return pnlData.map(item => {
      if (!item.metrics) {
        return {
          date: new Date(item.timestamp * 1000)
        }
      }
      return {
        date: new Date(item.timestamp * 1000),
        net: item.metrics.net,
        profits: item.metrics.profits,
        loss: item.metrics.loss,
        long: item.metrics.long,
        short: item.metrics.short,
      } 
    })
  }, [pnlData])
  const pnlMin = pnlChartData.length ? pnlChartData[pnlChartData.length - 1].loss : 0
  const pnlMax = pnlChartData.length ? pnlChartData[pnlChartData.length - 1].profits : 0

  const [liquidationsData] = useRequest(urlWithParams('api/liquidations', {from: fromTs, to: toTs}), [])
  const liquidationsChartData = useMemo(() => {
    let cum = 0
    let longCum = 0
    let shortCum = 0
    return liquidationsData.map(item => {
      const collateral = item.collateral || 0
      cum += collateral
      if (item.isLong) {
        longCum += collateral
      } else {
        shortCum += collateral
      }
      return {
        date: new Date(item.timestamp * 1000),
        collateral: cum,
        long: longCum,
        short: shortCum
      }
    })
  }, [liquidationsData])

  const [feesData] = useRequest(urlWithParams('/api/fees', { disableGrouping: 1, ...params }), [])
  const feesChartData = useMemo(() => {
    const cum = {}
    return feesData.map(item => {
      cum[item.type] = (cum[item.type] || 0) + item.value
      const all = Object.values(cum).reduce((sum, value) => sum + value)
      return {
        ...cum,
        all,
        date: new Date(item.timestamp * 1000)
      }
    })
  }, [feesData])

  const [swapSourcesData] = useRequest(urlWithParams('/api/swapSources', { period: 3600, rawSource: 1, ...params }), [])
  const swapSourcesFilteredKeys = useMemo(() => {
    if (swapSourcesData.length === 0) {
      return []
    }
    const count = {}
    swapSourcesData.forEach(item => {
      if (!item.metrics) {
        return
      }
      Object.keys(item.metrics).forEach(key => {
        count[key] = (count[key] || 0) + 1
      })
    })

    return Object.keys(count).filter(key => count[key] > 1)
  }, [swapSourcesData])
  const swapSourcesChartData = useMemo(() => {
    if (swapSourcesFilteredKeys.length === 0) {
      return []
    }

    let cum = {}
    return swapSourcesData.map(item => {
      let all = 0
      swapSourcesFilteredKeys.forEach(key => {
        if (item.metrics && item.metrics[key]) {
          cum[key] = (cum[key] || 0) + item.metrics[key]
          all += cum[key]
        }
      })
      return {
        date: new Date(item.timestamp * 1000),
        all,
        ...cum
      }
    })
  }, [swapSourcesData, swapSourcesFilteredKeys])

  const COLORS = ['red', 'green', 'blue', 'lightblue', 'purple', 'pink', 'brown', 'orange']

  return (
    <>
      <div>
        <p>
          <label>From</label>
          <input type="datetime-local" value={from} onChange={evt => setFrom(evt.target.value)} />
        </p>
        <p>
          <label>To</label>
          <input type="datetime-local" value={to} onChange={evt => setTo(evt.target.value)} />
        </p>
      </div>     
      {Object.entries(assetChartData).map(([name, {data, maxPrice, minPrice}]) => {
        return <div key={name}>
          <h2>{name}</h2>
          <ResponsiveContainer width="100%" height={600}>
            <ComposedChart
              data={data}
            >
              <CartesianGrid strokeDasharray="10 10" />
              <XAxis dataKey="date" />
              <YAxis
                yAxisId="left"
                dataKey="price"
                domain={[Math.round(minPrice * 0.99), Math.round(maxPrice * 1.01)]}
              />
              <YAxis yAxisId="right" orientation="right" dataKey="poolAmount" />
              <Tooltip />
              <Legend />
              <Area isAnimationActive={false} strokeWidth={0} yAxisId="right" dataKey="poolAmount" name="Pool" dot={false} fill="#627EEA" />
              <Line isAnimationActive={false} yAxisId="left" dataKey="price" name="Chainlink Price" dot={false} stroke="#666" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      })}

      <h2>Liquidated Collateral</h2>
      <ResponsiveContainer width="100%" height={600}>
        <ComposedChart
          data={liquidationsChartData}
        >
          <CartesianGrid strokeDasharray="10 10" />
          <XAxis dataKey="date" />
          <YAxis dataKey="collateral" />
          <Tooltip />
          <Legend />
          <Area isAnimationActive={false} stackId="a" dataKey="long" name="Long" dot={false} strokeWidth={0} stroke="purple" fill="purple" />
          <Area isAnimationActive={false} stackId="a" dataKey="short" name="Short" dot={false} stroke="green" strokeWidth={0} fill="green" />
          <Line isAnimationActive={false} dataKey="collateral" name="All" dot={false} stroke="black" strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>

      <h2>Global PnL</h2>
      <ResponsiveContainer width="100%" height={600}>
        <ComposedChart
          data={pnlChartData}
        >
          <CartesianGrid strokeDasharray="10 10" />
          <XAxis dataKey="date" />
          <YAxis domain={[pnlMin * 1.5, pnlMax * 0.50]} />
          <Tooltip />
          <Legend />
          <Area isAnimationActive={false} dataKey="profits" name="Profits" dot={false} strokeWidth={0} fill="lightblue" />
          <Area isAnimationActive={false} dataKey="loss" name="Loss" dot={false} stroke="pink" strokeWidth={0} fill="pink" />
          <Line isAnimationActive={false} dataKey="net" name="Net" dot={false} stroke="#000" strokeWidth={2} />
          <Line isAnimationActive={false} dataKey="long" name="Longs Net" dot={false} stroke="green" strokeWidth={1} />
          <Line isAnimationActive={false} dataKey="short" name="Shorts Net" dot={false} stroke="red" strokeWidth={1} />
        </ComposedChart>
      </ResponsiveContainer>

      <h2>Fees</h2>
      <ResponsiveContainer width="100%" height={600}>
        <ComposedChart syncId="syncId" data={feesChartData}>
          <CartesianGrid strokeDasharray="10 10" />
          <XAxis dataKey="date" minTickGap={30} />
          <YAxis dataKey="all" />
          <Tooltip />
          <Legend />
          <Area type="monotone" dot={false} dataKey="swap" stackId="a" name="Swap" stroke="#FE88B1" fill="#FE88B1" />
          <Area type="monotone" dot={false} dataKey="mint" stackId="a" name="Mint USDG" stroke="#C9DB74" fill="#C9DB74" />
          <Area type="monotone" dot={false} dataKey="burn" stackId="a" name="Burn USDG" stroke="#ab6100" fill="#ab6100" />
          <Area type="monotone" dot={false} dataKey="liquidation" stackId="a" name="Liquidation" stroke="#c90000" fill="#c90000" />
          <Area type="monotone" dot={false} dataKey="margin" stackId="a" name="Margin trading" stroke="#5D69B1" fill="#5D69B1" />
          <Line isAnimationActive={false} dot={false} dataKey="all" name="Total" stroke="#000" />
        </ComposedChart>
      </ResponsiveContainer>

      <h2>Swap volumes by recipient</h2>
      <ResponsiveContainer width="100%" height={600}>
        <LineChart syncId="syncId" data={swapSourcesChartData}>
          <CartesianGrid strokeDasharray="10 10" />
          <XAxis dataKey="date" minTickGap={30} />
          <YAxis dataKey="all" />
          <Tooltip />
          <Legend />
          {swapSourcesFilteredKeys.map((key, i) => {
            return <Line dataKey={key} dot={false} stroke={COLORS[i % COLORS.length]} />
          })}
        </LineChart>
      </ResponsiveContainer>
    </>
  )
}

export default Trading