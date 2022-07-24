import React, { useMemo, useState } from 'react'
import { useTokenStats } from '../../dataProvider';
import { tooltipFormatter, tooltipFormatterPercent, yaxisFormatter, yaxisFormatterPercent } from '../../helpers';
import {sum} from 'lodash';
import './PoolAmountChart.css';
import GenericChart from "../GenericChart"
import cx from 'classnames';

function convertToPercents(items) {
    return items.map(item => {
        const {
            timestamp,
            ...tokens
        } = item;

        let total = sum(Object.values(tokens));

        const formattedTokens = Object.entries(tokens).reduce((acc, [token, value]) => {
            acc[token] = (value / total) * 100;
            return acc;
        }, {})

        return {
            ...formattedTokens,
            timestamp
        }
    })
}

export default function PoolAmountChart({
    from,
    to,
    groupPeriod,
}) {
    const [isPercentsView, setIsPercentsView] = useState(false);
    const [tokenStatsData, tokenStatsLoading] = useTokenStats({from, to, groupPeriod});

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
                    className={cx('PoolAmoutChart', {button: true, active: !isPercentsView})}
                    onClick={() => setIsPercentsView(false)}
                >
                    Abs
                </div>
                <div 
                    className={cx('PoolAmoutChart', {button: true, active: isPercentsView})}
                    onClick={() => setIsPercentsView(true)}
                >
                    %
                </div>
            </div>
            
            <GenericChart
                loading={tokenStatsLoading}
                title="Pool amount usd"
                data={data}
                yaxisTickFormatter={isPercentsView ? yaxisFormatterPercent : yaxisFormatter}
                tooltipFormatter={isPercentsView ? tooltipFormatterPercent : tooltipFormatter}
                yaxisDataKey="ETH"
                items={[{ key: 'ETH' }, { key: 'BTC' }, { key: 'UNI' }, { key: 'LINK' }, { key: 'USDC' }, { key: 'USDT' }, { key: 'MIM' }, { key: 'FRAX'}, { key: 'DAI' }]}
                type="Bar"
            />
        </div>
    )
}