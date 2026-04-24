import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './services/supabase'
import { fetchMultiplePrices, fetchStockPrice, getDisplayTicker, searchCanadianStocks, toTsxSymbol } from './services/finnhub'

const MAX_DECIMAL_VALUE = 99999999

const defaultTradeForm = {
  stock: '',
  qty: '',
  price: '',
  type: 'buy',
  date: new Date().toISOString().slice(0, 10),
}

const defaultAuthForm = {
  email: '',
  password: '',
}

const currencyFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: '2-digit',
})

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

function toNumber(value) {
  return Number.parseFloat(value || 0)
}

function formatCurrency(value) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0)
}

function formatPercent(value) {
  return `${value >= 0 ? '+' : ''}${percentFormatter.format(Number.isFinite(value) ? value : 0)}%`
}

function formatQuantity(value) {
  return numberFormatter.format(Number.isFinite(value) ? value : 0)
}

function formatDate(value) {
  if (!value) return '--'
  return dateFormatter.format(new Date(value))
}

function getFriendlyErrorMessage(error) {
  const rawMessage = error?.message || ''
  const details = error?.details ? ` Details: ${error.details}` : ''
  const hint = error?.hint ? ` Hint: ${error.hint}` : ''
  const code = error?.code ? ` [${error.code}]` : ''

  if (rawMessage.toLowerCase().includes('invalid login credentials')) {
    return 'Invalid email or password. Use the Supabase user you created, or create a new account.'
  }

  if (rawMessage.toLowerCase().includes('email not confirmed')) {
    return 'Email confirmation is still required for this account. Confirm the user in Supabase Auth before signing in.'
  }

  if (rawMessage.toLowerCase().includes('permission denied')) {
    return `Supabase is still blocking this request.${code} ${rawMessage}${details}${hint}`.trim()
  }

  return `${rawMessage}${details}${hint}`.trim() || 'Something went wrong while talking to Supabase.'
}

function isValidDecimalInput(value) {
  if (value === '') return false
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return false

  const numericValue = Number(value)
  return numericValue >= 0 && numericValue <= MAX_DECIMAL_VALUE
}

function getStockInitials(stock) {
  return getDisplayTicker(stock).slice(0, 2).toUpperCase() || '--'
}

function getVisiblePageNumbers(currentPage, totalPages, maxVisible = 8) {
  const startPage = Math.floor((currentPage - 1) / maxVisible) * maxVisible + 1
  const endPage = Math.min(totalPages, startPage + maxVisible - 1)
  return Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index)
}

function buildChartPoints(stockData) {
  if (!stockData) return []

  const timeline = stockData.entries.map((entry, index) => ({
    label: entry.type === 'sell' ? `Sell ${index + 1}` : `Buy ${index + 1}`,
    value: entry.price,
  }))

  timeline.push({
    label: 'Now',
    value: stockData.currentPrice,
  })

  return timeline
}

