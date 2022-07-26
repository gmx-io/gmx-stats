import React, { useMemo, useState } from 'react'
import { useTokenStats } from '../../dataProvider';
import { tooltipFormatter, tooltipFormatterPercent, yaxisFormatter, yaxisFormatterPercent } from '../../helpers';
import GenericChart from "../GenericChart"
import cx from 'classnames';

function convertToPercents(items) {
    return items.map(item => {
        const {
            timestamp,
            total,
            ...tokens
        } = item;

        const formattedTokens = Object.entries(tokens).reduce((acc, [token, value]) => {
            acc[token] = (value / total) * 100;
            return acc;
        }, {})

        return {
            total: 100,
            ...formattedTokens,
            timestamp
        }
    })
}

export default function PoolAmountChart({
    from,
    to,
    chainName,
    syncId,
}) {
    const [isPercentsView, setIsPercentsView] = useState(false);
    const [tokenStatsData, tokenStatsLoading] = useTokenStats({from, to, chainName});

    const data = useMemo(() => {
        if (!tokenStatsData || !tokenStatsData.poolAmountUsd) {
            return [];
        }

        if (isPercentsView) {
            return convertToPercents(tokenStatsData.poolAmountUsd)
        }

        return tokenStatsData.poolAmountUsd;

    }, [isPercentsView, tokenStatsData]);

    const chartLegendItems = Object.keys(data[0] || {})
        .filter(key => !['timestamp', 'total'].includes(key))
        .map(token => ({key: token}));

    return (
        <div style={{position: 'relative'}}>
            <div className='chart-controls'>
                <div 
                    className={cx('PoolAmoutChart', {'chart-control-checkbox': true, active: isPercentsView})}
                    onClick={() => setIsPercentsView(old => !old)}
                >
                    %
                </div>
            </div>
            
            <GenericChart
                syncId={syncId}
                loading={tokenStatsLoading}
                title="Pool Composition"
                data={data}
                yaxisTickFormatter={isPercentsView ? yaxisFormatterPercent : yaxisFormatter}
                tooltipFormatter={isPercentsView ? tooltipFormatterPercent : tooltipFormatter}
                yaxisDataKey={'total'}
                items={chartLegendItems}
                type="Bar"
            />
        </div>
    )
}