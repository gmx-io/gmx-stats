import { useMemo, useState } from "react"
import { tooltipFormatter, tooltipFormatterPercent, yaxisFormatter, yaxisFormatterPercent } from "../helpers";

export function useChartViewState({
    controls,
    data,
}) {
    const [viewState, setViewState] = useState({
        isPercentsView: false,
    });

    const formattedData = useMemo(() => {
        if (!data) {
            return undefined;
        }

        if (viewState.isPercentsView && controls.convertToPercents) {
            return controls.convertToPercents(data)
        }
      
        return data;

    }, [
        data,
        viewState.isPercentsView,
        controls.converToPercents
     ]);

     const togglePercentView = () => {
        setViewState(old => ({...old, isPercentsView: !old.isPercentsView}))
     };

     return {
        viewState,
        togglePercentView,
        formattedData,

        itemsUnit: viewState.isPercentsView 
            ? '%' 
            : undefined,

        yaxisTickFormatter: viewState.isPercentsView 
            ? yaxisFormatterPercent 
            : yaxisFormatter,

        tooltipFormatter: viewState.isPercentsView
            ? tooltipFormatterPercent
            : tooltipFormatter
     }
}
