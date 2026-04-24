import { supabase } from './supabase';

// ── Trades ──────────────────────────────────────
export const getTrades = async (userId) => {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
};

export const addTrade = async (trade) => {
  const { data, error } = await supabase
    .from('trades')
    .insert([trade])
    .select();
  if (error) throw error;
  return data[0];
};

export const updateTrade = async (id, updates) => {
  const { data, error } = await supabase
    .from('trades')
    .update(updates)
    .eq('id', id)
    .select();
  if (error) throw error;
  return data[0];
};

export const deleteTrade = async (id) => {
  const { error } = await supabase.from('trades').delete().eq('id', id);
  if (error) throw error;
};

// ── Alerts ──────────────────────────────────────
export const getAlerts = async (userId) => {
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data;
};

export const addAlert = async (alert) => {
  const { data, error } = await supabase
    .from('alerts')
    .insert([alert])
    .select();
  if (error) throw error;
  return data[0];
};

export const deleteAlert = async (id) => {
  const { error } = await supabase.from('alerts').delete().eq('id', id);
  if (error) throw error;
};