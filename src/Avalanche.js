import React, { useEffect, useState, useCallback, useMemo } from 'react';
import * as ethers from 'ethers'
import moment from 'moment'
import { RiLoader5Fill } from 'react-icons/ri'

import {
  yaxisFormatterNumber,
  yaxisFormatterPercent,
  yaxisFormatter,
  tooltipLabelFormatter,
  tooltipLabelFormatterUnits,
  tooltipFormatter,
  tooltipFormatterNumber,
  tooltipFormatterPercent,
  formatNumber,
  tsToIsoDate,
  CHART_HEIGHT,
  YAXIS_WIDTH,
  COLORS,
  GREEN,
  RED
} from './helpers'
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
  ComposedChart,
  Cell,
  PieChart,
  Pie
} from 'recharts';

import ChartWrapper from './components/ChartWrapper'
import VolumeChart from './components/VolumeChart'
import FeesChart from './components/FeesChart'
import GenericChart from './components/GenericChart'

import {
  useVolumeData,
  useTotalVolumeFromServer,
  useVolumeDataFromServer,
  useFeesData,
  useGlpData,
  useAumPerformanceData,
  useCoingeckoPrices,
  useGlpPerformanceData,
  useTradersData,
  useSwapSources,
  useFundingRateData,
  useUsersData,
  useLastSubgraphBlock,
  useLastBlock
} from './dataProvider'

const { BigNumber } = ethers
const { formatUnits} = ethers.utils
const NOW = Math.floor(Date.now() / 1000)

