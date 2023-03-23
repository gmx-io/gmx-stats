import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  CHART_HEIGHT,
  YAXIS_WIDTH,
  COLORS,
  GREEN,
  RED,
  convertToPercents
} from '../helpers'

import {
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Cell
} from 'recharts';

import ChartWrapper from '../components/ChartWrapper'
import VolumeChart from '../components/VolumeChart'
import FeesChart from '../components/FeesChart'
import GenericChart from '../components/GenericChart'
import DateRangeSelect from '../components/DateRangeSelect'

import {
  useVolumeData,
  useFeesData,
  useGlpData,
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

function Avalanche(props) {
  const DEFAULT_GROUP_PERIOD = 86400
  const [groupPeriod] = useState(DEFAULT_GROUP_PERIOD)
  const [dataRange, setDataRange] = useState({ fromValue: moment().subtract(3, 'month').toDate(), toValue: null })

  const { mode } = props

  const from = dataRange.fromValue ? Math.floor(+new Date(dataRange.fromValue) / 1000) : undefined
  const to = dataRange.toValue ? Math.floor(+new Date(dataRange.toValue) / 1000) : NOW

  const params = { from, to, groupPeriod, chainName: 'avalanche' }

  const [fundingRateData, fundingRateLoading] = useFundingRateData(params)

  const [volumeData, volumeLoading] = useVolumeData(params)
  const [totalVolumeData, totalVolumeLoading] = useVolumeData({ chainName: 'avalanche' })
  // const [volumeData, volumeLoading] = useVolumeDataFromServer(params)
  // const [totalVolume] = useTotalVolumeFromServer()
  const [totalVolume, totalVolumeDelta] = useMemo(() => {
    if (!totalVolumeData) {
      return []
    }
    const total = totalVolumeData[totalVolumeData.length - 1]?.cumulative
    const delta = total - totalVolumeData[totalVolumeData.length - 2]?.cumulative
    return [total, delta]
  }, [totalVolumeData])

  const [feesData, feesLoading] = useFeesData(params)
  const [totalFeesData, totalFeesLoading] = useFeesData({ chainName: 'avalanche' })
  const [totalFees, totalFeesDelta] = useMemo(() => {
    if (!totalFeesData) {
      return []
    }
    const total = totalFeesData[totalFeesData.length - 1]?.cumulative
    const delta = total - totalFeesData[totalFeesData.length - 2]?.cumulative
    return [total, delta]
  }, [totalFeesData])

  const [glpData, glpLoading] = useGlpData(params)
  const [totalGlpData, totalGlpLoading] = useGlpData({ chainName: 'avalanche' })
  const [totalAum, totalAumDelta] = useMemo(() => {
    if (!totalGlpData) {
      return []
    }
    const total = totalGlpData[totalGlpData.length - 1]?.aum
    const delta = total - totalGlpData[totalGlpData.length - 2]?.aum
    return [total, delta]
  }, [totalGlpData])

  // const [aumPerformanceData, aumPerformanceLoading] = useAumPerformanceData(params)
  const [glpPerformanceData, glpPerformanceLoading] = useGlpPerformanceData(glpData, feesData, params)

  const [minCollectedFees, maxCollectedFees] = useChartDomain(glpPerformanceData, ["performanceLpBtcCollectedFees", "performanceLpEthCollectedFees", "performanceLpAvaxCollectedFees", "performanceSyntheticCollectedFees"], [80, 180])
  const [minGlpPrice, maxGlpPrice] = useChartDomain(glpPerformanceData, ["syntheticPrice", "glpPrice", "glpPlusFees", "lpBtcPrice", "lpEthPrice", "lpAvaxPrice"], [0.4, 1.7])

  const [tradersData, tradersLoading] = useTradersData(params)
  const [totalTradersData, totalTradersLoading] = useTradersData({ chainName: 'avalanche' })
  const [openInterest, openInterestDelta] = useMemo(() => {
    if (!totalTradersData) {
      return []
    }
    const total = totalTradersData.data[totalTradersData.data.length - 1]?.openInterest
    const delta = total - totalTradersData.data[totalTradersData.data.length - 2]?.openInterest
    return [total, delta]
  }, [totalTradersData])

  const [usersData, usersLoading] = useUsersData(params)
  const [totalUsersData, totalUsersLoading] = useUsersData({ chainName: 'avalanche' })
  const [totalUsers, totalUsersDelta] = useMemo(() => {
    if (!totalUsersData) {
      return [null, null]
    }
    const total = totalUsersData[totalUsersData.length - 1]?.uniqueCountCumulative
    const prevTotal = totalUsersData[totalUsersData.length - 2]?.uniqueCountCumulative
    const delta = total && prevTotal ? total - prevTotal : null
    return [
      total,
      delta
    ]
  }, [totalUsersData])

  const [swapSources, swapSourcesLoading] = useSwapSources(params)
  const swapSourcesKeys = Object.keys((swapSources || []).reduce((memo, el) => {
    Object.keys(el).forEach(key => {
      if (key === 'all' || key === 'timestamp') return
      memo[key] = true
    })
    return memo
  }, {}))

  const [lastSubgraphBlock, , lastSubgraphBlockError] = useLastSubgraphBlock(params.chainName)
  const [lastBlock] = useLastBlock(params.chainName)

  const isObsolete = lastSubgraphBlock && lastBlock && lastBlock.timestamp - lastSubgraphBlock.timestamp > 3600

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
    isDefault: true,
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
          <h1>Analytics / Avalanche</h1>
          {lastSubgraphBlock && lastBlock &&
            <p className={cx('page-description', { warning: isObsolete })}>
              {isObsolete && "Data is obsolete. "}
              Updated {moment(lastSubgraphBlock.timestamp * 1000).fromNow()}
              &nbsp;at block <a rel="noreferrer" target="_blank" href={`https://snowtrace.io/block/${lastSubgraphBlock.number}`} rel="noreferrer">{lastSubgraphBlock.number}</a>
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
              {!!totalVolumeDelta &&
                <span className="total-stat-delta plus" title="Change since previous day">+{formatNumber(totalVolumeDelta, { currency: true, compact: true })}</span>
              }
            </div>
          </> : null}
          {totalVolumeLoading && <RiLoader5Fill size="3em" className="loader" />}
        </div>
        <div className="chart-cell stats">
          {totalFees ? <>
            <div className="total-stat-label">Total Fees</div>
            <div className="total-stat-value">
              {formatNumber(totalFees, { currency: true })}
              {!!totalFeesDelta &&
                <span className="total-stat-delta plus" title="Change since previous day">+{formatNumber(totalFeesDelta, { currency: true, compact: true })}</span>
              }
            </div>
          </> : null}
          {totalFeesLoading && <RiLoader5Fill size="3em" className="loader" />}
        </div>
        <div className="chart-cell stats">
          {totalAum ? <>
            <div className="total-stat-label">GLP Pool</div>
            <div className="total-stat-value">
              {formatNumber(totalAum, { currency: true })}
              {!!totalAumDelta &&
                <span className={cx("total-stat-delta", (totalAumDelta > 0 ? 'plus' : 'minus'))} title="Change since previous day">{totalAumDelta > 0 ? '+' : ''}{formatNumber(totalAumDelta, { currency: true, compact: true })}</span>
              }
            </div>
          </> : null}
          {totalGlpLoading && <RiLoader5Fill size="3em" className="loader" />}
        </div>
        <div className="chart-cell stats">
          {totalUsers && <>
            <div className="total-stat-label">Total Users</div>
            <div className="total-stat-value">
              {formatNumber(totalUsers)}
              {!!totalUsersDelta &&
                <span className="total-stat-delta plus" title="Change since previous day">+{formatNumber(totalUsersDelta)}</span>
              }
            </div>
          </>}
          {totalUsersLoading && <RiLoader5Fill size="3em" className="loader" />}
        </div>
        <div className="chart-cell stats">
          {openInterest ? <>
            <div className="total-stat-label">Open Interest</div>
            <div className="total-stat-value">
              {formatNumber(openInterest, { currency: true })}
              {!!openInterestDelta &&
                <span className={cx("total-stat-delta", (openInterestDelta > 0 ? 'plus' : 'minus'))} title="Change since previous day">
                  {openInterestDelta > 0 ? '+' : ''}{formatNumber(openInterestDelta, { currency: true, compact: true })}
                </span>
              }
            </div>
          </> : null}
          {totalTradersLoading && <RiLoader5Fill size="3em" className="loader" />}
        </div>
        <div className="chart-cell">
          <VolumeChart
            data={volumeData}
            loading={volumeLoading}
            chartHeight={CHART_HEIGHT}
            yaxisWidth={YAXIS_WIDTH}
          />
        </div>
        <div className="chart-cell">
          <FeesChart
            data={feesData}
            loading={feesLoading}
            chartHeight={CHART_HEIGHT}
            yaxisWidth={YAXIS_WIDTH}
            xaxisTickFormatter={tooltipLabelFormatter}
            tooltipLabelFormatter={tooltipLabelFormatter}
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
            chainName={params.chainName}
            syncId="syncGlp"
          />
        </div>
        <div className="chart-cell">
          <ChartWrapper
            title="Glp Performance"
            loading={glpLoading}
            data={glpPerformanceData}
            csvFields={[{key: 'syntheticPrice'}, {key: 'glpPrice'}, {key: 'glpPlusFees'}, {key: 'lpBtcPrice'}, {key: 'lpEthPrice'}]}
          >
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={glpPerformanceData} syncId="syncGlp">
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="performanceLpAvaxCollectedFees" domain={[minCollectedFees, maxCollectedFees]} unit="%" tickFormatter={yaxisFormatterNumber} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatterNumber}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Line dot={false} isAnimationActive={false} type="monotone" unit="%" dataKey="performanceLpBtcCollectedFees" name="% LP BTC-USDC" stroke={COLORS[2]} />
                <Line dot={false} isAnimationActive={false} type="monotone" unit="%" dataKey="performanceLpEthCollectedFees" name="% LP ETH-USDC" stroke={COLORS[4]} />
                <Line dot={false} isAnimationActive={false} type="monotone" unit="%" dataKey="performanceLpAvaxCollectedFees" name="% LP AVAX-USDC" stroke={COLORS[3]} />
                <Line dot={false} isAnimationActive={false} type="monotone" unit="%" dataKey="performanceSyntheticCollectedFees" name="% Index" stroke={COLORS[0]} />
              </LineChart>
            </ResponsiveContainer>
            <div className="chart-description">
              <p>
                <span style={{color: COLORS[0]}}>% of Index</span> is Glp with fees / Index Price * 100. Index is a basket 16.6% AVAX, 16.6% BTC, 16.6% ETH and 50% USDC rebalanced once&nbsp;a&nbsp;day
                  <br/>
                <span style={{color: COLORS[4]}}>% of LP TOKEN-USDC</span> is Glp Price with fees / LP TOKEN-USDC * 100<br/>
              </p>
            </div>
          </ChartWrapper>
        </div>
        <div className="chart-cell">
          <ChartWrapper
            title="Glp Price Comparison"
            loading={glpLoading}
            data={glpPerformanceData}
            csvFields={[{ key: 'syntheticPrice' }, { key: 'glpPrice' }, { key: 'glpPlusFees' }, { key: 'lpBtcPrice' }, { key: 'lpEthPrice' }]}
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
                <Line isAnimationActive={false} type="monotone" unit="$" strokeWidth={1} dot={false} dataKey="lpAvaxPrice" name="LP AVAX-USDC" stroke={COLORS[5]} />
              </LineChart>
            </ResponsiveContainer>
            <div className="chart-description">
              <p>
                <span style={{color: COLORS[3]}}>Glp with fees</span> is based on GLP share of fees received and excluding esGMX rewards<br/>
                <span style={{color: COLORS[2]}}>Index Price</span> is a basket 16.6% AVAX, 16.6% BTC, 16.6% ETH and 50% USDC rebalanced once&nbsp;a&nbsp;day
              </p>
            </div>
          </ChartWrapper>
        </div>
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
              items={[{ key: 'shortOpenInterest', name: 'Short', color: RED }, { key: 'longOpenInterest', name: 'Long', color: GREEN }]}
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
              items={[{ key: 'WETH.e' }, { key: 'WBTC.e' }, { key: 'AVAX' }, { key: 'MIM' }, { key: 'USDC' }, { key: 'USDC.e' }]}
              type="Line"
              yaxisDomain={[0, 90 /* ~87% is a maximum yearly borrow rate */]}
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
                { key: 'uniqueSwapCount', name: 'Swaps'},
                { key: 'uniqueMarginCount', name: 'Margin trading'},
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

export default Avalanche;
