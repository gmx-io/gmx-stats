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

function dateToValue(date) {
  return date.toISOString().slice(0, 10)
}

function Arbitrum() {
  const [fromValue, setFromValue] = useState("2022-01-06")
  const [toValue, setToValue] = useState()

  const setDateRange = useCallback(range => {
    setFromValue(dateToValue(new Date(Date.now() - range * 1000)))
    setToValue(undefined)
  }, [setFromValue, setToValue])

  const from = fromValue ? +new Date(fromValue) / 1000 : undefined
  const to = toValue ? +new Date(toValue) / 1000 : NOW

  const params = { from, to, chainName: 'avalanche' }

  // const [fundingRateData, fundingRateLoading] = useFundingRateData(params)
  const [volumeData, volumeLoading] = useVolumeData(params)
  // const [totalVolume] = useTotalVolumeFromServer()
  const [totalVolume, totalVolumeDelta] = useMemo(() => {
    if (!volumeData) {
      return []
    }
    const total = volumeData[volumeData.length - 1]?.cumulative
    const delta = total - volumeData[volumeData.length - 2]?.cumulative
    return [total, delta || 0]
  }, [volumeData])

  const [feesData, feesLoading] = useFeesData(params)
  const [totalFees, totalFeesDelta] = useMemo(() => {
    if (!feesData) {
      return []
    }
    const total = feesData[feesData.length - 1]?.cumulative
    const delta = total - feesData[feesData.length - 2]?.cumulative
    return [total, delta || 0]
  }, [feesData])

  const [glpData, glpLoading] = useGlpData(params)
  const [totalAum, totalAumDelta] = useMemo(() => {
    if (!glpData) {
      return []
    }
    const total = glpData[glpData.length - 1]?.aum
    const delta = total - glpData[glpData.length - 2]?.aum
    return [total, delta || 0]
  }, [glpData])

  // const [aumPerformanceData, aumPerformanceLoading] = useAumPerformanceData(params)
  const [glpPerformanceData, glpPerformanceLoading] = useGlpPerformanceData(glpData, feesData, params)

  const [tradersData, tradersLoading] = useTradersData(params)
  const [openInterest, openInterestDelta] = useMemo(() => {
    if (!tradersData) {
      return []
    }
    const total = tradersData.data[tradersData.data.length - 1]?.openInterest
    const delta = total - tradersData.data[tradersData.data.length - 2]?.openInterest
    return [total, delta || 0]
  }, [tradersData])

  const [usersData, usersLoading] = useUsersData(params)
  const [totalUsers, totalUsersDelta] = useMemo(() => {
    if (!usersData) {
      return [null, null]
    }
    const total = usersData[usersData.length - 1]?.uniqueCountCumulative
    const prevTotal = usersData[usersData.length - 2]?.uniqueCountCumulative
    const delta = total && prevTotal ? total - prevTotal : null
    return [
      total,
      delta
    ]
  }, [usersData])

  // const [swapSources, swapSourcesLoading] = useSwapSources(params)
  // const swapSourcesKeys = Object.keys((swapSources || []).reduce((memo, el) => {
  //   Object.keys(el).forEach(key => {
  //     if (key === 'all' || key === 'timestamp') return
  //     memo[key] = true
  //   })
  //   return memo
  // }, {}))

  const [lastSubgraphBlock] = useLastSubgraphBlock(params.chainName)
  const [lastBlock] = useLastBlock(params.chainName)

  const isObsolete = lastSubgraphBlock && lastBlock && lastBlock.timestamp - lastSubgraphBlock.timestamp > 3600

  return (
    <div className="Home">
      <h1>GMX Analytics / Avalanche</h1>
      {lastSubgraphBlock && lastBlock &&
        <p className={isObsolete ? 'warning' : ''} style={{ marginTop: '-1rem' }}>
          {isObsolete && "Data is obsolete. "}
          Updated {moment(lastSubgraphBlock.timestamp * 1000).fromNow()}
          &nbsp;at block <a target="_blank" href={`https://arbiscan.io/block/${lastSubgraphBlock.number}`}>{lastSubgraphBlock.number}</a>
        </p>
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
          </> : null}
          {volumeLoading && <RiLoader5Fill size="3em" className="loader" />}
        </div>
        <div className="chart-cell stats">
          {totalFees ? <>
            <div className="total-stat-label">Total Fees</div>
            <div className="total-stat-value">
              {formatNumber(totalFees, {currency: true})}
              {totalFeesDelta &&
                <span className="total-stat-delta" title="Change since previous day">+{formatNumber(totalFeesDelta, {currency: true, compact: true})}</span>
              }
            </div>
          </> : null}
          {feesLoading && <RiLoader5Fill size="3em" className="loader" />}
        </div>
        <div className="chart-cell stats">
          {totalAum ? <>
            <div className="total-stat-label">GLP Pool</div>
            <div className="total-stat-value">
              {formatNumber(totalAum, {currency: true})}
              {totalFeesDelta &&
                <span className="total-stat-delta" title="Change since previous day">{totalAumDelta > 0 ? '+' : ''}{formatNumber(totalAumDelta, {currency: true, compact: true})}</span>
              }
            </div>
          </> : null}
          {glpLoading && <RiLoader5Fill size="3em" className="loader" />}
        </div>
        <div className="chart-cell stats">
          {totalUsers && <>
            <div className="total-stat-label">Total Users</div>
            <div className="total-stat-value">
              {formatNumber(totalUsers)}
              {totalVolumeDelta &&
                <span className="total-stat-delta" title="Change since previous day">+{formatNumber(totalUsersDelta)}</span>
              }
            </div>
          </>}
          {usersLoading && <RiLoader5Fill size="3em" className="loader" />}
        </div>
        <div className="chart-cell stats">
          {openInterest ? <>
            <div className="total-stat-label">Open Interest</div>
            <div className="total-stat-value">
              {formatNumber(openInterest, {currency: true})}
              {openInterestDelta &&
                <span className="total-stat-delta" title="Change since previous day">
                  {openInterestDelta > 0 ? '+' : ''}{formatNumber(openInterestDelta, {currency: true, compact: true})}
                </span>
              }
            </div>
          </> : null}
          {tradersLoading && <RiLoader5Fill size="3em" className="loader" />}
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
        <div className="chart-cell">
          <ChartWrapper title="AUM & Glp Supply" loading={glpLoading} data={glpData} csvFields={[{key: 'aum'}, {key: 'glpSupply'}]}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={glpData} syncId="syncGlp">
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="aum" tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatterNumber}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Line isAnimationActive={false} type="monotone" strokeWidth={2} unit="$" dot={false} dataKey="aum" stackId="a" name="AUM" stroke={COLORS[0]} />
                <Line isAnimationActive={false} type="monotone" strokeWidth={2} dot={false} dataKey="glpSupply" stackId="a" name="Glp Supply" stroke={COLORS[1]} />
              </LineChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </div>
        <div className="chart-cell">
          <ChartWrapper
            title="Glp Price"
            loading={glpLoading}
            data={glpPerformanceData}
            csvFields={[{key: 'syntheticPrice'}, {key: 'glpPrice'}, {key: 'glpPlusFees'}, {key: 'lpBtcPrice'}, {key: 'lpEthPrice'}]}
          >
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={glpPerformanceData} syncId="syncGlp">
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="glpPrice" domain={[0.4, 1.7]} tickFormatter={yaxisFormatterNumber} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatterNumber}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Line isAnimationActive={false} type="monotone" unit="$" strokeWidth={1} dot={false} dataKey="glpPrice" name="Glp Price" stroke={COLORS[1]} strokeWidth={1} />
                <Line isAnimationActive={false} type="monotone" unit="$" strokeWidth={1} dot={false} dataKey="glpPlusFees" name="Glp w/ fees" stroke={COLORS[3]} strokeWidth={1} />
              </LineChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </div>
        <div className="chart-cell">
           <GenericChart
              loading={tradersLoading}
              title="Open Interest"
              data={tradersData?.data.map(item => ({ all: item.openInterest, ...item }))}
              yaxisDataKey="openInterest"
              items={[{ key: 'shortOpenInterest', name: 'Short', color: RED }, { key: 'longOpenInterest', name: 'Long', color: GREEN }]}
              type="Bar"
            />
        </div>
        <div className="chart-cell">
           <GenericChart
              syncId="syncGlp"
              loading={usersLoading}
              title="Unique Users"
              data={usersData}
              yaxisDataKey="uniqueSum"
              yaxisTickFormatter={yaxisFormatterNumber}
              tooltipFormatter={tooltipFormatterNumber}
              tooltipLabelFormatter={tooltipLabelFormatterUnits}
              items={[
                { key: 'uniqueSwapCount', name: 'Swaps' },
                { key: 'uniqueMarginCount', name: 'Margin trading' },
                { key: 'uniqueMintBurnCount', name: 'Mint & Burn GLP' }
              ]}
              type="Composed"
            />
        </div>
        <div className="chart-cell">
           <GenericChart
              syncId="syncGlp"
              loading={usersLoading}
              title="New Users"
              data={usersData?.map(item => ({ ...item, all: item.newCount }))}
              yaxisDataKey="newCount"
              rightYaxisDataKey="uniqueCountCumulative"
              yaxisTickFormatter={yaxisFormatterNumber}
              tooltipFormatter={tooltipFormatterNumber}
              tooltipLabelFormatter={tooltipLabelFormatterUnits}
              items={[
                { key: 'newSwapCount', name: 'Swap' },
                { key: 'newMarginCount', name: 'Margin trading' },
                { key: 'newMintBurnCount', name: 'Mint & Burn' },
                { key: 'uniqueCountCumulative', name: 'Cumulative', type: 'Line', yAxisId: 'right', strokeWidth: 2, color: COLORS[4] }
              ]}
              type="Composed"
            />
        </div>
      </div>
    </div>
  );
}

export default Arbitrum;