function Arbitrum() {
  const DEFAULT_GROUP_PERIOD = 86400
  const [groupPeriod, setGroupPeriod] = useState(DEFAULT_GROUP_PERIOD)

  const [fromValue, setFromValue] = useState()
  const [toValue, setToValue] = useState()

  const setDateRange = useCallback(range => {
    setFromValue(new Date(Date.now() - range * 1000).toISOString().slice(0, 10))
    setToValue(undefined)
  }, [setFromValue, setToValue])

  const from = fromValue ? +new Date(fromValue) / 1000 : undefined
  const to = toValue ? +new Date(toValue) / 1000 : NOW

  const params = { from, to, groupPeriod, chainName: 'avalanche' }

  // const [fundingRateData, fundingRateLoading] = useFundingRateData(params)
  const [volumeData, volumeLoading] = useVolumeDataFromServer(params)
  const [totalVolume] = useTotalVolumeFromServer()
  const totalVolumeDelta = useMemo(() => {
    if (!volumeData) {
      return null
    }
    return volumeData[volumeData.length - 1].all
  }, [volumeData])

  const [feesData, feesLoading] = useFeesData(params)
  const [totalFees, totalFeesDelta] = useMemo(() => {
    if (!feesData) {
      return []
    }
    const total = feesData[feesData.length - 1]?.cumulative
    const delta = total - feesData[feesData.length - 2]?.cumulative
    return [total, delta]
  }, [feesData])

  // const [glpData, glpLoading] = useGlpData(params)
  // const [totalAum, totalAumDelta] = useMemo(() => {
  //   if (!glpData) {
  //     return []
  //   }
  //   const total = glpData[glpData.length - 1]?.aum
  //   const delta = total - glpData[glpData.length - 2]?.aum
  //   return [total, delta]
  // }, [glpData])

  // const [aumPerformanceData, aumPerformanceLoading] = useAumPerformanceData(params)
  // const [glpPerformanceData, glpPerformanceLoading] = useGlpPerformanceData(glpData, feesData, params)

  // const [tradersData, tradersLoading] = useTradersData(params)
  // const [openInterest, openInterestDelta] = useMemo(() => {
  //   if (!tradersData) {
  //     return []
  //   }
  //   const total = tradersData.data[tradersData.data.length - 1]?.openInterest
  //   const delta = total - tradersData.data[tradersData.data.length - 2]?.openInterest
  //   return [total, delta]
  // }, [tradersData])
  // const [swapSources, swapSourcesLoading] = useSwapSources(params)
  // const swapSourcesKeys = Object.keys((swapSources || []).reduce((memo, el) => {
  //   Object.keys(el).forEach(key => {
  //     if (key === 'all' || key === 'timestamp') return
  //     memo[key] = true
  //   })
  //   return memo
  // }, {}))

  // const [usersData, usersLoading] = useUsersData(params)
  // const [totalUsers, totalUsersDelta] = useMemo(() => {
  //   if (!usersData) {
  //     return [null, null]
  //   }
  //   const total = usersData[usersData.length - 1]?.uniqueCountCumulative
  //   const prevTotal = usersData[usersData.length - 2]?.uniqueCountCumulative
  //   const delta = total && prevTotal ? total - prevTotal : null
  //   return [
  //     total,
  //     delta
  //   ]

  // }, [usersData])

  // function getCsv(data) {
  //   if (!data || data.length === 0) {
  //     return null
  //   }

  //   const header = Object.keys(data[0]).join(',')
  //   const rows = data.map(item => {
  //     return Object.values(item).join(',')
  //   }).join('\n')
  //   return header + '\n' + rows
  // }

  const [lastSubgraphBlock] = useLastSubgraphBlock()
  const [lastBlock] = useLastBlock()

  const isObsolete = lastSubgraphBlock && lastBlock && lastBlock.timestamp - lastSubgraphBlock.timestamp > 3600

  const [isExperiment, setIsExperiment] = useState(false)
  useEffect(() => {
    setIsExperiment(window.localStorage.getItem('experiment'))
  }, [setIsExperiment])

  const showForm = false

  return (
    <div className="Home">
      <h1>GMX Analytics / Arbitrum</h1>
      {lastSubgraphBlock && lastBlock &&
        <p className={isObsolete ? 'warning' : ''} style={{ marginTop: '-1rem' }}>
          {isObsolete && "Data is obsolete. "}
          Updated {moment(lastSubgraphBlock.timestamp * 1000).fromNow()}
          &nbsp;at block <a target="_blank" href={`https://arbiscan.io/block/${lastSubgraphBlock.number}`}>{lastSubgraphBlock.number}</a>
        </p>
      }
      {showForm &&
        <div className="form">
          <p>
            <label>Period</label>
            <input type="date" value={fromValue} onChange={evt => setFromValue(evt.target.value)} />
            &nbsp;—&nbsp;
            <input type="date" value={toValue} onChange={evt => setToValue(evt.target.value)} />
            <button onClick={evt => setDateRange(86400 * 29)}>30 days</button>
            <button onClick={evt => setDateRange(86400 * 6)}>7 days</button>
          </p>
        </div>
      }
      <div className="chart-grid">
        <div className="chart-cell stats">
          {totalVolume ? <>
            <div className="total-stat-label">Total Volume</div>
            <div className="total-stat-value">
              {formatNumber(totalVolume, {currency: true})}
              {totalVolumeDelta &&
                <span className="total-stat-delta" title="Change since previous day">+{formatNumber(totalVolumeDelta, {currency: true, compact: true})}</span>
              }
            </div>
          </> : <RiLoader5Fill size="3em" className="loader" />}
        </div>
        <div className="chart-cell stats">
          {totalFees ? <>
            <div className="total-stat-label">Total Fees</div>
            <div className="total-stat-value">
              {formatNumber(totalFees, {currency: true})}
              <span className="total-stat-delta" title="Change since previous day">+{formatNumber(totalFeesDelta, {currency: true, compact: true})}</span>
            </div>
          </> : <RiLoader5Fill size="3em" className="loader" />}
        </div>
        <div className="chart-cell stats">
        </div>
        <div className="chart-cell stats">
        </div>
        <div className="chart-cell stats">
        </div>
        <div className="chart-cell">
          <VolumeChart
            data={volumeData}
            loading={volumeLoading}
            chartHeight={CHART_HEIGHT}
            yaxisWidth={YAXIS_WIDTH}
            xaxisTickFormatter={tooltipLabelFormatter}
            yaxisTickFormatter={yaxisFormatter}
            tooltipLabelFormatter={tooltipLabelFormatter}
            tooltipFormatter={tooltipFormatter}
          />
        </div>
        <div className="chart-cell">
          <FeesChart
            data={feesData}
            loading={feesLoading}
            chartHeight={CHART_HEIGHT}
            yaxisWidth={YAXIS_WIDTH}
            xaxisTickFormatter={tooltipLabelFormatter}
            yaxisTickFormatter={yaxisFormatter}
            tooltipLabelFormatter={tooltipLabelFormatter}
            tooltipFormatter={tooltipFormatter}
          />
        </div>
      </div>
    </div>
  );
}

export default Arbitrum;