function buildPortfolioModel(trades, pricesByStock) {
  const groupedTrades = trades.reduce((acc, trade) => {
    const stock = toTsxSymbol(trade.stock)
    if (!stock) return acc
    acc[stock] ||= []
    acc[stock].push({
      ...trade,
      stock,
      qty: toNumber(trade.qty),
      price: toNumber(trade.price),
    })
    return acc
  }, {})

  const stocks = Object.entries(groupedTrades).map(([stock, entries]) => {
    const sortedEntries = [...entries].sort((a, b) => {
      if (a.date === b.date) return String(a.id).localeCompare(String(b.id))
      return new Date(a.date) - new Date(b.date)
    })

    const market = pricesByStock[stock] || {}
    const fallbackPrice = sortedEntries.at(-1)?.price || 0
    const hasLivePrice = Number(market.current) > 0
    const currentPrice = hasLivePrice ? Number(market.current) : fallbackPrice
    const previousClose = Number(market.previousClose) > 0 ? Number(market.previousClose) : currentPrice

    const openLots = []
    const buyEntryMap = new Map()
    const tradeRows = []

    let realizedPnl = 0
    let soldQuantity = 0
    let boughtQuantity = 0

    for (const trade of sortedEntries) {
      if (trade.type === 'buy') {
        boughtQuantity += trade.qty

        const row = {
          ...trade,
          remainingQty: trade.qty,
          soldQty: 0,
          currentPrice,
          currentValue: 0,
          investedValue: 0,
          pnl: 0,
          pnlPercent: 0,
          costBasis: trade.qty * trade.price,
          status: 'active',
        }

        tradeRows.push(row)
        buyEntryMap.set(trade.id, row)
        openLots.push({
          tradeId: trade.id,
          remainingQty: trade.qty,
          buyPrice: trade.price,
        })
        continue
      }

      soldQuantity += trade.qty
      let sellRemaining = trade.qty
      let costBasis = 0

      while (sellRemaining > 0 && openLots.length > 0) {
        const lot = openLots[0]
        const consumedQty = Math.min(lot.remainingQty, sellRemaining)
        const buyRow = buyEntryMap.get(lot.tradeId)

        costBasis += consumedQty * lot.buyPrice
        lot.remainingQty -= consumedQty
        sellRemaining -= consumedQty

        if (buyRow) {
          buyRow.remainingQty = Math.max(0, buyRow.remainingQty - consumedQty)
          buyRow.soldQty += consumedQty
        }

        if (lot.remainingQty <= 0.0000001) {
          openLots.shift()
        }
      }

      const proceeds = trade.qty * trade.price
      const pnl = proceeds - costBasis
      realizedPnl += pnl

      tradeRows.push({
        ...trade,
        remainingQty: 0,
        soldQty: trade.qty,
        currentPrice,
        currentValue: proceeds,
        investedValue: proceeds,
        pnl,
        pnlPercent: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
        costBasis,
        status: 'sold',
      })
    }

    for (const row of tradeRows) {
      if (row.type !== 'buy') continue

      row.currentPrice = currentPrice
      row.investedValue = row.remainingQty * row.price
      row.currentValue = row.remainingQty * currentPrice
      row.pnl = row.currentValue - row.investedValue
      row.pnlPercent = row.investedValue > 0 ? (row.pnl / row.investedValue) * 100 : 0
      row.status = row.remainingQty > 0 ? 'active' : 'sold'
    }

    const sharesHeld = tradeRows
      .filter((row) => row.type === 'buy')
      .reduce((sum, row) => sum + row.remainingQty, 0)

    const activeInvested = tradeRows
      .filter((row) => row.type === 'buy')
      .reduce((sum, row) => sum + row.investedValue, 0)

    const currentValue = sharesHeld * currentPrice
    const unrealizedPnl = currentValue - activeInvested
    const totalPnl = unrealizedPnl + realizedPnl
    const avgBuyPrice = sharesHeld > 0 ? activeInvested / sharesHeld : 0
    const dailyPnl = sharesHeld * (currentPrice - previousClose)
    const dailyPnlPercent = previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0
    const activeEntries = tradeRows.filter((row) => row.status === 'active')
    const closedEntries = tradeRows.filter((row) => row.type === 'sell')
    const profitableClosedTrades = closedEntries.filter((row) => row.pnl > 0).length
    const winRate = closedEntries.length > 0 ? (profitableClosedTrades / closedEntries.length) * 100 : 0

    return {
      stock,
      displayStock: getDisplayTicker(stock),
      currentPrice,
      previousClose,
      hasLivePrice,
      entryCount: tradeRows.length,
      activeEntries: activeEntries.length,
      sharesHeld,
      activeInvested,
      currentValue,
      avgBuyPrice,
      realizedPnl,
      unrealizedPnl,
      totalPnl,
      totalBoughtQty: boughtQuantity,
      totalSoldQty: soldQuantity,
      dailyPnl,
      dailyPnlPercent,
      winRate,
      entries: tradeRows,
      chartPoints: buildChartPoints({
        entries: tradeRows,
        currentPrice,
      }),
    }
  })

  const sortedStocks = stocks.sort((a, b) => b.currentValue - a.currentValue)
  const totalInvested = sortedStocks.reduce((sum, stock) => sum + stock.activeInvested, 0)
  const currentValue = sortedStocks.reduce((sum, stock) => sum + stock.currentValue, 0)
  const realizedPnl = sortedStocks.reduce((sum, stock) => sum + stock.realizedPnl, 0)
  const unrealizedPnl = sortedStocks.reduce((sum, stock) => sum + stock.unrealizedPnl, 0)
  const totalPnl = realizedPnl + unrealizedPnl
  const dailyPnl = sortedStocks.reduce((sum, stock) => sum + stock.dailyPnl, 0)
  const totalShares = sortedStocks.reduce((sum, stock) => sum + stock.sharesHeld, 0)

  const enrichedStocks = sortedStocks.map((stock) => ({
    ...stock,
    allocationPercent: currentValue > 0 ? (stock.currentValue / currentValue) * 100 : 0,
  }))

  return {
    stocks: enrichedStocks,
    totals: {
      invested: totalInvested,
      currentValue,
      realizedPnl,
      unrealizedPnl,
      totalPnl,
      totalPnlPercent: totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0,
      dailyPnl,
      totalShares,
      positions: enrichedStocks.length,
    },
  }
}

function LineChart({ stockData }) {
  if (!stockData || stockData.chartPoints.length < 2) {
    return <p className="empty">Add more entries to unlock the stock detail chart.</p>
  }

  const width = 760
  const height = 220
  const padding = 24
  const points = stockData.chartPoints
  const values = points.map((point) => point.value)
  const min = Math.min(...values, stockData.avgBuyPrice || values[0])
  const max = Math.max(...values, stockData.avgBuyPrice || values[0])
  const valueRange = Math.max(max - min, 1)

  const coordinates = points.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1)
    const y = height - padding - ((point.value - min) / valueRange) * (height - padding * 2)
    return { ...point, x, y }
  })

  const path = coordinates.map((point) => `${point.x},${point.y}`).join(' ')
  const avgLineY = height - padding - ((stockData.avgBuyPrice - min) / valueRange) * (height - padding * 2)

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="line-chart" role="img" aria-label={`${stockData.stock} price timeline`}>
        <defs>
          <linearGradient id="priceArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(124, 92, 255, 0.35)" />
            <stop offset="100%" stopColor="rgba(124, 92, 255, 0)" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const y = padding + (height - padding * 2) * step
          return <line key={step} x1={padding} x2={width - padding} y1={y} y2={y} className="chart-grid-line" />
        })}
        <line x1={padding} x2={width - padding} y1={avgLineY} y2={avgLineY} className="chart-reference-line" />
        <polygon
          points={`${coordinates[0].x},${height - padding} ${path} ${coordinates.at(-1).x},${height - padding}`}
          className="chart-area"
        />
        <polyline points={path} className="chart-path" />
        {coordinates.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="4.5" className="chart-dot" />
          </g>
        ))}
      </svg>
      <div className="chart-axis">
        {points.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
    </div>
  )
}

