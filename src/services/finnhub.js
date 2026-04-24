const API_KEY = import.meta.env.VITE_FINNHUB_API_KEY
const TWELVEDATA_API_KEY = import.meta.env.VITE_TWELVEDATA_API_KEY
const BASE_URL = 'https://finnhub.io/api/v1'
const TWELVEDATA_BASE_URL = 'https://api.twelvedata.com'

function buildEmptyQuote() {
  return {
    current: 0,
    previousClose: 0,
    change: 0,
    changePercent: 0,
  }
}

export function toTsxSymbol(symbol) {
  const normalized = String(symbol || '').trim().toUpperCase()
  if (!normalized) return ''
  return normalized.endsWith('.TO') ? normalized : `${normalized}.TO`
}

export function getDisplayTicker(symbol) {
  return toTsxSymbol(symbol).replace(/\.TO$/, '')
}

function toTwelveDataTsxSymbol(symbol) {
  return `${getDisplayTicker(symbol)}:TSX`
}

async function fetchStockPriceFromTwelveData(symbol) {
  if (!TWELVEDATA_API_KEY) return null

  try {
    const response = await fetch(`${TWELVEDATA_BASE_URL}/price?symbol=${encodeURIComponent(toTwelveDataTsxSymbol(symbol))}&apikey=${encodeURIComponent(TWELVEDATA_API_KEY)}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    const current = Number(data.price) || 0

    if (!current) {
      return null
    }

    return {
      current,
      previousClose: current,
      change: 0,
      changePercent: 0,
      source: 'twelvedata',
    }
  } catch (error) {
    console.error(`Error fetching Twelve Data price for ${symbol}:`, error)
    return null
  }
}

export async function fetchStockPrice(symbol) {
  const twelveDataQuote = await fetchStockPriceFromTwelveData(symbol)
  if (twelveDataQuote) {
    return twelveDataQuote
  }

  if (!API_KEY) {
    return buildEmptyQuote()
  }

  try {
    const response = await fetch(`${BASE_URL}/quote?symbol=${encodeURIComponent(toTsxSymbol(symbol))}&token=${encodeURIComponent(API_KEY)}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    return {
      current: Number(data.c) || 0,
      previousClose: Number(data.pc) || 0,
      change: Number(data.d) || 0,
      changePercent: Number(data.dp) || 0,
      source: 'finnhub',
    }
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error)
    return buildEmptyQuote()
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

export async function searchCanadianStocks(query) {
  const normalized = String(query || '').trim()
  if (!API_KEY || normalized.length < 1) return []

  try {
    const response = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(normalized)}&token=${encodeURIComponent(API_KEY)}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    const results = Array.isArray(data.result) ? data.result : []

    return results
      .filter((item) => String(item.symbol || '').toUpperCase().endsWith('.TO'))
      .slice(0, 8)
      .map((item) => ({
        symbol: toTsxSymbol(item.symbol),
        displaySymbol: getDisplayTicker(item.displaySymbol || item.symbol),
        description: item.description || getDisplayTicker(item.symbol),
        exchange: 'TSX',
        currency: 'CAD',
      }))
  } catch (error) {
    console.error(`Error searching TSX stocks for ${query}:`, error)
    return []
  }
}
