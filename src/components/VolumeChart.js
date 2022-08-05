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
  COLORS, 
  convertToPercents,
  tooltipFormatter,
  tooltipLabelFormatter,
  yaxisFormatter,
} from '../helpers'
import { useChartViewState } from '../hooks/useChartViewState';

const convertToPercentsHandler = (data) =>
  convertToPercents(data, {ignoreKeys: ['cumulative', 'movingAverageAll'], totalKey: 'all'})

export default function VolumeChart(props) {
  const {
    data,
    loading,
    chartHeight,
    yaxisWidth,
  } = props

  const csvFields = [
    {key: 'swap', name: 'Swap'},
    {key: 'margin', name: 'Margin trading'},
    {key: 'mint', name: 'Mint GLP'},
    {key: 'burn', name: 'Burn GLP'},
    {key: 'liquidation', name: 'Liquidation'},
    {key: 'cumulative', name: 'Cumulative'}
  ];

  const controls = {
    convertToPercents: convertToPercentsHandler,
  }

  const {
    viewState,
    togglePercentView,
    formattedData,
    ...viewSettings
  } = useChartViewState({controls, data});

  return (
    <ChartWrapper 
      title="Volume"
      loading={loading}
      csvFields={csvFields}
      data={formattedData}
      controls={controls}
      viewState={viewState}
      togglePercentView={togglePercentView}
    >
      <ResponsiveContainer width="100%" height={chartHeight}>
        <ComposedChart data={formattedData} syncId="syncA">
          <CartesianGrid strokeDasharray="10 10" />
          <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
          <YAxis 
            dataKey="all"
            interval="preserveStartEnd"
            tickCount={viewState.isPercentsView ? undefined : 7} 
            tickFormatter={viewSettings.yaxisTickFormatter}
            width={yaxisWidth} 
          />

          <YAxis dataKey="cumulative" orientation="right" yAxisId="right" tickFormatter={yaxisFormatter} width={yaxisWidth} />

          <Tooltip
            formatter={(value, name) => {
              if (name === 'Cumulative') {
                return tooltipFormatter(value)
              } 

              return viewSettings.tooltipFormatter(value)
            }}
            labelFormatter={tooltipLabelFormatter}
            contentStyle={{ textAlign: 'left' }}
          />

          <Legend />

          <Bar unit={viewSettings.itemsUnit} isAnimationActive={false} type="monotone" dataKey="swap" stackId="a" name="Swap" fill={COLORS[0]} />
          <Bar unit={viewSettings.itemsUnit} isAnimationActive={false} type="monotone" dataKey="mint" stackId="a" name="Mint GLP" fill={COLORS[1]} />
          <Bar unit={viewSettings.itemsUnit} isAnimationActive={false} type="monotone" dataKey="burn" stackId="a" name="Burn GLP" fill={COLORS[2]} />
          <Bar unit={viewSettings.itemsUnit} isAnimationActive={false} type="monotone" dataKey="liquidation" stackId="a" name="Liquidation" fill={COLORS[3]} />
          <Bar unit={viewSettings.itemsUnit} isAnimationActive={false} type="monotone" dataKey="margin" stackId="a" name="Margin trading" fill={COLORS[4]} />
          <Line isAnimationActive={false} type="monotone" dot={false} strokeWidth={3} stroke={COLORS[12]} dataKey="cumulative" yAxisId="right" name="Cumulative" />

        </ComposedChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}