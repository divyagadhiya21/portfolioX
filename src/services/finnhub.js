const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY
const BASE_URL = 'https://finnhub.io/api/v1'

export async function fetchStockPrice(symbol) {
  if (!API_KEY) {
    return {
      current: 0,
      previousClose: 0,
      change: 0,
      changePercent: 0,
    }
  }

  try {
    const response = await fetch(`${BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(API_KEY)}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    return {
      current: Number(data.c) || 0,
      previousClose: Number(data.pc) || 0,
      change: Number(data.d) || 0,
      changePercent: Number(data.dp) || 0,
    }
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error)
    return {
      current: 0,
      previousClose: 0,
      change: 0,
      changePercent: 0,
    }
  }
}

export async function fetchMultiplePrices(symbols) {
  const prices = {}

  await Promise.all(
    symbols.map(async (symbol) => {
      prices[symbol] = await fetchStockPrice(symbol)
    }),
  )

  return prices
}
