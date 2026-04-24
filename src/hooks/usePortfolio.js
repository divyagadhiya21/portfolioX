import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import {
  getTrades, addTrade, updateTrade,
  deleteTrade, getAlerts, addAlert, deleteAlert
} from '../services/portfolio';

export const usePortfolio = () => {
  const [trades, setTrades] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  // Load data when user logs in
  useEffect(() => {
    let cancelled = false;

    async function loadPortfolio() {
      if (!user) {
        setTrades([]);
        setAlerts([]);
        return;
      }

      try {
        const [nextTrades, nextAlerts] = await Promise.all([
          getTrades(user.id),
          getAlerts(user.id),
        ]);

        if (!cancelled) {
          setTrades(nextTrades);
          setAlerts(nextAlerts);
        }
      } catch (error) {
        console.error(error);
      }
    }

    void loadPortfolio();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleAddTrade = async (trade) => {
    const newTrade = await addTrade({ ...trade, user_id: user.id });
    setTrades((prev) => [newTrade, ...prev]);
  };

  const handleUpdateTrade = async (id, updates) => {
    const updated = await updateTrade(id, updates);
    setTrades((prev) => prev.map((t) => (t.id === id ? updated : t)));
  };

  const handleDeleteTrade = async (id) => {
    await deleteTrade(id);
    setTrades((prev) => prev.filter((t) => t.id !== id));
  };

  const handleAddAlert = async (alert) => {
    const newAlert = await addAlert({ ...alert, user_id: user.id });
    setAlerts((prev) => [...prev, newAlert]);
  };

  const handleDeleteAlert = async (id) => {
    await deleteAlert(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return {
    user, trades, alerts, loading,
    addTrade: handleAddTrade,
    updateTrade: handleUpdateTrade,
    deleteTrade: handleDeleteTrade,
    addAlert: handleAddAlert,
    deleteAlert: handleDeleteAlert,
  };
};
