import React, { useEffect, useState, useCallback, useMemo } from 'react';
import * as ethers from 'ethers'
import moment from 'moment'

import {
  yaxisFormatterNumber,
  yaxisFormatterPercent,
  yaxisFormatter,
  tooltipLabelFormatter,
  tooltipFormatter,
  tooltipFormatterNumber,
  tooltipFormatterPercent
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

import {
  useVolumeData,
  useFeesData,
  useGlpData,
  useCoingeckoPrices,
  useGlpPerformanceData,
  usePnlData,
  useSwapSources,
  useLastSubgraphBlock,
  useLastBlock
} from './dataProvider'

const { BigNumber } = ethers
const { formatUnits} = ethers.utils
const COLORS = ['#ee64b8', '#22c761', '#ab6100', '#c90000', '#8884ff']

const CHART_HEIGHT = 400
const YAXIS_WIDTH = 65

function GenericChart(props) {
  const {
    loading,
    title,
    data,
    description,
    height = CHART_HEIGHT,
    yaxisWidth = YAXIS_WIDTH,
    yaxisDataKey = 'all',
    yaxisTickFormatter = yaxisFormatter,
    xaxisDataKey = 'timestamp',
    xaxisTickFormatter = tooltipLabelFormatter,
    tooltipFormatter_ = tooltipFormatter,
    tooltipLabelFormatter_ = tooltipLabelFormatter,
    items
  } = props

  return <ChartWrapper title={title} loading={loading}>
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="10 10" />
        <XAxis dataKey={xaxisDataKey} tickFormatter={xaxisTickFormatter} minTickGap={30} />
        <YAxis dataKey={yaxisDataKey} tickFormatter={yaxisTickFormatter} />
        <Tooltip
          formatter={tooltipFormatter_}
          labelFormatter={tooltipLabelFormatter_}
          contentStyle={{ textAlign: 'left' }}
        />
        <Legend />
        {items && items.map((item, i) => {
          return <Bar
            type="monotone"
            dataKey={item.key}
            stackId="a"
            name={item.name || item.key}
            fill={item.color || COLORS[i % COLORS.length]}
          />
        })}
      </BarChart>
    </ResponsiveContainer>
    {description && (
      <div className="chart-description">
        {description}
      </div>
    )}
  </ChartWrapper>
}

function Arbitrum() {
  const GROUP_PERIOD = 86400

  const [glpData, glpLoading] = useGlpData({ groupPeriod: GROUP_PERIOD })
  const [glpPerformanceData, glpPerformanceLoading] = useGlpPerformanceData(glpData, { groupPeriod: GROUP_PERIOD })
  const [volumeData, volumeLoading] = useVolumeData({ groupPeriod: GROUP_PERIOD })
  const [feesData, feesLoading] = useFeesData({ groupPeriod: GROUP_PERIOD })
  const [pnlData, pnlLoading] = usePnlData({ groupPeriod: GROUP_PERIOD })
  const [swapSources, swapSourcesLoading] = useSwapSources({ groupPeriod: GROUP_PERIOD })
  const swapSourcesKeys = Object.keys((swapSources || []).reduce((memo, el) => {
    Object.keys(el).forEach(key => {
      if (key === 'all' || key === 'timestamp') return
      memo[key] = true
    })
    return memo
  }, {}))

  const [lastSubgraphBlock] = useLastSubgraphBlock()
  const [lastBlock] = useLastBlock()

  const isObsolete = lastSubgraphBlock && lastBlock && lastBlock.timestamp - lastSubgraphBlock.timestamp > 3600

  return (
    <div className="Home">
      <h1>GMX Dashboard / Arbitrum</h1>
      {lastSubgraphBlock && lastBlock &&
        <p className={isObsolete ? 'warning' : ''}>
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
          <ChartWrapper title="AUM / Glp Price" loading={glpLoading}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <ComposedChart data={glpData}>
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="aum" tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
                <YAxis orientation="right" dataKey="glpPrice" tickFormatter={yaxisFormatter} yAxisId="right" width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatter}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Area type="monotone" dataKey="aum" stackId="a" name="AUM" />
                <Line type="monotone" yAxisId="right" strokeWidth={2} dot={false} dataKey="glpPrice" stackId="a" name="GLP Price" stroke="#ee64b8" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </div>
        <div className="chart-cell half">
          <ChartWrapper title="Glp Supply" loading={glpLoading}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <ComposedChart data={glpData}>
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="glpSupply" tickFormatter={yaxisFormatterNumber} width={YAXIS_WIDTH} />
                <YAxis dataKey="glpSupplyChange" tickFormatter={yaxisFormatterPercent} orientation="right" yAxisId="right" width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatterNumber}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Bar type="monotone" yAxisId="right" dataKey="glpSupplyChange" name="Change %" fill="#444">
                  {(glpData || []).map((item, i) => {
                    return <Cell key={`cell-${i}`} fill={item.glpSupplyChange > 0 ? '#22c761' : '#f93333'} />
                  })}
                </Bar>
                <Line type="monotone" dot={false} strokeWidth={3} dataKey="glpSupply" stackId="a" name="GLP Supply" stroke="#8884ff" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </div>
        <div className="chart-cell half">
          <ChartWrapper title="Glp Index Performance" loading={glpLoading}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart data={glpPerformanceData}>
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="ratio" tickFormatter={yaxisFormatterNumber} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatterNumber}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Line type="monotone" strokeWidth={3} dot={false} dataKey="ratio" stackId="a" name="Performance" stroke="#ee64b8" />
              </LineChart>
            </ResponsiveContainer>
            <div className="chart-description">
              <p>
                Formula = glp price / synthetic index price <br/>
                synthetic index price = 25% BTC, 25% ETH, 50% USDC
              </p>
            </div>
          </ChartWrapper>
        </div>
        <div className="chart-cell half">
          <ChartWrapper title="Traders PnL" loading={pnlLoading}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <ComposedChart data={pnlData}>
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="pnl" tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
                <YAxis dataKey="cumulativePnl" orientation="right" yAxisId="right" tickFormatter={yaxisFormatter} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatter}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Bar type="monotone" fill="#444" dot={false} dataKey="pnl" name="PnL">
                  {(pnlData || []).map((item, i) => {
                    return <Cell key={`cell-${i}`} fill={item.pnl > 0 ? '#22c761' : '#f93333'} />
                  })}
                </Bar>
                <Line  yAxisId="right" type="monotone" strokeWidth={2} stroke="#8884ff" dataKey="cumulativePnl" name="Cumulative PnL" />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-description">
              <p>Considers settled (closed) positions</p>
              <p>
                Doesn't include trading fees <br />
                Cumulative PnL uses data from selected time period only
              </p>
            </div>
          </ChartWrapper>
        </div>
        <div className="chart-cell half">
           <GenericChart
              loading={swapSourcesLoading}
              title="Swap Sources"
              data={swapSources}
              description={<p>Uses last 1000 swaps</p>}
              items={swapSourcesKeys.map(key => ({ key }))}
            />
        </div>
      </div>
    </div>
  );
}

export default Arbitrum;
