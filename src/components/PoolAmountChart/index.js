import React, { useMemo, useState } from 'react'
import { useTokenStats } from '../../dataProvider';
import { tooltipFormatter, tooltipFormatterPercent, yaxisFormatter, yaxisFormatterPercent } from '../../helpers';
import './PoolAmountChart.css';
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
}) {
    const [isPercentsView, setIsPercentsView] = useState(false);
    const [tokenStatsData, tokenStatsLoading] = useTokenStats({from, to, chainName});

    const data = useMemo(() => {
        if (!tokenStatsData) {
            return [];
        }

        if (isPercentsView) {
            return convertToPercents(tokenStatsData.poolAmountUsd)
        }

        return tokenStatsData.poolAmountUsd

    }, [isPercentsView, tokenStatsData])

    return (
        <div className='root'>
            <div className='controls'>
                <div 
                    className={cx('PoolAmoutChart', {button: true, active: isPercentsView})}
                    onClick={() => setIsPercentsView(old => !old)}
                >
                    %
                </div>
            </div>
            
            <GenericChart
                loading={tokenStatsLoading}
                title="Pool Composition"
                data={data}
                yaxisTickFormatter={isPercentsView ? yaxisFormatterPercent : yaxisFormatter}
                tooltipFormatter={isPercentsView ? tooltipFormatterPercent : tooltipFormatter}
                yaxisDataKey={'total'}
                items={[{ key: 'ETH' }, { key: 'BTC' }, { key: 'UNI' }, { key: 'LINK' }, { key: 'USDC' }, { key: 'USDT' }, { key: 'MIM' }, { key: 'FRAX'}, { key: 'DAI' }]}
                type="Bar"
            />
        </div>
    )
}