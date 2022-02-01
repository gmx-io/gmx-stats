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
  tooltipLabelFormatter as tooltipLabelFormatter_,
  tooltipFormatter as tooltipFormatter_,
  tooltipFormatterNumber,
  tooltipFormatterPercent,
  CHART_HEIGHT,
  YAXIS_WIDTH,
  COLORS,
  COINCOLORS
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
    yaxisDomain,
    xaxisDataKey = 'timestamp',
    xaxisTickFormatter = tooltipLabelFormatter_,
    tooltipFormatter = tooltipFormatter_,
    tooltipLabelFormatter = tooltipLabelFormatter_,
    items,
    type,
    syncId,
    children,
    rightYaxisDataKey,
    isCoinChart
  } = props

  let ChartComponent
  if (type === 'Line') {
    ChartComponent = LineChart
  } else if (type === 'Bar') {
    ChartComponent = BarChart
  } else {
    ChartComponent = ComposedChart
  }

  // Previous update
  // fill: item.color || (isCoinChart ? COINCOLORS[i % COINCOLORS.length] : COLORS[i % COLORS.length]),
  // stroke: item.color || (isCoinChart ? COINCOLORS[i % COINCOLORS.length] : COLORS[i % COLORS.length]),

  const htmlItems = (items || []).map((item, i) => {
    const props = {
      type: "monotone",
      dataKey: item.key,
      stackId: "a",
      name: item.name || item.key,
      fill: item.color || COLORS[i % COLORS.length],
      stroke: item.color || COLORS[i % COLORS.length],
      dot: item.dot || false,
      key: 'item-' + i,
      unit: item.unit,
      strokeWidth: item.strokeWidth,
      yAxisId: item.yAxisId
    }
    if (item.type === 'Line' || type === 'Line') {
      return <Line {...props} isAnimationActive={false} />
    }
    return <Bar {...props} isAnimationActive={false} />
  })

  const csvFields = items.map(item => ({ key: item.key, name: item.name }))

  return <ChartWrapper title={title} loading={loading} data={data} csvFields={csvFields}>
    <ResponsiveContainer width="100%" height={height}>
      {React.createElement(ChartComponent, { data, syncId }, [
        <CartesianGrid strokeDasharray="10 10" key="a" />,
        <XAxis dataKey={xaxisDataKey} tickFormatter={xaxisTickFormatter} minTickGap={30} key="b" />,
        <YAxis domain={yaxisDomain} dataKey={yaxisDataKey} tickFormatter={yaxisTickFormatter} key="c" />,
        (
          rightYaxisDataKey ?
            <YAxis dataKey={rightYaxisDataKey} tickFormatter={yaxisTickFormatter} orientation="right" yAxisId="right" key="c2" />
            : null
        ),
        <Tooltip
          formatter={tooltipFormatter}
          labelFormatter={tooltipLabelFormatter}
          contentStyle={{ textAlign: 'left' }}
          key="d"
        />,
        <Legend key="e" />,
        ...htmlItems,
        children
      ])}
    </ResponsiveContainer>
    {description && (
      <div className="chart-description">
        {description}
      </div>
    )}
  </ChartWrapper>
}
