export const fmtINR = (n) =>
  '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export const fmtPct = (n) =>
  (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%';

export const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: '2-digit'
  });

export const initials = (s) => s.slice(0, 2).toUpperCase();

export const COLORS = [
  '#7c5cff', '#00d68f', '#4d9fff', '#ffb347',
  '#ff4d6d', '#00c2e0', '#ff8c69', '#c084fc'
];

const colorMap = {};
let colorIdx = 0;
export const getColor = (ticker) => {
  if (!colorMap[ticker]) {
    colorMap[ticker] = COLORS[colorIdx % COLORS.length];
    colorIdx++;
  }
  return colorMap[ticker];
};