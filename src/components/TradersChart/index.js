import React from 'react'
import { Area, Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { 
    convertToPercents,
    tooltipLabelFormatter,
    yaxisFormatter,
 } from '../../helpers';
import { useChartViewState } from '../../hooks/useChartViewState';
import ChartWrapper from '../ChartWrapper';

const convertToPercentsHandler = (data) => {
    return data.map(item => {
        const total = item.profit + Math.abs(item.loss);

        const resultItem = {
            ...item,
            profit: (item.profit / total) * 100,
            loss: (Math.abs(item.loss) / total) * 100,
            all: 100,
        };

        return resultItem;
    })
};


export default function TradersChart({
    syncId,
    tradersData,
    loading,
    yaxisWidth,
    chartHeight,
}) {
    const controls = {
        convertToPercents: convertToPercentsHandler,
    }

    console.log(tradersData?.data)

    const {
        viewState,
        togglePercentView,
        formattedData,
        ...viewSettings
    } = useChartViewState({controls, data: tradersData?.data});

    return (
        <ChartWrapper
            title="Traders Profit vs. Loss"
            loading={loading}
            data={tradersData?.data}
            csvFields={[{ key: 'profit' }, { key: 'loss' }, { key: 'profitCumulative' }, { key: 'lossCumulative' }]}
            controls={controls}
            togglePercentView={togglePercentView}
            viewState={viewState}
      >
        <ResponsiveContainer width="100%" syncId={syncId} height={chartHeight}>
          <ComposedChart data={tradersData?.data} barGap={0}>
            <CartesianGrid strokeDasharray="10 10" />
            <XAxis dataKey="timestamp" tickFormatter={tooltipLabelFormatter} minTickGap={30} />
            {/* <YAxis dataKey="all" tickFormatter={viewSettings.yaxisTickFormatter} width={yaxisWidth} /> */}
            <YAxis domain={[-tradersData?.stats.maxProfitLoss * 1.05, tradersData?.stats.maxProfitLoss * 1.05]} tickFormatter={viewSettings.yaxisTickFormatter} width={yaxisWidth} />
            <YAxis domain={[-tradersData?.stats.maxCurrentCumulativeProfitLoss * 1.1, tradersData?.stats.maxCurrentCumulativeProfitLoss * 1.1]} orientation="right" yAxisId="right" tickFormatter={yaxisFormatter} width={yaxisWidth} />
            <Tooltip
              formatter={viewSettings.tooltipFormatter}
              labelFormatter={tooltipLabelFormatter}
              contentStyle={{ textAlign: 'left' }}
            />
            <Legend />
            <Area yAxisId="right" type="monotone" stroke={0} fill="#22c761" fillOpacity="0.4" dataKey="currentProfitCumulative" name="Cumulative Profit" />
            <Area yAxisId="right" type="monotone" stroke={0} fill="#f93333" fillOpacity="0.4" dataKey="currentLossCumulative" name="Cumulative Loss" />
            {/* <Bar type="monotone" fill="#22c761" dot={false} dataKey="profit" name="Profit" />
            <Bar type="monotone" fill="#f93333" dot={false} dataKey="loss" name="Loss" /> */}
            <Bar type="monotone" stackId="a" fill="#22c761" dot={true} dataKey="profit" name="Profit" />
            <Bar type="monotone" stackId="a" fill="#f93333" dot={true} dataKey="loss" name="Loss" />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="chart-description">
          <p>Considers settled (closed) positions</p>
          <p>Fees are not factored into PnL</p>
        </div>
      </ChartWrapper>
    )
}