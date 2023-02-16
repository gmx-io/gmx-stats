import React, { useEffect, useState, useMemo } from 'react';
import * as ethers from 'ethers'
import moment from 'moment'
import { RiLoader5Fill } from 'react-icons/ri'
import cx from "classnames";

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
  RED,
  convertToPercents
} from '../helpers'

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

import ChartWrapper from '../components/ChartWrapper'
import VolumeChart from '../components/VolumeChart'
import FeesChart from '../components/FeesChart'
import GenericChart from '../components/GenericChart'
import DateRangeSelect from '../components/DateRangeSelect'

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
} from '../dataProvider'
import PoolAmountChart from '../components/PoolAmountChart';
import TradersProfitLossChart from '../components/TradersProfitLossChart';
import useChartDomain from '../hooks/useChartDomain';

const NOW = Math.floor(Date.now() / 1000)

function Arbitrum(props) {
  const DEFAULT_GROUP_PERIOD = 86400
  const [groupPeriod] = useState(DEFAULT_GROUP_PERIOD)

  const [dataRange, setDataRange] = useState({ fromValue: moment().subtract(2, 'month').toDate(), toValue: null })

  const { mode } = props

  const from = dataRange.fromValue ? Math.floor(+new Date(dataRange.fromValue) / 1000) : undefined
  const to = dataRange.toValue ? Math.floor(+new Date(dataRange.toValue) / 1000) : NOW

  const params = { from, to, groupPeriod }

  const [fundingRateData, fundingRateLoading] = useFundingRateData(params)

  const [volumeData, volumeLoading] = useVolumeDataFromServer(params)
  const [totalVolume] = useTotalVolumeFromServer()
  const totalVolumeDelta = useMemo(() => {
    if (!volumeData || !volumeData.length) {
      return null
    }
    return volumeData[volumeData.length - 1].all
  }, [volumeData])

  const [feesData, feesLoading] = useFeesData(params)
  const [totalFeesData, totalFeesLoading] = useFeesData({})
  const [totalFees, totalFeesDelta] = useMemo(() => {
    if (!totalFeesData) {
      return []
    }
    const total = totalFeesData[totalFeesData.length - 1]?.cumulative
    const delta = total - totalFeesData[totalFeesData.length - 2]?.cumulative
    return [total, delta]
  }, [totalFeesData])

  const [glpData, glpLoading] = useGlpData(params)
  const [totalAum, totalAumDelta] = useMemo(() => {
    if (!glpData) {
      return []
    }
    const total = glpData[glpData.length - 1]?.aum
    const delta = total - glpData[glpData.length - 2]?.aum
    return [total, delta]
  }, [glpData])

  const [aumPerformanceData, aumPerformanceLoading] = useAumPerformanceData(params)
  const [glpPerformanceData, glpPerformanceLoading] = useGlpPerformanceData(glpData, feesData, params)

  const [minCollectedFees = 80, maxCollectedFees = 180] = useChartDomain(glpPerformanceData, ["performanceLpBtcCollectedFees", "performanceLpEthCollectedFees", "performanceSyntheticCollectedFees"])
  const [minGlpPrice = 0.4, maxGlpPrice = 1.7] = useChartDomain(glpPerformanceData, ["syntheticPrice", "glpPrice", "glpPlusFees", "lpBtcPrice", "lpEthPrice"])

  console.log({minCollectedFees, maxCollectedFees, minGlpPrice, maxGlpPrice})
  const [tradersData, tradersLoading] = useTradersData(params)
  const [openInterest, openInterestDelta] = useMemo(() => {
    if (!tradersData) {
      return []
    }
    const total = tradersData.data[tradersData.data.length - 1]?.openInterest
    const delta = total - tradersData.data[tradersData.data.length - 2]?.openInterest
    return [total, delta]
  }, [tradersData])
  const [swapSources, swapSourcesLoading] = useSwapSources(params)
  const swapSourcesKeys = Object.keys((swapSources || []).reduce((memo, el) => {
    Object.keys(el).forEach(key => {
      if (key === 'all' || key === 'timestamp') return
      memo[key] = true
    })
    return memo
  }, {}))

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

  const [lastSubgraphBlock, , lastSubgraphBlockError] = useLastSubgraphBlock()
  const [lastBlock] = useLastBlock()

  const isObsolete = lastSubgraphBlock && lastBlock && lastBlock.timestamp - lastSubgraphBlock.timestamp > 3600

  const [isExperiment, setIsExperiment] = useState(false)
  useEffect(() => {
    setIsExperiment(window.localStorage.getItem('experiment'))
  }, [setIsExperiment])

  const onDateRangeChange = (dates) => {
    const [start, end] = dates;
    setDataRange({ fromValue: start, toValue: end })
  };

  const dateRangeOptions = [{
    label: "Last Month",
    id: 1
  }, {
    label: "Last 2 Months",
    id: 2,
    isDefault: true
  }, {
    label: "Last 3 Months",
    id: 3,
  }, {
    label: "All time",
    id: 4
  }]

  return (
    <div className="Home">
      <div className="page-title-section">
        <div className="page-title-block">
          <h1>Analytics / Arbitrum</h1>
          {lastSubgraphBlock && lastBlock &&
            <p className={cx('page-description', { warning: isObsolete })}>
              {isObsolete && "Data is obsolete. "}
              Updated {moment(lastSubgraphBlock.timestamp * 1000).fromNow()}
              &nbsp;at block <a rel="noreferrer" target="_blank" href={`https://arbiscan.io/block/${lastSubgraphBlock.number}`}>{lastSubgraphBlock.number}</a>
            </p>
          }
          {
            lastSubgraphBlockError &&
            <p className="page-description warning">
              Subgraph data is temporarily unavailable.
            </p>
          }
        </div>
        <div className="form">
          <DateRangeSelect options={dateRangeOptions} startDate={dataRange.fromValue} endDate={dataRange.toValue} onChange={onDateRangeChange} />
        </div>
      </div>
      <div className="chart-grid">
        <div className="chart-cell stats">
          {totalVolume ? <>
            <div className="total-stat-label">Total Volume</div>
            <div className="total-stat-value">
              {formatNumber(totalVolume, { currency: true })}
              {totalVolumeDelta &&
                <span className="total-stat-delta plus" title="Change since previous day">+{formatNumber(totalVolumeDelta, { currency: true, compact: true })}</span>
              }
            </div>
          </> : <RiLoader5Fill size="3em" className="loader" />}
        </div>
        <div className="chart-cell stats">
          {totalFees ? <>
            <div className="total-stat-label">Total Fees</div>
            <div className="total-stat-value">
              {formatNumber(totalFees, { currency: true })}
              <span className="total-stat-delta plus" title="Change since previous day">+{formatNumber(totalFeesDelta, { currency: true, compact: true })}</span>
            </div>
          </> : (feesLoading ? <RiLoader5Fill size="3em" className="loader" /> : null)}
        </div>
        <div className="chart-cell stats">
          {totalAum ? <>
            <div className="total-stat-label">GLP Pool</div>
            <div className="total-stat-value">
              {formatNumber(totalAum, { currency: true })}
              <span className={cx("total-stat-delta", (totalAumDelta > 0 ? 'plus' : 'minus'))} title="Change since previous day">{totalAumDelta > 0 ? '+' : ''}{formatNumber(totalAumDelta, { currency: true, compact: true })}</span>
            </div>
          </> : (glpLoading ? <RiLoader5Fill size="3em" className="loader" /> : null)}
        </div>
        <div className="chart-cell stats">
          {totalUsers ? <>
            <div className="total-stat-label">Total Users</div>
            <div className="total-stat-value">
              {formatNumber(totalUsers)}
              <span className="total-stat-delta plus" title="Change since previous day">+{formatNumber(totalUsersDelta)}</span>
            </div>
          </> : (usersLoading ? <RiLoader5Fill size="3em" className="loader" /> : null)}
        </div>
        <div className="chart-cell stats">
          {openInterest ? <>
            <div className="total-stat-label">Open Interest</div>
            <div className="total-stat-value">
              {formatNumber(openInterest, { currency: true })}
              <span className={cx("total-stat-delta", (openInterestDelta > 0 ? 'plus' : 'minus'))} title="Change since previous day">
                {openInterestDelta > 0 ? '+' : ''}{formatNumber(openInterestDelta, { currency: true, compact: true })}
              </span>
            </div>
          </> : (tradersLoading ? <RiLoader5Fill size="3em" className="loader" /> : null)}
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
          />
        </div>
        <div className="chart-cell">
          <ChartWrapper title="AUM & Glp Supply" loading={glpLoading} data={glpData} csvFields={[{ key: 'aum' }, { key: 'glpSupply' }]}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={glpData} syncId="syncGlp">
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="glpSupply" tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
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
          <PoolAmountChart 
            from={from}
            to={to}
            syncId="syncGlp"
          />
        </div>
        <div className="chart-cell">
          <ChartWrapper
            title="Glp Performance"
            loading={glpLoading}
            data={glpPerformanceData}
            csvFields={[
              {key: 'syntheticPrice'},
              {key: 'glpPrice'},
              {key: 'glpPlusFees'},
              {key: 'lpBtcPrice'},
              {key: 'lpEthPrice'},
              {key: 'performanceSyntheticCollectedFees'},
              {key: 'indexBtcCount'},
              {key: 'indexEthCount'},
              {key: 'indexAvaxCount'},
              {key: 'indexStableCount'},
              {key: 'BTC_WEIGHT'},
              {key: 'ETH_WEIGHT'},
              {key: 'AVAX_WEIGHT'},
              {key: 'STABLE_WEIGHT'},
            ]}
          >
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={glpPerformanceData} syncId="syncGlp">
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="performanceSyntheticCollectedFees" domain={[minCollectedFees, maxCollectedFees]} unit="%" tickFormatter={yaxisFormatterNumber} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatterNumber}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Line dot={false} isAnimationActive={false} type="monotone" unit="%" dataKey="performanceLpBtcCollectedFees" name="% LP BTC-USDC (w/ fees)" stroke={COLORS[2]} />
                <Line dot={false} isAnimationActive={false} type="monotone" unit="%" dataKey="performanceLpEthCollectedFees" name="% LP ETH-USDC (w/ fees)" stroke={COLORS[4]} />
                <Line dot={false} isAnimationActive={false} type="monotone" unit="%" dataKey="performanceSyntheticCollectedFees" name="% Index (w/ fees)" stroke={COLORS[0]} />
              </LineChart>
            </ResponsiveContainer>
            <div className="chart-description">
              <p>
                <span style={{color: COLORS[0]}}>% of Index (with fees)</span> is Glp with fees / Index Price * 100. Index is a basket of 25% BTC, 25% ETH, 50% USDC rebalanced once&nbsp;a&nbsp;day
                <br/>
                <span style={{color: COLORS[4]}}>% of LP ETH-USDC (with fees)</span> is Glp Price with fees / LP ETH-USDC * 100<br/>
              </p>
            </div>
          </ChartWrapper>
        </div>
        <div className="chart-cell">
          <ChartWrapper
            title="Glp Price Comparison"
            loading={glpLoading}
            data={glpPerformanceData}
            csvFields={[
              {key: 'syntheticPrice'},
              {key: 'glpPrice'},
              {key: 'glpPlusFees'},
              {key: 'lpBtcPrice'},
              {key: 'lpEthPrice'},
              {key: 'performanceSyntheticCollectedFees'},
              {key: 'indexBtcCount'},
              {key: 'indexEthCount'},
              {key: 'indexAvaxCount'},
              {key: 'indexStableCount'},
              {key: 'BTC_WEIGHT'},
              {key: 'ETH_WEIGHT'},
              {key: 'AVAX_WEIGHT'},
              {key: 'STABLE_WEIGHT'},
            ]}
          >
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={glpPerformanceData} syncId="syncGlp">
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="glpPrice" domain={[minGlpPrice, maxGlpPrice]} tickFormatter={yaxisFormatterNumber} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatterNumber}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Line isAnimationActive={false} type="monotone" unit="$" strokeWidth={1} dot={false} dataKey="syntheticPrice" name="Index Price" stroke={COLORS[2]} />
                <Line isAnimationActive={false} type="monotone" unit="$" strokeWidth={1} dot={false} dataKey="glpPrice" name="Glp Price" stroke={COLORS[1]} />
                <Line isAnimationActive={false} type="monotone" unit="$" strokeWidth={2} dot={false} dataKey="glpPlusFees" name="Glp w/ fees" stroke={COLORS[3]} />
                <Line isAnimationActive={false} type="monotone" unit="$" strokeWidth={1} dot={false} dataKey="lpBtcPrice" name="LP BTC-USDC" stroke={COLORS[2]} />
                <Line isAnimationActive={false} type="monotone" unit="$" strokeWidth={1} dot={false} dataKey="lpEthPrice" name="LP ETH-USDC" stroke={COLORS[4]} />
              </LineChart>
            </ResponsiveContainer>
            <div className="chart-description">
              <p>
                <span style={{color: COLORS[3]}}>Glp with fees</span> is based on GLP share of fees received and excluding esGMX rewards<br/>
                <span style={{color: COLORS[2]}}>Index Price</span> is a basket of 25% BTC, 25% ETH, 50% USDC rebalanced once&nbsp;a&nbsp;day

              </p>
            </div>
          </ChartWrapper>
        </div>
        {isExperiment && <div className="chart-cell experiment">
          <ChartWrapper title="Performance vs. Index" loading={glpLoading}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={glpPerformanceData} syncId="syncGlp">
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="performanceSyntheticCollectedFees" domain={[80, 120]} unit="%" tickFormatter={yaxisFormatterNumber} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatterNumber}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Line isAnimationActive={false} dot={false} type="monotone" unit="%" strokeWidth={2} dataKey="performanceSyntheticCollectedFees" name="Collected Fees" stroke={COLORS[0]} />
                <Line isAnimationActive={false} dot={false} type="monotone" unit="%" strokeWidth={2} dataKey="performanceSyntheticDistributedUsd" name="Distributed Usd" stroke={COLORS[1]} />
                <Line isAnimationActive={false} dot={false} type="monotone" unit="%" strokeWidth={2} dataKey="performanceSyntheticDistributedEth" name="Distributed Eth" stroke={COLORS[2]} />
                <Line isAnimationActive={false} dot={false} type="monotone" unit="%" strokeWidth={2} dataKey="performanceSynthetic" name="No Fees" stroke={COLORS[3]} />
              </LineChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </div>}
        {isExperiment && <div className="chart-cell experiment">
          <ChartWrapper title="Performance vs. ETH LP" loading={glpLoading}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={glpPerformanceData} syncId="syncGlp">
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="performanceLpEthCollectedFees" domain={[80, 120]} unit="%" tickFormatter={yaxisFormatterNumber} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatterNumber}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Line isAnimationActive={false} dot={false} type="monotone" unit="%" strokeWidth={2} dataKey="performanceLpEthCollectedFees" name="Collected Fees" stroke={COLORS[0]} />
                <Line isAnimationActive={false} dot={false} type="monotone" unit="%" strokeWidth={2} dataKey="performanceLpEthDistributedUsd" name="Distributed Usd" stroke={COLORS[1]} />
                <Line isAnimationActive={false} dot={false} type="monotone" unit="%" strokeWidth={2} dataKey="performanceLpEthDistributedEth" name="Distributed Eth" stroke={COLORS[2]} />
                <Line isAnimationActive={false} dot={false} type="monotone" unit="%" strokeWidth={2} dataKey="performanceLpEth" name="No Fees" stroke={COLORS[3]} />
              </LineChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </div>}
        <div className="chart-cell">
          <ChartWrapper
            title="Traders Net PnL"
            loading={tradersLoading}
            data={tradersData?.data}
            csvFields={[{ key: 'pnl', name: 'Net PnL' }, { key: 'pnlCumulative', name: 'Cumulative PnL' }]}
          >
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <ComposedChart data={tradersData?.data} syncId="tradersId">
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis
                  domain={[-tradersData?.stats.maxAbsCumulativePnl * 1.05, tradersData?.stats.maxAbsCumulativePnl * 1.05]}
                  orientation="right"
                  yAxisId="right"
                  tickFormatter={yaxisFormatter}
                  width={YAXIS_WIDTH}
                  tick={{ fill: COLORS[4] }}
                />
                <YAxis domain={[-tradersData?.stats.maxAbsPnl * 1.05, tradersData?.stats.maxAbsPnl * 1.05]} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatter}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Bar type="monotone" fill={mode == "dark" ? "#FFFFFF" : "#000000"} dot={false} dataKey="pnl" name="Net PnL">
                  {(tradersData?.data || []).map((item, i) => {
                    return <Cell key={`cell-${i}`} fill={item.pnl > 0 ? '#22c761' : '#f93333'} />
                  })}
                </Bar>
                <Line
                  type="monotone"
                  strokeWidth={2}
                  stroke={COLORS[4]}
                  dataKey="currentPnlCumulative"
                  name="Cumulative PnL"
                  yAxisId="right"
                />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-description">
              <p>Considers settled (closed) positions</p>
              <p>Fees are not factored into PnL</p>
            </div>
          </ChartWrapper>
        </div>
        <div className="chart-cell">
          <TradersProfitLossChart 
            syncId="tradersId"
            loading={tradersLoading}
            tradersData={tradersData}
            yaxisWidth={YAXIS_WIDTH}
            chartHeight={CHART_HEIGHT}
          />
        </div>
        <div className="chart-cell">
           <GenericChart
              loading={tradersLoading}
              title="Open Interest"
              data={tradersData?.data.map(item => ({ all: item.openInterest, ...item }))}
              controls={{
                convertToPercents: convertToPercents
              }}
              yaxisDataKey="all"
              items={[{ key: 'shortOpenInterest', name: 'Short', color: "#f93333" }, { key: 'longOpenInterest', name: 'Long', color: '#22c761' }]}
              type="Bar"
            />
        </div>
        <div className="chart-cell">
           <GenericChart
              loading={fundingRateLoading}
              title="Borrowing Rate Annualized"
              data={fundingRateData}
              yaxisDataKey="ETH"
              yaxisTickFormatter={yaxisFormatterPercent}
              tooltipFormatter={tooltipFormatterPercent}
              items={[{ key: 'ETH' }, { key: 'BTC' }, { key: 'UNI' }, { key: 'LINK' }, { key: 'USDC' }, { key: 'USDT' }, { key: 'MIM' }, { key: 'FRAX', color: mode == "dark" ? "#FFF" : "#000" }, { key: 'DAI' }]}
              type="Line"
              yaxisDomain={[0, 90 /* ~87% is a maximum yearly borrow rate */]}
              isCoinChart={true}
            />
        </div>
        <div className="chart-cell">
           <GenericChart
              syncId="syncGlp"
              loading={aumPerformanceLoading}
              title="AUM Performance Annualized"
              data={aumPerformanceData}
              yaxisDataKey="apr"
              yaxisTickFormatter={yaxisFormatterPercent}
              tooltipFormatter={tooltipFormatterPercent}
              items={[{ key: 'apr', name: 'APR', color: COLORS[0] }]}
              description="Formula = Daily Fees / GLP Pool * 365 days * 100"
              type="Composed"
            />
        </div>
        <div className="chart-cell">
          <GenericChart
            syncId="syncGlp"
            loading={aumPerformanceLoading}
            title="AUM Daily Usage"
            data={aumPerformanceData}
            yaxisDataKey="usage"
            yaxisTickFormatter={yaxisFormatterPercent}
            tooltipFormatter={tooltipFormatterPercent}
            items={[{ key: 'usage', name: 'Daily Usage', color: COLORS[4] }]}
            description="Formula = Daily Volume / GLP Pool * 100"
            type="Composed"
          />
        </div>
        <div className="chart-cell">
          <GenericChart
            syncId="syncGlp"
            loading={usersLoading}
            title="Unique Users"
            data={usersData}
            truncateYThreshold={6500}
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
            truncateYThreshold={6000}
            yaxisDataKey="newCount"
            rightYaxisDataKey="uniqueCountCumulative"
            yaxisTickFormatter={yaxisFormatterNumber}
            tooltipFormatter={tooltipFormatterNumber}
            tooltipLabelFormatter={tooltipLabelFormatterUnits}
            items={[
              { key: 'newSwapCount', name: 'Swap' },
              { key: 'newMarginCount', name: 'Margin trading' },
              { key: 'newMintBurnCount', name: 'Mint & Burn' },
              { key: 'cumulativeNewUserCount', name: 'Cumulative', type: 'Line', yAxisId: 'right', strokeWidth: 2, color: COLORS[4] }
            ]}
            type="Composed"
          />
        </div>
        <div className="chart-cell">
           <GenericChart
              syncId="syncGlp"
              loading={usersLoading}
              title="New vs. Existing Users"
              data={usersData?.map(item => ({ ...item, all: item.uniqueCount }))}
              truncateYThreshold={7000}
              yaxisDataKey="uniqueCount"
              rightYaxisDataKey="oldPercent"
              yaxisTickFormatter={yaxisFormatterNumber}
              tooltipFormatter={tooltipFormatterNumber}
              tooltipLabelFormatter={tooltipLabelFormatterUnits}
              items={[
                { key: 'newCount', name: 'New'},
                { key: 'oldCount', name: 'Existing'},
                { key: 'oldPercent', name: 'Existing %', yAxisId: 'right', type: 'Line', strokeWidth: 2, color: COLORS[4], unit: '%' }
              ]}
              type="Composed"
            />
        </div>
        <div className="chart-cell">
          <GenericChart
            syncId="syncGlp"
            loading={usersLoading}
            title="User Actions"
            data={(usersData || []).map(item => ({ ...item, all: item.actionCount }))}
            truncateYThreshold={25000}
            yaxisDataKey="actionCount"
            yaxisTickFormatter={yaxisFormatterNumber}
            tooltipFormatter={tooltipFormatterNumber}
            tooltipLabelFormatter={tooltipLabelFormatterUnits}
            items={[{ key: 'actionSwapCount', name: 'Swaps' }, { key: 'actionMarginCount', name: 'Margin trading' }, { key: 'actionMintBurnCount', name: 'Mint & Burn GLP' }]}
            type="Composed"
          />
        </div>
        <div className="chart-cell">
          <GenericChart
            loading={swapSourcesLoading}
            title="Swap Sources"
            data={swapSources}
            items={swapSourcesKeys.map(key => ({ key }))}
          />
        </div>
      </div>
    </div>
  );
}

export default Arbitrum;
