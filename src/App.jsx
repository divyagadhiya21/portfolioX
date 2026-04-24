import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './services/supabase'

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

const toNumber = (value) => Number.parseFloat(value || 0)

function aggregateHoldings(trades) {
  const map = {}

  for (const trade of trades) {
    const key = String(trade.stock || '').toUpperCase()
    if (!key) continue

    if (!map[key]) {
      map[key] = {
        stock: key,
        boughtQty: 0,
        soldQty: 0,
        invested: 0,
      }
    }

    const qty = toNumber(trade.qty)
    const price = toNumber(trade.price)

    if (trade.type === 'sell') {
      map[key].soldQty += qty
    } else {
      map[key].boughtQty += qty
      map[key].invested += qty * price
    }
  }

  return Object.values(map)
    .map((holding) => {
      const heldQty = Math.max(0, holding.boughtQty - holding.soldQty)
      const avg = holding.boughtQty > 0 ? holding.invested / holding.boughtQty : 0

      return {
        stock: holding.stock,
        heldQty,
        avg,
      }
    })
    .filter((holding) => holding.heldQty > 0)
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

function App() {
  const [session, setSession] = useState(null)
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

  const holdings = useMemo(() => aggregateHoldings(trades), [trades])

  const stats = useMemo(() => {
    const invested = trades
      .filter((trade) => trade.type !== 'sell')
      .reduce((sum, trade) => sum + toNumber(trade.qty) * toNumber(trade.price), 0)

    const estimatedValue = holdings.reduce((sum, holding) => sum + holding.heldQty * holding.avg, 0)

    return {
      invested,
      estimatedValue,
      positions: holdings.length,
    }
  }, [holdings, trades])

  useEffect(() => {
    let active = true

    async function restoreSession() {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        if (!active) return

        const nextSession = data.session
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
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
      setSession(nextSession)
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

  const onAuthChange = (event) => {
    const { name, value } = event.target
    setAuthForm((prev) => ({ ...prev, [name]: value }))
  }

  const onTradeChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const resetTradeForm = () => {
    setForm(defaultTradeForm)
    setEditingId(null)
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
      resetTradeForm()
    } catch (err) {
      console.error('Supabase sign out failed:', err)
      setAuthError(getFriendlyErrorMessage(err))
    }
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

      resetTradeForm()
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
      stock: trade.stock,
      qty: String(trade.qty),
      price: String(trade.price),
      type: trade.type,
      date: trade.date,
    })
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
      if (editingId === id) resetTradeForm()
    } catch (err) {
      console.error('Supabase delete trade failed:', err)
      setError(getFriendlyErrorMessage(err))
    }
  }

  const tradeFormDisabled = !user || saving

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PortfolioX</p>
          <h1>Stock Tracker & Trading Journal</h1>
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

      <section className="card panel auth-panel">
        <div className="panel-head">
          <div>
            <h3>{user ? 'Your session is ready' : authMode === 'signIn' ? 'Sign In' : 'Create Account'}</h3>
            <small>
              {user
                ? 'Trades will be saved under the authenticated Supabase user.'
                : 'Use the email user you created in Supabase, or create a new one here.'}
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
          ) : null}
        </div>

        {authLoading ? (
          <p className="empty">Checking Supabase session...</p>
        ) : user ? (
          <p className="empty">You can now create, edit, and delete only your own trades.</p>
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
          <span className="chip neutral">{session ? 'Scoped to your account' : 'Sign in to load trades'}</span>
        </article>
      </section>

      {error ? <p className="error">{error}</p> : null}

      <section className="content-grid">
        <article className="card panel">
          <div className="panel-head">
            <h3>Holdings</h3>
            <small>{loading ? 'Loading...' : `${holdings.length} active`}</small>
          </div>

          {!user ? (
            <p className="empty">Sign in to load your holdings.</p>
          ) : holdings.length === 0 ? (
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
                {holdings.map((holding) => (
                  <tr key={holding.stock}>
                    <td>{holding.stock}</td>
                    <td>{holding.heldQty}</td>
                    <td>${holding.avg.toFixed(2)}</td>
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
              <button type="button" className="ghost-btn" onClick={resetTradeForm}>Cancel Edit</button>
            ) : null}
          </div>

          <form className="trade-form" onSubmit={saveTrade}>
            <label>
              Ticker
              <input name="stock" type="text" placeholder="AAPL" value={form.stock} onChange={onTradeChange} disabled={tradeFormDisabled} />
            </label>
            <label>
              Quantity
              <input name="qty" type="number" placeholder="1" min="0" max={MAX_DECIMAL_VALUE} step="0.0001" value={form.qty} onChange={onTradeChange} disabled={tradeFormDisabled} />
            </label>
            <label>
              Price
              <input name="price" type="number" placeholder="200" min="0" max={MAX_DECIMAL_VALUE} step="0.0001" value={form.price} onChange={onTradeChange} disabled={tradeFormDisabled} />
            </label>
            <label>
              Type
              <select name="type" value={form.type} onChange={onTradeChange} disabled={tradeFormDisabled}>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </label>
            <label>
              Date
              <input name="date" type="date" value={form.date} onChange={onTradeChange} disabled={tradeFormDisabled} />
            </label>
            <button type="submit" className="primary-btn" disabled={tradeFormDisabled}>
              {!user ? 'Sign In To Save' : saving ? 'Saving...' : editingId ? 'Update Trade' : 'Save Trade'}
            </button>
          </form>
        </article>
      </section>

      <section className="card panel trade-list">
        <div className="panel-head">
          <h3>Trade History</h3>
        </div>

        {!user ? (
          <p className="empty">Sign in to view your trade history.</p>
        ) : trades.length === 0 ? (
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
              {trades.map((trade) => (
                <tr key={trade.id}>
                  <td>{trade.stock}</td>
                  <td>{trade.type}</td>
                  <td>{trade.qty}</td>
                  <td>${toNumber(trade.price).toFixed(2)}</td>
                  <td>{trade.date}</td>
                  <td className="actions">
                    <button type="button" className="ghost-btn" onClick={() => onEdit(trade)}>Edit</button>
                    <button type="button" className="danger-btn" onClick={() => onDelete(trade.id)}>Delete</button>
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
