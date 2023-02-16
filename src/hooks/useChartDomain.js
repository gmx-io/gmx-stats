import { useMemo } from 'react';

export default function useChartDomain(data, dataKeys, percentage = 10) {
  const values = useMemo(() => {
    if (!data || !data.length || !dataKeys || !dataKeys.length) {
      return [];
    }
    return data.reduce((acc, cv) => {
      const values = dataKeys.filter((key) => key in cv).map((key) => Number(cv[key]));
      return acc.concat(values);
    }, []);
  }, [data, dataKeys]);

  const minValue = useMemo(() => Math.min(...values), [values]);
  const maxValue = useMemo(() => Math.max(...values), [values]);
  const diff = (maxValue - minValue) * (percentage / 100);
  const domain = [minValue - diff, maxValue + diff];

  return data && data.length && dataKeys && dataKeys.length ? domain : [null, null];
}
