import { useState, useEffect, useCallback } from 'react';
import { fetchMultiplePrices } from '../services/finnhub';

export const useStockPrices = (tickers = []) => {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!tickers.length) return;
    setLoading(true);
    const data = await fetchMultiplePrices(tickers);
    setPrices(data);
    setLoading(false);
  }, [tickers.join(',')]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, [refresh]);

  return { prices, loading, refresh };
};