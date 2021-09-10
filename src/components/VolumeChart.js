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
      <ComposedChart syncId="syncId" data={data}>
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
        <Line type="monotone" dot={false} strokeWidth={2} stroke="#ee64b8" dataKey="cumulative" yAxisId="right" name="Cumulative" />
      </ComposedChart>
    </ResponsiveContainer>
  </ChartWrapper>
}