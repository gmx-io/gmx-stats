import { useMemo } from 'react';

export default function useChartDomain(data, dataKeys, fallback = [0, 100], padding = 50) {
  const values = useMemo(() => {
    if (!data || !data.length || !dataKeys || !dataKeys.length) {
      return [];
    }
    return data.reduce((acc, cv) => {
      const values = dataKeys.filter((key) => key in cv).map((key) => Number(cv[key])).filter(Number.isFinite);
      return acc.concat(values);
    }, []);
  }, [data, dataKeys]);

  const minValue = useMemo(() => Math.min(...values), [values]);
  const maxValue = useMemo(() => Math.max(...values), [values]);
  const diff = (maxValue - minValue) * (padding / 100);
  const domain =  [Math.min(minValue, maxValue) - diff, Math.max(minValue, maxValue) + diff];

  return values.length > 0 ? domain : fallback;
}
