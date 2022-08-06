import React, {useMemo} from 'react';
import {
  LineChart,
  BarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  ComposedChart,
} from 'recharts';

import {
  tooltipLabelFormatter as tooltipLabelFormatter_,
  tooltipFormatter as tooltipFormatter_,
  CHART_HEIGHT,
  YAXIS_WIDTH,
  COLORS,
} from '../helpers'
import { useChartViewState } from '../hooks/useChartViewState';

import ChartWrapper from './ChartWrapper';

export default function GenericChart(props) {
  const {
    loading,
    title,
    data,
    description,
    height = CHART_HEIGHT,
    yaxisWidth = YAXIS_WIDTH,
    yaxisDataKey = 'all',
    yaxisScale,
    truncateYThreshold,
    yaxisTickFormatter,
    yaxisDomain = [0, 'auto'],
    xaxisDataKey = 'timestamp',
    xaxisTickFormatter = tooltipLabelFormatter_,
    tooltipFormatter = tooltipFormatter_,
    tooltipLabelFormatter = tooltipLabelFormatter_,
    items,
    type = 'Bar',
    syncId,
    children,
    rightYaxisDataKey,
    controls = {},
  } = props

  const {
    viewState,
    togglePercentView,
    formattedData,
    yaxisTickFormatter: defaultYaxisTickFormatter,
    itemsUnit: defaultItemUnit,
  } = useChartViewState({controls, data});

  let ChartComponent

  if (type === 'Line') {
    ChartComponent = LineChart
  } else if (type === 'Bar') {
    ChartComponent = BarChart
  } else if (type === 'Area') {
    ChartComponent = AreaChart
  } else {
    ChartComponent = ComposedChart
  }

  const truncatedYDomain = useMemo(() => {
    if ((typeof truncateYThreshold !== 'number') || !data) {
      return null;
    }

    if (Math.max(...data.map(item => item[yaxisDataKey])) > truncateYThreshold) {
      // Bug in recharts: dataMax number values applies via function syntax only
      // eslint-disable-next-line no-unused-vars
      return [yaxisDomain[0], _ => truncateYThreshold]
    }

    return null
  }, [data, truncateYThreshold, yaxisDomain?.join('-')]);

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
      unit: item.unit || defaultItemUnit,
      strokeWidth: item.strokeWidth,
      yAxisId: item.yAxisId
    }

    if (item.type === 'Line' || type === 'Line') {
      return <Line {...props} isAnimationActive={false} />
    }

    if (type === 'Area') {
      return <Area {...props} isAnimationActive={false} />
    }

    return <Bar {...props} isAnimationActive={false} />
  })

  const csvFields = items.map(item => ({ key: item.key, name: item.name }))

  return (
    <ChartWrapper 
      title={title}
      loading={loading}
      data={formattedData}
      csvFields={csvFields}
      viewState={viewState}
      controls={controls}
      togglePercentView={togglePercentView}
    >
        <ResponsiveContainer width="100%" height={height}>
          {React.createElement(ChartComponent, { data: formattedData, syncId }, [
            <CartesianGrid strokeDasharray="10 10" key="a" />,
            <XAxis dataKey={xaxisDataKey} tickFormatter={xaxisTickFormatter} minTickGap={30} key="b" />,
            <YAxis 
              scale={yaxisScale}
              domain={truncatedYDomain || yaxisDomain}
              dataKey={yaxisDataKey}
              tickFormatter={yaxisTickFormatter || defaultYaxisTickFormatter}
              key="c"
            />,
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
  )
}
