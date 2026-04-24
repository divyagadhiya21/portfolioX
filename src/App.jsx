import './App.css'

const holdings = [
  { ticker: 'AAPL', qty: 12, avg: 189.3, ltp: 196.15 },
  { ticker: 'MSFT', qty: 5, avg: 401.9, ltp: 414.22 },
  { ticker: 'TSLA', qty: 8, avg: 172.45, ltp: 168.09 },
]

const alerts = [
  { ticker: 'NVDA', condition: 'Above', price: 950 },
  { ticker: 'AMZN', condition: 'Below', price: 180 },
]

function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PortfolioX</p>
          <h1>Stock Tracker & Trading Journal</h1>
        </div>
        <button type="button" className="primary-btn">+ Add Trade</button>
      </header>

      <section className="stats-grid" aria-label="Portfolio summary">
        <article className="card">
          <p>Total Value</p>
          <h2>$19,842.43</h2>
          <span className="chip positive">+2.48% today</span>
        </article>
        <article className="card">
          <p>Invested</p>
          <h2>$18,990.00</h2>
          <span className="chip neutral">3 open positions</span>
        </article>
        <article className="card">
          <p>Unrealized P&L</p>
          <h2>$852.43</h2>
          <span className="chip positive">+$412 this week</span>
        </article>
      </section>

      <section className="content-grid">
        <article className="card panel">
          <div className="panel-head">
            <h3>Holdings</h3>
            <small>Live prices every 60 sec</small>
          </div>
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Qty</th>
                <th>Avg</th>
                <th>LTP</th>
                <th>P&L</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const pnl = (h.ltp - h.avg) * h.qty
                const isUp = pnl >= 0
                return (
                  <tr key={h.ticker}>
                    <td>{h.ticker}</td>
                    <td>{h.qty}</td>
                    <td>${h.avg.toFixed(2)}</td>
                    <td>${h.ltp.toFixed(2)}</td>
                    <td className={isUp ? 'up' : 'down'}>
                      {isUp ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </article>

        <aside className="side-col">
          <article className="card panel">
            <div className="panel-head">
              <h3>Create Trade</h3>
              <small>UI scaffold</small>
            </div>
            <form className="trade-form" onSubmit={(e) => e.preventDefault()}>
              <label>
                Ticker
                <input type="text" placeholder="AAPL" />
              </label>
              <label>
                Quantity
                <input type="number" placeholder="10" />
              </label>
              <label>
                Price
                <input type="number" placeholder="190.25" step="0.01" />
              </label>
              <button type="submit" className="primary-btn">Save Trade</button>
            </form>
          </article>

          <article className="card panel">
            <div className="panel-head">
              <h3>Price Alerts</h3>
            </div>
            <ul className="alerts">
              {alerts.map((a) => (
                <li key={`${a.ticker}-${a.condition}`}>
                  <strong>{a.ticker}</strong> {a.condition} ${a.price}
                </li>
              ))}
            </ul>
          </article>
        </aside>
      </section>
    </main>
  )
}

export default App
