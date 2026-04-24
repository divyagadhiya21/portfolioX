import axios from 'axios';

const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY;
const BASE_URL = 'https://finnhub.io/api/v1';

export const fetchStockPrice = async (symbol) => {
  try {
    const res = await axios.get(`${BASE_URL}/quote`, {
      params: { symbol, token: API_KEY },
    });
    return res.data.c || 0; // current price
  } catch (err) {
    console.error(`Error fetching price for ${symbol}:`, err);
    return 0;
  }
};

export const fetchMultiplePrices = async (symbols) => {
  const prices = {};
  await Promise.all(
    symbols.map(async (sym) => {
      prices[sym] = await fetchStockPrice(sym);
    })
  );
  return prices;
};