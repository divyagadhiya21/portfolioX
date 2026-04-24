import { useEffect, useMemo, useState } from 'react'
import './App.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const defaultForm = {
  stock: '',
  qty: '',
  price: '',
  type: 'buy',
  date: new Date().toISOString().slice(0, 10),
}

const toNumber = (v) => Number.parseFloat(v || 0)

function aggregateHoldings(trades) {
  const map = {}

  for (const t of trades) {
    const key = String(t.stock || '').toUpperCase()
    if (!key) continue

    if (!map[key]) {
      map[key] = {
        stock: key,
        boughtQty: 0,
        soldQty: 0,
        invested: 0,
      }
    }

    const qty = toNumber(t.qty)
    const price = toNumber(t.price)
    if (t.type === 'sell') {
      map[key].soldQty += qty
    } else {
      map[key].boughtQty += qty
      map[key].invested += qty * price
    }
  }

  return Object.values(map)
    .map((h) => {
      const heldQty = Math.max(0, h.boughtQty - h.soldQty)
      const avg = h.boughtQty > 0 ? h.invested / h.boughtQty : 0
      return {
        stock: h.stock,
        heldQty,
        avg,
      }
    })
    .filter((h) => h.heldQty > 0)
}

async function supabaseRequest(path, method = 'GET', body) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase env keys. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  const json = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message = json?.message || `Supabase request failed (${response.status})`
    throw new Error(message)
  }

  return json
}

function App() {
  const [trades, setTrades] = useState([])
  const [form, setForm] = useState(defaultForm)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const holdings = useMemo(() => aggregateHoldings(trades), [trades])

  const stats = useMemo(() => {
    const invested = trades
      .filter((t) => t.type !== 'sell')
      .reduce((sum, t) => sum + toNumber(t.qty) * toNumber(t.price), 0)

    const estimatedValue = holdings.reduce((sum, h) => sum + h.heldQty * h.avg, 0)

    return {
      invested,
      estimatedValue,
      positions: holdings.length,
    }
  }, [holdings, trades])

  const loadTrades = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await supabaseRequest('trades?select=*&order=date.desc')
      setTrades(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTrades()
    }, 0)

    return () => clearTimeout(timer)
  }, [])

  const onChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const resetForm = () => {
    setForm(defaultForm)
    setEditingId(null)
  }

  const saveTrade = async (event) => {
    event.preventDefault()

    if (!form.stock || !form.qty || !form.price || !form.date) {
      setError('Please fill stock, qty, price and date.')
      return
    }

    const payload = {
      stock: form.stock.toUpperCase().trim(),
      qty: toNumber(form.qty),
      price: toNumber(form.price),
      type: form.type,
      date: form.date,
    }

    try {
      setSaving(true)
      setError('')

      if (editingId) {
        const updated = await supabaseRequest(`trades?id=eq.${editingId}`, 'PATCH', payload)
        const updatedRow = updated?.[0]
        setTrades((prev) => prev.map((t) => (t.id === editingId ? updatedRow : t)))
      } else {
        const inserted = await supabaseRequest('trades', 'POST', payload)
        const insertedRow = inserted?.[0]
        setTrades((prev) => [insertedRow, ...prev])
      }

      resetForm()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const onEdit = (trade) => {
    setEditingId(trade.id)
    setForm({
      stock: trade.stock,
      qty: String(trade.qty),
      price: String(trade.price),
      type: trade.type,
      date: trade.date,
    })
  }

  const onDelete = async (id) => {
    try {
      setError('')
      await supabaseRequest(`trades?id=eq.${id}`, 'DELETE')
      setTrades((prev) => prev.filter((t) => t.id !== id))
      if (editingId === id) resetForm()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PortfolioX</p>
          <h1>Stock Tracker & Trading Journal</h1>
        </div>
      </header>

      <section className="stats-grid" aria-label="Portfolio summary">
        <article className="card">
          <p>Total Value (est.)</p>
          <h2>${stats.estimatedValue.toFixed(2)}</h2>
          <span className="chip neutral">From current saved trades</span>
        </article>
        <article className="card">
          <p>Invested</p>
          <h2>${stats.invested.toFixed(2)}</h2>
          <span className="chip neutral">Buy trades only</span>
        </article>
        <article className="card">
          <p>Open Positions</p>
          <h2>{stats.positions}</h2>
          <span className="chip neutral">First login shows 0</span>
        </article>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <section className="content-grid">
        <article className="card panel">
          <div className="panel-head">
            <h3>Holdings</h3>
            <small>{loading ? 'Loading...' : `${holdings.length} active`}</small>
          </div>

          {holdings.length === 0 ? (
            <p className="empty">No holdings yet. Add your first trade to get started.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Held Qty</th>
                  <th>Avg Buy</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.stock}>
                    <td>{h.stock}</td>
                    <td>{h.heldQty}</td>
                    <td>${h.avg.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        <article className="card panel">
          <div className="panel-head">
            <h3>{editingId ? 'Edit Trade' : 'Create Trade'}</h3>
            {editingId ? (
              <button type="button" className="ghost-btn" onClick={resetForm}>Cancel Edit</button>
            ) : null}
          </div>

          <form className="trade-form" onSubmit={saveTrade}>
            <label>
              Ticker
              <input name="stock" type="text" placeholder="AAPL" value={form.stock} onChange={onChange} />
            </label>
            <label>
              Quantity
              <input name="qty" type="number" placeholder="1" min="0.0001" step="0.0001" value={form.qty} onChange={onChange} />
            </label>
            <label>
              Price
              <input name="price" type="number" placeholder="200" min="0.0001" step="0.01" value={form.price} onChange={onChange} />
            </label>
            <label>
              Type
              <select name="type" value={form.type} onChange={onChange}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </label>
            <label>
              Date
              <input name="date" type="date" value={form.date} onChange={onChange} />
            </label>
            <button type="submit" className="primary-btn" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update Trade' : 'Save Trade'}
            </button>
          </form>
        </article>
      </section>

      <section className="card panel trade-list">
        <div className="panel-head">
          <h3>Trade History</h3>
        </div>

        {trades.length === 0 ? (
          <p className="empty">No entries yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <td>{t.stock}</td>
                  <td>{t.type}</td>
                  <td>{t.qty}</td>
                  <td>${toNumber(t.price).toFixed(2)}</td>
                  <td>{t.date}</td>
                  <td className="actions">
                    <button type="button" className="ghost-btn" onClick={() => onEdit(t)}>Edit</button>
                    <button type="button" className="danger-btn" onClick={() => onDelete(t.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}

export default App
