import React, { useMemo, useState } from 'react'
import { useTokenStats } from '../../dataProvider';
import { 
    COINCOLORS,
    tooltipFormatter,
    tooltipFormatterPercent,
    yaxisFormatter,
    yaxisFormatterPercent
 } from '../../helpers';
import cx from 'classnames';
import GenericChart from '../GenericChart';

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

function getTokenColor(index) {
    return COINCOLORS[index % COINCOLORS.length];
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

    const chartLegendItems = (tokenStatsData && tokenStatsData.tokenSymbols)
        ? tokenStatsData.tokenSymbols.map((token, i) => ({
            key: token,
            color: getTokenColor(i),
            fillOpacity: 0.5
        }))
        : [];


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
                type="Area"
            />
        </div>
    )
}