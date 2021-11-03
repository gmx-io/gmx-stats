import React, { useEffect, useState, useCallback, useMemo } from 'react';
import * as ethers from 'ethers'
import moment from 'moment'

import {
  yaxisFormatterNumber,
  yaxisFormatterPercent,
  yaxisFormatter,
  tooltipLabelFormatter,
  tooltipLabelFormatterUnits,
  tooltipFormatter,
  tooltipFormatterNumber,
  tooltipFormatterPercent,
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

function Arbitrum() {
  const DEFAULT_GROUP_PERIOD = 86400
  const [groupPeriod, setGroupPeriod] = useState(DEFAULT_GROUP_PERIOD)

  const [fundingRateData, fundingRateLoading] = useFundingRateData()
  const [volumeData, volumeLoading] = useVolumeDataFromServer({ groupPeriod })
  const [feesData, feesLoading] = useFeesData({ groupPeriod })
  const [glpData, glpLoading] = useGlpData({ groupPeriod })
  const [aumPerformanceData, aumPerformanceLoading] = useAumPerformanceData({ groupPeriod })
  const [glpPerformanceData, glpPerformanceLoading] = useGlpPerformanceData(glpData, feesData, { groupPeriod })
  const [tradersData, tradersLoading] = useTradersData({ groupPeriod })
  const [swapSources, swapSourcesLoading] = useSwapSources({ groupPeriod })
  const swapSourcesKeys = Object.keys((swapSources || []).reduce((memo, el) => {
    Object.keys(el).forEach(key => {
      if (key === 'all' || key === 'timestamp') return
      memo[key] = true
    })
    return memo
  }, {}))

  const [usersData, usersLoading] = useUsersData({ groupPeriod })

  const [lastSubgraphBlock] = useLastSubgraphBlock()
  const [lastBlock] = useLastBlock()

  const isObsolete = lastSubgraphBlock && lastBlock && lastBlock.timestamp - lastSubgraphBlock.timestamp > 3600

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
      <div className="chart-grid">
        <div className="chart-cell half">
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
        <div className="chart-cell half">
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
        <div className="chart-cell half">
          <ChartWrapper title="AUM & Glp Supply" loading={glpLoading}>
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
                <Line type="monotone" strokeWidth={2} unit="$" dot={false} dataKey="aum" stackId="a" name="AUM" stroke={COLORS[0]} />
                <Line type="monotone" strokeWidth={2} dot={false} dataKey="glpSupply" stackId="a" name="Glp Supply" stroke={COLORS[1]} />
              </LineChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </div>
        <div className="chart-cell half">
           <GenericChart
              syncId="syncGlp"
              loading={aumPerformanceLoading}
              title="AUM Performance"
              data={aumPerformanceData}
              yaxisDataKey="apr"
              yaxisTickFormatter={yaxisFormatterPercent}
              tooltipFormatter={tooltipFormatterPercent}
              items={[{ key: 'apr', name: 'APR' }]}
              description="Formula = Daily Fees / AUM * 365 days * 100"
              type="Composed"
            />
        </div>
        <div className="chart-cell half">
           <GenericChart
              syncId="syncGlp"
              loading={aumPerformanceLoading}
              title="AUM Daily Usage"
              data={aumPerformanceData}
              yaxisDataKey="usage"
              yaxisTickFormatter={yaxisFormatterPercent}
              tooltipFormatter={tooltipFormatterPercent}
              items={[{ key: 'usage', name: 'Daily Usage', color: COLORS[4] }]}
              description="Formula = Daily Volume / AUM * 100"
              type="Composed"
            />
        </div>
        <div className="chart-cell half">
          <ChartWrapper title="Glp Price Comparison" loading={glpLoading}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={glpPerformanceData} syncId="syncGlp">
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="performanceSynthetic" domain={[60, 210]} unit="%" tickFormatter={yaxisFormatterNumber} width={YAXIS_WIDTH} />
                <YAxis dataKey="glpPrice" domain={[0.5, 1.5]} orientation="right" yAxisId="right" tickFormatter={yaxisFormatterNumber} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatterNumber}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Line type="monotone" unit="%" strokeWidth={2} dataKey="performanceSynthetic" name="% Index (w/ fees)" stroke={COLORS[0]} />
                <Line type="monotone" unit="%" strokeWidth={2} dataKey="performanceLpEth" name="% LP ETH-USDC (w/ fees)" stroke={COLORS[4]} />

                <Line type="monotone" unit="$" strokeWidth={1} yAxisId="right" dot={false} dataKey="syntheticPrice" name="Index Price" stroke={COLORS[2]} />
                <Line type="monotone" unit="$" strokeWidth={1} yAxisId="right" dot={false} dataKey="glpPrice" name="Glp Price" stroke={COLORS[1]} strokeWidth={1} />
                <Line type="monotone" unit="$" strokeWidth={1} yAxisId="right" dot={false} dataKey="glpPlusFees" name="Glp w/ fees" stroke={COLORS[3]} strokeWidth={1} />
                <Line type="monotone" unit="$" strokeWidth={1} yAxisId="right" dot={false} dataKey="lpBtcPrice" name="LP BTC-USDC" stroke={COLORS[2]} />
                <Line type="monotone" unit="$" strokeWidth={1} yAxisId="right" dot={false} dataKey="lpEthPrice" name="LP ETH-USDC" stroke={COLORS[4]} />
              </LineChart>
            </ResponsiveContainer>
            <div className="chart-description">
              <p>
                <span style={{color: COLORS[3]}}>Glp with fees</span> is based on 50% of fees received and excluding esGMX rewards<br/>
                <span style={{color: COLORS[0]}}>% of Index (with fees)</span> is Glp with fees / Index Price * 100<br/>
                <span style={{color: COLORS[4]}}>% of LP ETH-USDC (with fees)</span> is Glp Price with fees / LP ETH-USDC * 100<br/>
                <span style={{color: COLORS[2]}}>Index Price</span> is 25% BTC, 25% ETH, 50% USDC
              </p>
            </div>
          </ChartWrapper>
        </div>
        <div className="chart-cell half">
          <ChartWrapper title="Traders Net PnL" loading={tradersLoading}>
            <ResponsiveContainer width="100%" syncId="tradersId" height={CHART_HEIGHT}>
              <ComposedChart data={tradersData?.data}>
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis domain={[-tradersData?.stats.maxAbsOfPnlAndCumulativePnl * 1.05, tradersData?.stats.maxAbsOfPnlAndCumulativePnl * 1.05]} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatter}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Bar type="monotone" fill="#444" dot={false} dataKey="pnl" name="Net PnL">
                  {(tradersData?.data || []).map((item, i) => {
                    return <Cell key={`cell-${i}`} fill={item.pnl > 0 ? '#22c761' : '#f93333'} />
                  })}
                </Bar>
                <Line type="monotone" strokeWidth={2} stroke="#8884ff" dataKey="cumulativePnl" name="Cumulative PnL" />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-description">
              <p>Considers settled (closed) positions</p>
            </div>
          </ChartWrapper>
        </div>
        <div className="chart-cell half">
          <ChartWrapper title="Traders Profit vs. Loss" loading={tradersLoading}>
            <ResponsiveContainer width="100%" syncId="tradersId" height={CHART_HEIGHT}>
              <ComposedChart data={tradersData?.data} barGap={0}>
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis domain={[-tradersData?.stats.maxProfitLoss * 1.05, tradersData?.stats.maxProfitLoss * 1.05]} tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
                <YAxis domain={[-tradersData?.stats.maxCumulativeProfitLoss * 1.1, tradersData?.stats.maxCumulativeProfitLoss * 1.1]} orientation="right" yAxisId="right" tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatter}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Area  yAxisId="right" type="monotone" stroke={0} fill="#88eba1" dataKey="cumulativeProfit" name="Cumulative Profit" />
                <Area  yAxisId="right" type="monotone" stroke={0} fill="#f98888" dataKey="cumulativeLoss" name="Cumulative Loss" />
                <Bar type="monotone" fill="#22c761" dot={false} dataKey="profit" name="Profit" />
                <Bar type="monotone" fill="#f93333" dot={false} dataKey="loss" name="Loss" />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-description">
              <p>Considers settled (closed) positions</p>
            </div>
          </ChartWrapper>
        </div>
        <div className="chart-cell half">
           <GenericChart
              loading={fundingRateLoading}
              title="Annualized Borrowing Rate"
              data={fundingRateData}
              yaxisDataKey="ETH"
              yaxisTickFormatter={yaxisFormatterPercent}
              tooltipFormatter={tooltipFormatterPercent}
              items={[{ key: 'ETH' }, { key: 'BTC' }, { key: 'UNI' }, { key: 'LINK' }, { key: 'USDC' }, { key: 'USDT' }]}
              type="Line"
              yaxisDomain={[0, 90 /* ~87% is a maximum yearly borrow rate */]}
            />
        </div>
        <div className="chart-cell half">
           <GenericChart
              loading={tradersLoading}
              title="Open Interest"
              data={tradersData?.data}
              yaxisDataKey="openInterest"
              items={[{ key: 'shortOpenInterest', name: 'Short', color: RED }, { key: 'longOpenInterest', name: 'Long', color: GREEN }]}
              type="Bar"
            />
        </div>
        <div className="chart-cell half">
           <GenericChart
              loading={swapSourcesLoading}
              title="Swap Sources"
              data={swapSources}
              items={swapSourcesKeys.map(key => ({ key }))}
            />
        </div>
        <div className="chart-cell half">
           <GenericChart
              syncId="syncGlp"
              loading={usersLoading}
              title="Unique Users"
              data={usersData}
              yaxisDataKey="uniqueCount"
              yaxisTickFormatter={yaxisFormatterNumber}
              tooltipFormatter={tooltipFormatterNumber}
              tooltipLabelFormatter={tooltipLabelFormatterUnits}
              items={[{ key: 'uniqueSwapCount', name: 'Swaps' }, { key: 'uniqueMarginCount', name: 'Margin trading' }, { key: 'uniqueMintBurnCount', name: 'Mint & Burn GLP' }]}
              type="Composed"
            />
        </div>
        <div className="chart-cell half">
           <GenericChart
              syncId="syncGlp"
              loading={usersLoading}
              title="User Actions"
              data={(usersData || []).map(item => ({ ...item, all: item.actionCount }))}
              yaxisDataKey="actionCount"
              yaxisTickFormatter={yaxisFormatterNumber}
              tooltipFormatter={tooltipFormatterNumber}
              tooltipLabelFormatter={tooltipLabelFormatterUnits}
              items={[{ key: 'actionSwapCount', name: 'Swaps' }, { key: 'actionMarginCount', name: 'Margin trading' }, { key: 'actionMintBurnCount', name: 'Mint & Burn GLP' }]}
              type="Composed"
            />
        </div>
      </div>
    </div>
  );
}

export default Arbitrum;
