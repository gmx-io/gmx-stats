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

import {
  yaxisFormatterNumber,
  yaxisFormatterPercent,
  yaxisFormatter,
  tooltipLabelFormatter,
  tooltipFormatter,
  tooltipFormatterNumber,
  tooltipFormatterPercent,
  CHART_HEIGHT,
  YAXIS_WIDTH,
  COLORS
} from '../helpers'

import ChartWrapper from './ChartWrapper'

export default function GenericChart(props) {
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
