import React, { useEffect, useState, useCallback, useMemo } from 'react';
import * as ethers from 'ethers'

import {
  yaxisFormatterNumber,
  yaxisFormatter,
  tooltipLabelFormatter,
  tooltipFormatter,
  tooltipFormatterNumber
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
  Cell
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
  usePnlData
} from './dataProvider'

const { BigNumber } = ethers
const { formatUnits} = ethers.utils

function Arbitrum() {
  const [glpData, glpLoading] = useGlpData()
  const [glpPerformanceData, glpPerformanceLoading] = useGlpPerformanceData(glpData)
  const [volumeData, volumeLoading] = useVolumeData()
  const [feesData, feesLoading] = useFeesData()
  const [pnlData, pnlLoading] = usePnlData()

  const CHART_HEIGHT = 300
  const YAXIS_WIDTH = 65

  return (
    <div className="Home">
      <h1>GMX Dashboard / Arbitrum</h1>
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
              <ComposedChart syncId="syncId" data={glpData}>
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
              <AreaChart syncId="syncId" data={glpData}>
                <CartesianGrid strokeDasharray="10 10" />
                <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
                <YAxis dataKey="glpSupply" tickFormatter={yaxisFormatterNumber} width={YAXIS_WIDTH} />
                <Tooltip
                  formatter={tooltipFormatterNumber}
                  labelFormatter={tooltipLabelFormatter}
                  contentStyle={{ textAlign: 'left' }}
                />
                <Legend />
                <Area type="monotone" dataKey="glpSupply" stackId="a" name="GLP Supply" fill="#8884ff" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartWrapper>
        </div>
        <div className="chart-cell half">
          <ChartWrapper title="Glp Index Performance" loading={glpLoading}>
            <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
              <LineChart syncId="syncId" data={glpPerformanceData}>
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
              <ComposedChart syncId="syncId" data={pnlData}>
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
                <Bar type="monotone" fill="#444" dot={false} dataKey="pnl" name="Daily PnL">
                  {(pnlData || []).map((item, i) => {
                    return <Cell key={`cell-${i}`} fill={item.pnl > 0 ? '#22c761' : '#f93333'} />
                  })}
                </Bar>
                <Line  yAxisId="right" type="monotone" strokeWidth={2} stroke="#8884ff" dataKey="cumulativePnl" name="Cumulative PnL" />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="chart-description">
              <p>
                Doesn't include trading fees
              </p>
            </div>
          </ChartWrapper>
        </div>
      </div>
    </div>
  );
}

export default Arbitrum;
