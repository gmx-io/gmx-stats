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

  const csvFields = [
    {key: 'swap', name: 'Swap'},
    {key: 'margin', name: 'Margin trading'},
    {key: 'mint', name: 'Mint GLP'},
    {key: 'burn', name: 'Burn GLP'},
    {key: 'liquidation', name: 'Liquidation'},
    {key: 'cumulative', name: 'Cumulative'}
  ]

  return <ChartWrapper title="Volume" loading={loading} csvFields={csvFields} data={data}>
    <ResponsiveContainer width="100%" height={chartHeight}>
      <ComposedChart data={data} syncId="syncA">
        <CartesianGrid strokeDasharray="10 10" />
        <XAxis dataKey="timestamp" tickFormatter={xaxisTickFormatter} minTickGap={30} />
        <YAxis dataKey="all" interval="preserveStartEnd" tickCount={7} tickFormatter={yaxisTickFormatter} width={yaxisWidth} />
        <YAxis dataKey="cumulative" orientation="right" yAxisId="right" tickFormatter={yaxisTickFormatter} width={yaxisWidth} />
        <Tooltip
          formatter={tooltipFormatter}
          labelFormatter={tooltipLabelFormatter}
          contentStyle={{ textAlign: 'left' }}
        />
        <Legend />
        <Bar isAnimationActive={false} type="monotone" dataKey="swap" stackId="a" name="Swap" fill={COLORS[0]} />
        <Bar isAnimationActive={false} type="monotone" dataKey="mint" stackId="a" name="Mint GLP" fill={COLORS[1]} />
        <Bar isAnimationActive={false} type="monotone" dataKey="burn" stackId="a" name="Burn GLP" fill={COLORS[2]} />
        <Bar isAnimationActive={false} type="monotone" dataKey="liquidation" stackId="a" name="Liquidation" fill={COLORS[3]} />
        <Bar isAnimationActive={false} type="monotone" dataKey="margin" stackId="a" name="Margin trading" fill={COLORS[4]} />
        <Line isAnimationActive={false} type="monotone" dot={false} strokeWidth={3} stroke={COLORS[0]} dataKey="cumulative" yAxisId="right" name="Cumulative" />
      </ComposedChart>
    </ResponsiveContainer>
  </ChartWrapper>
}