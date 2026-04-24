export const calcPortfolio = (trades, prices) => {
  const map = {};

  trades.forEach((t) => {
    if (!map[t.stock]) map[t.stock] = { ticker: t.stock, buys: [], sells: [] };
    if (t.type === 'buy') map[t.stock].buys.push(t);
    else map[t.stock].sells.push(t);
  });

  return Object.values(map).map((s) => {
    const price = prices[s.ticker] || 0;
    const totalBought = s.buys.reduce((a, b) => a + b.qty, 0);
    const totalSold = s.sells.reduce((a, b) => a + b.qty, 0);
    const heldQty = Math.max(0, totalBought - totalSold);
    const totalInvested = s.buys.reduce((a, b) => a + b.qty * b.price, 0);
    const avgBuy = totalBought > 0 ? totalInvested / totalBought : 0;
    const currentVal = heldQty * price;
    const investedHeld = heldQty * avgBuy;
    const unrealizedPnL = currentVal - investedHeld;
    const realizedPnL = s.sells.reduce((a, b) => a + b.qty * (price - b.price), 0);
    const pnlPct = investedHeld > 0 ? (unrealizedPnL / investedHeld) * 100 : 0;

    return {
      ...s,
      price,
      totalBought,
      totalSold,
      heldQty,
      totalInvested,
      avgBuy,
      currentVal,
      investedHeld,
      unrealizedPnL,
      realizedPnL,
      pnlPct,
    };
  });
};