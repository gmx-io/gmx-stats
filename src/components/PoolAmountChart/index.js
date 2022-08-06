import React from 'react'
import { useTokenStats } from '../../dataProvider';
import { 
    COINCOLORS, convertToPercents,
 } from '../../helpers';
import GenericChart from '../GenericChart';

const convertToPercentsHandler = (data) =>
  convertToPercents(data, {totalKey: 'all', ignoreKeys: []})


function getTokenColor(index) {
    return COINCOLORS[index % COINCOLORS.length];
}

export default function PoolAmountChart({
    from,
    to,
    chainName,
    syncId,
}) {
    const [tokenStatsData, tokenStatsLoading] = useTokenStats({from, to, chainName});

    const chartLegendItems = (tokenStatsData && tokenStatsData.tokenSymbols)
        ? tokenStatsData.tokenSymbols.map((token, i) => ({
            key: token,
            color: getTokenColor(i),
            fillOpacity: 0.5
        }))
        : [];

    return (
        <GenericChart
            syncId={syncId}
            loading={tokenStatsLoading}
            title="Pool Composition"
            data={tokenStatsData ? tokenStatsData.poolAmountUsd : null}
            controls={{
                convertToPercents: convertToPercentsHandler,
            }}
            yaxisDataKey="all"
            items={chartLegendItems}
            type="Area"
        />
    )
}