function App() {
  const ENTRIES_PER_PAGE = 10
  const HISTORY_ENTRIES_PER_PAGE = 5
  const [user, setUser] = useState(null)
  const [authMode, setAuthMode] = useState('signIn')
  const [authForm, setAuthForm] = useState(defaultAuthForm)
  const [authLoading, setAuthLoading] = useState(true)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')

  const [trades, setTrades] = useState([])
  const [form, setForm] = useState(defaultTradeForm)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [selectedStock, setSelectedStock] = useState(null)
  const [activeTab, setActiveTab] = useState('portfolio')
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false)
  const [pricesByStock, setPricesByStock] = useState({})
  const [priceLoading, setPriceLoading] = useState(false)
  const [showStockSuggestions, setShowStockSuggestions] = useState(false)
  const [apiStockSuggestions, setApiStockSuggestions] = useState([])
  const [stockSearchLoading, setStockSearchLoading] = useState(false)
  const [detailPage, setDetailPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)
  const [stockPreviewPrice, setStockPreviewPrice] = useState(null)
  const [stockPreviewLoading, setStockPreviewLoading] = useState(false)

  const trackedStocks = useMemo(
    () => [...new Set(trades.map((trade) => toTsxSymbol(trade.stock)).filter(Boolean))],
    [trades],
  )
  const stockSuggestions = useMemo(() => {
    const query = form.stock.trim().toUpperCase()
    const localMatches = trackedStocks
      .filter((stock) => getDisplayTicker(stock).includes(query))
      .map((stock) => ({
        symbol: stock,
        displaySymbol: getDisplayTicker(stock),
        description: `${getDisplayTicker(stock)} saved in your portfolio`,
        exchange: 'TSX',
        currency: 'CAD',
        isSaved: true,
      }))

    const merged = [...localMatches]
    for (const result of apiStockSuggestions) {
      if (!merged.some((item) => item.symbol === result.symbol)) {
        merged.push({ ...result, isSaved: trackedStocks.includes(result.symbol) })
      }
    }

    return merged.slice(0, 8)
  }, [apiStockSuggestions, form.stock, trackedStocks])

  const portfolio = useMemo(() => buildPortfolioModel(trades, pricesByStock), [trades, pricesByStock])
  const historyEntries = useMemo(() => {
    return [...trades].sort((a, b) => {
      const dateCompare = new Date(b.date) - new Date(a.date)
      if (dateCompare !== 0) return dateCompare
      return String(b.id).localeCompare(String(a.id))
    })
  }, [trades])
  const totalHistoryPages = Math.max(1, Math.ceil(historyEntries.length / HISTORY_ENTRIES_PER_PAGE))
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages)
  const paginatedHistoryEntries = historyEntries.slice(
    (safeHistoryPage - 1) * HISTORY_ENTRIES_PER_PAGE,
    safeHistoryPage * HISTORY_ENTRIES_PER_PAGE,
  )
  const visibleHistoryPages = getVisiblePageNumbers(safeHistoryPage, totalHistoryPages)
  const effectiveSelectedStock = portfolio.stocks.some((stock) => stock.stock === selectedStock) ? selectedStock : null
  const selectedStockData = portfolio.stocks.find((stock) => stock.stock === effectiveSelectedStock) || null
  const detailEntries = useMemo(() => {
    if (!selectedStockData) return []

    return [...selectedStockData.entries].sort((a, b) => {
      const dateCompare = new Date(b.date) - new Date(a.date)
      if (dateCompare !== 0) return dateCompare
      return String(b.id).localeCompare(String(a.id))
    })
  }, [selectedStockData])
  const totalDetailPages = Math.max(1, Math.ceil(detailEntries.length / ENTRIES_PER_PAGE))
  const safeDetailPage = Math.min(detailPage, totalDetailPages)
  const paginatedDetailEntries = detailEntries.slice((safeDetailPage - 1) * ENTRIES_PER_PAGE, safeDetailPage * ENTRIES_PER_PAGE)
  const bestPerformer = portfolio.stocks.reduce((best, stock) => {
    if (!best || stock.totalPnl > best.totalPnl) return stock
    return best
  }, null)
  const worstPerformer = portfolio.stocks.reduce((worst, stock) => {
    if (!worst || stock.totalPnl < worst.totalPnl) return stock
    return worst
  }, null)

  useEffect(() => {
    let active = true

    async function restoreSession() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        if (!active) return

        setUser(data.session?.user ?? null)
      } catch (err) {
        console.error('Supabase session restore failed:', err)
        if (active) {
          setAuthError(getFriendlyErrorMessage(err))
        }
      } finally {
        if (active) {
          setAuthLoading(false)
        }
      }
    }

    void restoreSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setUser(nextSession?.user ?? null)
      setAuthLoading(false)
      setError('')
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadTrades() {
      if (!user) {
        setTrades([])
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        const { data, error: loadError } = await supabase
          .from('trades')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false })

        if (loadError) throw loadError
        if (!cancelled) {
          setTrades(Array.isArray(data) ? data : [])
          setHistoryPage(1)
        }
      } catch (err) {
        console.error('Supabase trades load failed:', err)
        if (!cancelled) {
          setError(getFriendlyErrorMessage(err))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadTrades()

    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    let cancelled = false

    async function loadPrices() {
      if (!trackedStocks.length) {
        setPricesByStock({})
        return
      }

      try {
        setPriceLoading(true)
        const nextPrices = await fetchMultiplePrices(trackedStocks)
        if (!cancelled) {
          setPricesByStock(nextPrices)
        }
      } catch (err) {
        console.error('Price fetch failed:', err)
      } finally {
        if (!cancelled) {
          setPriceLoading(false)
        }
      }
    }

    void loadPrices()

    return () => {
      cancelled = true
    }
  }, [trackedStocks])

  useEffect(() => {
    let cancelled = false

    async function loadStockSuggestions() {
      if (!isTradeModalOpen || !showStockSuggestions) {
        if (!cancelled) {
          setApiStockSuggestions([])
          setStockSearchLoading(false)
        }
        return
      }

      const query = form.stock.trim()
      if (!query) {
        if (!cancelled) {
          setApiStockSuggestions([])
          setStockSearchLoading(false)
        }
        return
      }

      try {
        setStockSearchLoading(true)
        const results = await searchCanadianStocks(query)
        if (!cancelled) {
          setApiStockSuggestions(results)
        }
      } catch (error) {
        console.error('TSX stock search failed:', error)
      } finally {
        if (!cancelled) {
          setStockSearchLoading(false)
        }
      }
    }

    void loadStockSuggestions()

    return () => {
      cancelled = true
    }
  }, [form.stock, isTradeModalOpen, showStockSuggestions])

  useEffect(() => {
    let cancelled = false

    async function loadPreviewPrice() {
      if (!isTradeModalOpen || !form.stock.trim()) {
        if (!cancelled) {
          setStockPreviewPrice(null)
          setStockPreviewLoading(false)
        }
        return
      }

      try {
        setStockPreviewLoading(true)
        const quote = await fetchStockPrice(form.stock.trim())
        if (!cancelled) {
          setStockPreviewPrice(Number(quote.current) > 0 ? quote.current : null)
        }
      } catch (error) {
        console.error('Preview price lookup failed:', error)
        if (!cancelled) {
          setStockPreviewPrice(null)
        }
      } finally {
        if (!cancelled) {
          setStockPreviewLoading(false)
        }
      }
    }

    void loadPreviewPrice()

    return () => {
      cancelled = true
    }
  }, [form.stock, isTradeModalOpen])

  const onAuthChange = (event) => {
    const { name, value } = event.target
    setAuthForm((prev) => ({ ...prev, [name]: value }))
  }

  const onTradeChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (name === 'stock') {
      setShowStockSuggestions(true)
    }
  }

  const resetTradeForm = (preferredStock = '') => {
    setForm({
      ...defaultTradeForm,
      stock: getDisplayTicker(preferredStock),
    })
    setEditingId(null)
  }

  const openTradeModal = (preferredStock = '') => {
    resetTradeForm(preferredStock)
    setError('')
    setShowStockSuggestions(false)
    setApiStockSuggestions([])
    setStockPreviewPrice(null)
    setIsTradeModalOpen(true)
  }

  const closeTradeModal = () => {
    setIsTradeModalOpen(false)
    setShowStockSuggestions(false)
    setApiStockSuggestions([])
    setStockPreviewPrice(null)
    resetTradeForm(selectedStock || '')
  }

  const selectStockSuggestion = (stock) => {
    setForm((prev) => ({ ...prev, stock: stock.displaySymbol }))
    setShowStockSuggestions(false)
  }

  const submitAuth = async (event) => {
    event.preventDefault()

    if (!authForm.email || !authForm.password) {
      setAuthError('Please enter both email and password.')
      return
    }

    try {
      setAuthSubmitting(true)
      setAuthError('')
      setAuthMessage('')

      if (authMode === 'signUp') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: authForm.email,
          password: authForm.password,
        })

        if (signUpError) throw signUpError

        setAuthMessage('Account created. If email confirmation is enabled, confirm the email and then sign in.')
        setAuthMode('signIn')
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: authForm.email,
          password: authForm.password,
        })

        if (signInError) throw signInError

        setAuthMessage('Signed in successfully.')
      }

      setAuthForm(defaultAuthForm)
    } catch (err) {
      console.error('Supabase auth submit failed:', err)
      setAuthError(getFriendlyErrorMessage(err))
    } finally {
      setAuthSubmitting(false)
    }
  }

  const signOut = async () => {
    try {
      setAuthError('')
      setAuthMessage('')
      setError('')
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
      setSelectedStock(null)
      closeTradeModal()
    } catch (err) {
      console.error('Supabase sign out failed:', err)
      setAuthError(getFriendlyErrorMessage(err))
    }
  }

  function getAvailableQuantityForSell(stock, excludeTradeId = null) {
    const stockModel = buildPortfolioModel(
      trades.filter((trade) => trade.id !== excludeTradeId),
      pricesByStock,
    ).stocks.find((item) => item.stock === stock)

    return stockModel?.sharesHeld || 0
  }

  const saveTrade = async (event) => {
    event.preventDefault()

    if (!user) {
      setError('Sign in first, then save a trade.')
      return
    }

    if (!form.stock || !form.qty || !form.price || !form.date) {
      setError('Please fill stock, qty, price and date.')
      return
    }

    if (!isValidDecimalInput(form.qty) || !isValidDecimalInput(form.price)) {
      setError('Quantity and price must be between 0 and 99999999, with up to 4 decimal places and no negative values.')
      return
    }

    const stock = toTsxSymbol(form.stock)
    const displayStock = getDisplayTicker(stock)
    const qty = toNumber(form.qty)
    const price = toNumber(form.price)

    if (form.type === 'sell') {
      const availableQty = getAvailableQuantityForSell(stock, editingId)
      if (qty > availableQty) {
        setError(`You only have ${formatQuantity(availableQty)} shares available to sell for ${displayStock}.`)
        return
      }
    }

    const payload = {
      stock,
      qty,
      price,
      type: form.type,
      date: form.date,
    }

    try {
      setSaving(true)
      setError('')

      if (editingId) {
        const { data, error: updateError } = await supabase
          .from('trades')
          .update(payload)
          .eq('id', editingId)
          .eq('user_id', user.id)
          .select()
          .single()

        if (updateError) throw updateError

        setTrades((prev) => prev.map((trade) => (trade.id === editingId ? data : trade)))
      } else {
        const { data, error: insertError } = await supabase
          .from('trades')
          .insert([{ ...payload, user_id: user.id }])
          .select()
          .single()

      if (insertError) throw insertError

        setTrades((prev) => [data, ...prev])
      }

      setSelectedStock(stock)
      setDetailPage(1)
      closeTradeModal()
    } catch (err) {
      console.error('Supabase save trade failed:', err)
      setError(getFriendlyErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const onEdit = (trade) => {
    setEditingId(trade.id)
    setForm({
      stock: getDisplayTicker(trade.stock),
      qty: String(trade.qty),
      price: String(trade.price),
      type: trade.type,
      date: trade.date,
    })
    setError('')
    setIsTradeModalOpen(true)
  }

  const onDelete = async (id) => {
    if (!user) return

    try {
      setError('')

      const { error: deleteError } = await supabase
        .from('trades')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)

      if (deleteError) throw deleteError

      setTrades((prev) => prev.filter((trade) => trade.id !== id))
      if (editingId === id) {
        closeTradeModal()
      }
    } catch (err) {
      console.error('Supabase delete trade failed:', err)
      setError(getFriendlyErrorMessage(err))
    }
  }

  const renderAuthPanel = () => (
    <section className="card panel auth-panel">
      <div className="panel-head">
        <div>
          <h3>{user ? 'Your session is ready' : authMode === 'signIn' ? 'Sign In' : 'Create Account'}</h3>
          <small>
            {user
              ? 'Trades sync instantly to your Supabase account and stay isolated per user.'
              : 'Use the Supabase user you created, or create a new account here.'}
          </small>
        </div>

        {!user ? (
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setAuthMode((prev) => (prev === 'signIn' ? 'signUp' : 'signIn'))
              setAuthError('')
              setAuthMessage('')
            }}
          >
            {authMode === 'signIn' ? 'Need an account?' : 'Have an account?'}
          </button>
        ) : (
          <button type="button" className="primary-btn" onClick={() => openTradeModal(selectedStock || '')}>
            Add Entry
          </button>
        )}
      </div>

      {authLoading ? (
        <p className="empty">Checking Supabase session...</p>
      ) : user ? (
        <div className="session-inline">
          <span className="status-badge status-active">Live sync enabled</span>
          <p className="empty">You can now create, edit, and delete only your own trades across devices.</p>
        </div>
      ) : (
        <form className="trade-form auth-form-grid" onSubmit={submitAuth}>
          <label>
            Email
            <input name="email" type="email" placeholder="divya1@test.email" value={authForm.email} onChange={onAuthChange} />
          </label>
          <label>
            Password
            <input name="password" type="password" placeholder="Enter password" value={authForm.password} onChange={onAuthChange} />
          </label>
          <button type="submit" className="primary-btn" disabled={authSubmitting}>
            {authSubmitting ? 'Please wait...' : authMode === 'signIn' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      )}

      {authError ? <p className="error">{authError}</p> : null}
      {authMessage ? <p className="success">{authMessage}</p> : null}
    </section>
  )

  const renderDashboard = () => (
    <>
      <section className="hero-strip">
        <article className="summary-segment">
          <p>Total Invested</p>
          <h2>{formatCurrency(portfolio.totals.invested)}</h2>
          <span>{portfolio.totals.positions} stocks</span>
        </article>
        <article className="summary-segment">
          <p>Current Value</p>
          <h2>{formatCurrency(portfolio.totals.currentValue)}</h2>
          <span>{priceLoading ? 'Refreshing live prices...' : `${formatQuantity(portfolio.totals.totalShares)} shares`}</span>
        </article>
        <article className="summary-segment">
          <p>Total P&amp;L</p>
          <h2 className={portfolio.totals.totalPnl >= 0 ? 'metric-positive' : 'metric-negative'}>
            {formatCurrency(portfolio.totals.totalPnl)}
          </h2>
          <span className={`pill ${portfolio.totals.totalPnl >= 0 ? 'pill-positive' : 'pill-negative'}`}>
            {formatPercent(portfolio.totals.totalPnlPercent)}
          </span>
        </article>
      </section>

      <section className="tab-row">
        {['portfolio', 'analytics', 'alerts', 'history'].map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tab-btn ${activeTab === tab ? 'tab-btn-active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </section>

      {activeTab === 'portfolio' ? (
        <>
          <section className="section-head">
            <div>
              <h3>Holdings</h3>
              <small>{priceLoading ? 'Refreshing market prices...' : loading ? 'Loading trades...' : `${portfolio.totals.positions} positions tracked`}</small>
            </div>
          </section>

          <section className="holdings-list">
            {!user ? (
              <article className="card panel">
                <p className="empty">Sign in to load your portfolio dashboard.</p>
              </article>
            ) : portfolio.stocks.length === 0 ? (
              <article className="card panel">
                <p className="empty">No holdings yet. Add your first entry to build the dashboard.</p>
              </article>
            ) : (
              portfolio.stocks.map((stock) => (
                <article key={stock.stock} className="stock-row card" onClick={() => {
                  setSelectedStock(stock.stock)
                  setDetailPage(1)
                }} role="button" tabIndex={0} onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedStock(stock.stock)
                    setDetailPage(1)
                  }
                }}>
                  <div className="stock-row-ident">
                    <span className="stock-avatar">{getStockInitials(stock.stock)}</span>
                    <div>
                      <h4>{stock.displayStock}</h4>
                      <p>{stock.entryCount} entries - WAP {formatCurrency(stock.avgBuyPrice)}</p>
                      {!stock.hasLivePrice ? <small className="warning-note">Live price unavailable, using last recorded price.</small> : null}
                    </div>
                  </div>
                  <div className="stock-metric">
                    <span>Qty Held</span>
                    <strong>{formatQuantity(stock.sharesHeld)}</strong>
                  </div>
                  <div className="stock-metric">
                    <span>Current Price</span>
                    <strong>{formatCurrency(stock.currentPrice)}</strong>
                  </div>
                  <div className="stock-metric">
                    <span>Invested</span>
                    <strong>{formatCurrency(stock.activeInvested)}</strong>
                  </div>
                  <div className="stock-metric">
                    <span>Unrealized P&amp;L</span>
                    <strong className={stock.unrealizedPnl >= 0 ? 'metric-positive' : 'metric-negative'}>
                      {formatCurrency(stock.unrealizedPnl)}
                    </strong>
                    <span className={`pill ${stock.unrealizedPnl >= 0 ? 'pill-positive' : 'pill-negative'}`}>
                      {formatPercent(stock.activeInvested > 0 ? (stock.unrealizedPnl / stock.activeInvested) * 100 : 0)}
                    </span>
                  </div>
                  <div className="stock-row-arrow">View</div>
                </article>
              ))
            )}
          </section>

        </>
      ) : null}

      {activeTab === 'analytics' ? (
        <section className="analytics-grid">
          <article className="card panel analytics-card">
            <p>Daily Change</p>
            <h3 className={portfolio.totals.dailyPnl >= 0 ? 'metric-positive' : 'metric-negative'}>
              {formatCurrency(portfolio.totals.dailyPnl)}
            </h3>
            <small>Based on latest market move vs previous close.</small>
          </article>
          <article className="card panel analytics-card">
            <p>Best Performer</p>
            <h3>{bestPerformer?.stock || '--'}</h3>
            <small>{bestPerformer ? formatCurrency(bestPerformer.totalPnl) : 'Add trades to calculate this.'}</small>
          </article>
          <article className="card panel analytics-card">
            <p>Worst Performer</p>
            <h3>{worstPerformer?.stock || '--'}</h3>
            <small>{worstPerformer ? formatCurrency(worstPerformer.totalPnl) : 'Add trades to calculate this.'}</small>
          </article>
          <article className="card panel analytics-card">
            <p>Win Rate</p>
            <h3>{formatPercent(portfolio.stocks.length ? portfolio.stocks.reduce((sum, stock) => sum + stock.winRate, 0) / portfolio.stocks.length : 0)}</h3>
            <small>Realized sell entries closed in profit.</small>
          </article>
          <article className="card panel allocation-panel">
            <div className="panel-head">
              <h3>Portfolio Allocation</h3>
              <small>Current value split by stock</small>
            </div>
            {portfolio.stocks.length === 0 ? (
              <p className="empty">Allocation appears after you add positions.</p>
            ) : (
              <div className="allocation-list">
                {portfolio.stocks.map((stock) => (
                  <div key={stock.stock} className="allocation-row">
                    <div className="allocation-label">
                      <strong>{stock.stock}</strong>
                      <span>{formatCurrency(stock.currentValue)}</span>
                    </div>
                    <div className="allocation-bar">
                      <span style={{ width: `${Math.max(stock.allocationPercent, 4)}%` }} />
                    </div>
                    <small>{formatPercent(stock.allocationPercent)}</small>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      ) : null}

      {activeTab === 'alerts' ? (
        <section className="card panel alerts-panel">
          <h3>Alerts</h3>
          <p className="empty">
            Price alerts, profit alerts, and loss-cut rules are the next backend-ready layer. Your grouped stock detail flow is now in place, so this tab can connect cleanly to a future Supabase `alerts` table.
          </p>
        </section>
      ) : null}

      {activeTab === 'history' ? (
        <section className="card panel ledger-panel">
          <div className="panel-head">
            <h3>Recent Transaction Log</h3>
            <small>{trades.length} total entries</small>
          </div>
          {!user ? (
            <p className="empty">Sign in to view your transaction log.</p>
          ) : trades.length === 0 ? (
            <p className="empty">No entries yet.</p>
          ) : (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Stock</th>
                      <th>Type</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedHistoryEntries.map((trade) => (
                      <tr key={trade.id}>
                        <td>{formatDate(trade.date)}</td>
                        <td>{getDisplayTicker(trade.stock)}</td>
                        <td>
                          <span className={`status-badge ${trade.type === 'buy' ? 'status-active' : 'status-sold'}`}>
                            {trade.type}
                          </span>
                        </td>
                        <td>{formatQuantity(toNumber(trade.qty))}</td>
                        <td>{formatCurrency(toNumber(trade.price))}</td>
                        <td className="actions">
                          <button type="button" className="ghost-btn" onClick={() => onEdit(trade)}>Edit</button>
                          <button type="button" className="danger-btn" onClick={() => onDelete(trade.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {historyEntries.length > HISTORY_ENTRIES_PER_PAGE ? (
                <div className="pagination-row">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                    disabled={safeHistoryPage === 1}
                  >
                    Prev
                  </button>
                  <div className="page-number-row">
                    {visibleHistoryPages.map((pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        className={`page-number-btn ${pageNumber === safeHistoryPage ? 'page-number-btn-active' : ''}`}
                        onClick={() => setHistoryPage(pageNumber)}
                      >
                        {pageNumber}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => setHistoryPage((page) => Math.min(totalHistoryPages, page + 1))}
                    disabled={safeHistoryPage === totalHistoryPages}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </>
  )

  const renderDetail = () => (
    <>
      <section className="breadcrumb-row">
        <button type="button" className="breadcrumb-link" onClick={() => {
          setSelectedStock(null)
          setDetailPage(1)
        }}>Dashboard</button>
        <span className="breadcrumb-sep">&gt;</span>
        <span>{selectedStockData.displayStock}</span>
        <button type="button" className="ghost-btn" onClick={() => {
          setSelectedStock(null)
          setDetailPage(1)
        }}>Back</button>
      </section>

      <section className="detail-hero">
        <div className="detail-title">
          <span className="stock-avatar stock-avatar-large">{getStockInitials(selectedStockData.stock)}</span>
          <div>
            <h2>{selectedStockData.displayStock}</h2>
            <p>{formatQuantity(selectedStockData.sharesHeld)} shares held - {selectedStockData.entryCount} entries</p>
          </div>
        </div>
        <div className="detail-actions">
          <button type="button" className="primary-btn" onClick={() => openTradeModal(selectedStockData.stock)}>Add Entry</button>
        </div>
      </section>

      <section className="detail-summary-grid">
        <article className="card panel">
          <p>Shares Held</p>
          <h3>{formatQuantity(selectedStockData.sharesHeld)}</h3>
        </article>
        <article className="card panel">
          <p>Avg Buy (WAP)</p>
          <h3>{formatCurrency(selectedStockData.avgBuyPrice)}</h3>
        </article>
        <article className="card panel">
          <p>Current Price</p>
          <h3>{formatCurrency(selectedStockData.currentPrice)}</h3>
          {!selectedStockData.hasLivePrice ? <small className="warning-note">Live feed unavailable for this symbol.</small> : null}
        </article>
        <article className="card panel">
          <p>Unrealized P&amp;L</p>
          <h3 className={selectedStockData.unrealizedPnl >= 0 ? 'metric-positive' : 'metric-negative'}>
            {formatCurrency(selectedStockData.unrealizedPnl)}
          </h3>
        </article>
      </section>

      <section className="card panel">
        <div className="panel-head">
          <h3>Price history</h3>
          <small>{selectedStockData.hasLivePrice ? 'Entry prices and live market snapshot' : 'Entry prices with fallback current value'}</small>
        </div>
        <LineChart stockData={selectedStockData} />
      </section>

      <section className="card panel">
        <div className="panel-head">
          <h3>Transaction log</h3>
          <small>{selectedStockData.entryCount} entries for {selectedStockData.displayStock}</small>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Buy Price</th>
                <th>Current</th>
                <th>P&amp;L</th>
                <th>P&amp;L %</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedDetailEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.date)}</td>
                  <td>
                    <span className={`status-badge ${entry.type === 'buy' ? 'status-active' : 'status-sold'}`}>
                      {entry.type}
                    </span>
                  </td>
                  <td>
                    {formatQuantity(entry.type === 'buy' ? entry.remainingQty || entry.qty : entry.qty)}
                    {entry.type === 'buy' && entry.soldQty > 0 ? <small className="subtle-line"> / sold {formatQuantity(entry.soldQty)}</small> : null}
                  </td>
                  <td>{formatCurrency(entry.price)}</td>
                  <td>{formatCurrency(entry.currentPrice)}</td>
                  <td className={entry.pnl >= 0 ? 'metric-positive' : 'metric-negative'}>{formatCurrency(entry.pnl)}</td>
                  <td className={entry.pnl >= 0 ? 'metric-positive' : 'metric-negative'}>{formatPercent(entry.pnlPercent)}</td>
                  <td>
                    <span className={`status-badge ${entry.status === 'active' ? 'status-active' : 'status-sold'}`}>
                      {entry.status === 'active' ? 'Active' : 'Sold'}
                    </span>
                  </td>
                  <td className="actions">
                    <button type="button" className="ghost-btn" onClick={() => onEdit(entry)}>Edit</button>
                    <button type="button" className="danger-btn" onClick={() => onDelete(entry.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {detailEntries.length > ENTRIES_PER_PAGE ? (
          <div className="pagination-row">
            <button type="button" className="ghost-btn" onClick={() => setDetailPage((page) => Math.max(1, page - 1))} disabled={safeDetailPage === 1}>
              Previous
            </button>
            <span className="pagination-copy">Page {safeDetailPage} of {totalDetailPages}</span>
            <button type="button" className="ghost-btn" onClick={() => setDetailPage((page) => Math.min(totalDetailPages, page + 1))} disabled={safeDetailPage === totalDetailPages}>
              Next
            </button>
          </div>
        ) : null}
      </section>
    </>
  )

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PortfolioX</p>
          <h1>Stock Tracker &amp; Trading Journal</h1>
          <p className="build-tag">Build marker: 2026-04-24</p>
        </div>

        {user ? (
          <div className="session-card">
            <p className="session-label">Signed in as</p>
            <strong>{user.email}</strong>
            <button type="button" className="ghost-btn" onClick={signOut}>Sign Out</button>
          </div>
        ) : null}
      </header>

      {renderAuthPanel()}

      {error ? <p className="error">{error}</p> : null}

      {selectedStockData ? renderDetail() : renderDashboard()}

      {isTradeModalOpen ? (
        <div className="modal-backdrop" onClick={closeTradeModal}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-head">
              <div>
                <h3>{editingId ? 'Update Entry' : 'Add Entry'}</h3>
                <small>Buy and sell entries are grouped automatically inside the dashboard and stock detail view.</small>
              </div>
              <button type="button" className="ghost-btn" onClick={closeTradeModal}>Close</button>
            </div>

            <form className="trade-form modal-form" onSubmit={saveTrade}>
              <label>
                Stock Name
                <div className="stock-input-wrap">
                  <input
                    name="stock"
                    type="text"
                    placeholder="Search TSX stock, e.g. MDA"
                    value={form.stock}
                    onChange={onTradeChange}
                    onFocus={() => setShowStockSuggestions(true)}
                    onBlur={() => {
                      setTimeout(() => {
                        setShowStockSuggestions(false)
                      }, 120)
                    }}
                    autoComplete="off"
                    disabled={saving}
                  />
                  {showStockSuggestions && stockSuggestions.length > 0 ? (
                    <div className="stock-suggestion-list">
                      {stockSuggestions.map((stock) => (
                        <button
                          key={stock.symbol}
                          type="button"
                          className="stock-suggestion-item"
                          onMouseDown={() => selectStockSuggestion(stock)}
                        >
                          <div className="stock-suggestion-copy">
                            <span>{stock.displaySymbol}</span>
                            <small>{stock.description}</small>
                          </div>
                          <small>{stock.isSaved ? 'Saved' : `${stock.exchange} · ${stock.currency}`}</small>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {showStockSuggestions && stockSearchLoading ? (
                    <div className="stock-suggestion-state">Searching TSX symbols...</div>
                  ) : null}
                  {showStockSuggestions && !stockSearchLoading && form.stock.trim() && stockSuggestions.length === 0 ? (
                    <div className="stock-suggestion-state">No TSX symbol found. Try another Canadian ticker.</div>
                  ) : null}
                </div>
                {form.stock.trim() ? (
                  <small className="field-helper">
                    {stockPreviewLoading
                      ? 'Fetching live TSX price...'
                      : stockPreviewPrice !== null
                        ? `Live price preview: ${formatCurrency(stockPreviewPrice)}`
                        : 'No live quote found yet for this TSX symbol.'}
                  </small>
                ) : null}
              </label>
              <label>
                Quantity
                <input name="qty" type="number" placeholder="1" min="0" max={MAX_DECIMAL_VALUE} step="0.0001" value={form.qty} onChange={onTradeChange} disabled={saving} />
              </label>
              <label>
                Buy Price
                <input name="price" type="number" placeholder="200" min="0" max={MAX_DECIMAL_VALUE} step="0.0001" value={form.price} onChange={onTradeChange} disabled={saving} />
              </label>
              <label>
                Date
                <input name="date" type="date" value={form.date} onChange={onTradeChange} disabled={saving} />
              </label>
              <label>
                Transaction Type
                <select name="type" value={form.type} onChange={onTradeChange} disabled={saving}>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </label>
              <div className="modal-actions">
                <button type="submit" className="primary-btn" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Update Entry' : 'Save Entry'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
