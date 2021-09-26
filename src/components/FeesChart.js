import {
  Bar,
  Label,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
  Line,
  ResponsiveContainer
} from 'recharts';

import ChartWrapper from './ChartWrapper'

import {
  COLORS
} from '../helpers'

export default function FeesChart(props) {
  const {
    data,
    loading,
    chartHeight,
    yaxisWidth,
    xaxisTickFormatter,
    yaxisTickFormatter,
    tooltipFormatter,
    tooltipLabelFormatter
  } = props

  return <ChartWrapper title="Fees" loading={loading}>
    <ResponsiveContainer width="100%" height={chartHeight}>
      <ComposedChart data={data} syncId="syncA">
        <CartesianGrid strokeDasharray="10 10" />
        <XAxis dataKey="timestamp" tickFormatter={xaxisTickFormatter} minTickGap={30} />
        <YAxis dataKey="all" tickFormatter={yaxisTickFormatter} width={yaxisWidth} />
        <YAxis dataKey="cumulative" orientation="right" yAxisId="right" tickFormatter={yaxisTickFormatter} width={yaxisWidth} />
        <Tooltip
          formatter={tooltipFormatter}
          labelFormatter={tooltipLabelFormatter}
          contentStyle={{ textAlign: 'left' }}
        />
        <Legend />
        <Bar type="monotone" dataKey="swap" stackId="a" name="Swap" fill="#ee64b8" />
        <Bar type="monotone" dataKey="mint" stackId="a" name="Mint USDG" fill="#22c761" />
        <Bar type="monotone" dataKey="burn" stackId="a" name="Burn USDG" fill="#ab6100" />
        <Bar type="monotone" dataKey="liquidation" stackId="a" name="Liquidation" fill="#c90000" />
        <Bar type="monotone" dataKey="margin" stackId="a" name="Margin trading" fill="#8884ff" />
        <Line type="monotone" strokeWidth={2} dot={false} stroke={COLORS[5]} dataKey="cumulative" yAxisId="right" name="Cumulative" />
      </ComposedChart>
    </ResponsiveContainer>
    <div className="chart-description">
      Collected fees. USD value is calculated with token price at the moment of swap, trade, minting or redeeming GLP
    </div>
  </ChartWrapper>
}