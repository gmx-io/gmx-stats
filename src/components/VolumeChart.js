import {
  Bar,
  Label,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line
} from 'recharts';
import ChartWrapper from './ChartWrapper'

import {
  COLORS
} from '../helpers'

export default function VolumeChart(props) {
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

  return <ChartWrapper title="Volume" loading={loading}>
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
        <Bar type="monotone" dataKey="swap" stackId="a" name="Swap" fill={COLORS[0]} />
        <Bar type="monotone" dataKey="mint" stackId="a" name="Mint GLP" fill={COLORS[1]} />
        <Bar type="monotone" dataKey="burn" stackId="a" name="Burn GLP" fill={COLORS[2]} />
        <Bar type="monotone" dataKey="liquidation" stackId="a" name="Liquidation" fill={COLORS[3]} />
        <Bar type="monotone" dataKey="margin" stackId="a" name="Margin trading" fill={COLORS[4]} />
        <Line type="monotone" dot={false} strokeWidth={3} stroke={COLORS[0]} dataKey="cumulative" yAxisId="right" name="Cumulative" />
      </ComposedChart>
    </ResponsiveContainer>
  </ChartWrapper>
}