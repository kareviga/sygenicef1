const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const db = {
  // ── Settings ──────────────────────────────────────────────────────────────
  async getSetting(key) {
    const { data } = await supabase.from('settings').select('value').eq('key', key).single();
    return data?.value ?? null;
  },
  async setSetting(key, value) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value: String(value) }, { onConflict: 'key' });
    if (error) throw error;
  },
  async allSettings() {
    const { data, error } = await supabase.from('settings').select('*');
    if (error) throw error;
    return Object.fromEntries((data || []).map(r => [r.key, r.value]));
  },

  // ── Table ops ─────────────────────────────────────────────────────────────
  async all(table) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    return data || [];
  },
  async find(table, pred) {
    const rows = await db.all(table);
    return rows.filter(pred);
  },
  async findOne(table, pred) {
    const rows = await db.all(table);
    return rows.find(pred) ?? null;
  },
  async count(table) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  },

  async insert(table, obj) {
    const { data, error } = await supabase.from(table).insert(obj).select().single();
    if (error) throw error;
    return data;
  },

  // Upsert by a single key field (e.g. user_picks keyed on user_id)
  async upsert(table, keyField, keyValue, data) {
    const { error } = await supabase
      .from(table)
      .upsert({ [keyField]: keyValue, ...data }, { onConflict: keyField });
    if (error) throw error;
  },

  // Upsert by composite unique constraint — table name determines conflict columns
  async upsertBy(table, _pred, data) {
    const conflictMap = {
      race_results: 'race_id,driver_id',
      user_race_scores: 'user_id,race_id',
    };
    const onConflict = conflictMap[table];
    if (onConflict) {
      const { error } = await supabase.from(table).upsert(data, { onConflict });
      if (error) throw error;
    } else {
      const { error } = await supabase.from(table).insert(data);
      if (error) throw error;
    }
  },

  async update(table, pred, updates) {
    const rows = await db.find(table, pred);
    for (const row of rows) {
      const pk = row.id
        ? supabase.from(table).update(updates).eq('id', row.id)
        : row.user_id
          ? supabase.from(table).update(updates).eq('user_id', row.user_id)
          : null;
      if (pk) {
        const { error } = await pk;
        if (error) throw error;
      }
    }
    return rows.length;
  },

  async delete(table, pred) {
    const rows = await db.find(table, pred);
    if (rows.length === 0) return 0;
    const ids = rows.filter(r => r.id).map(r => r.id);
    if (ids.length > 0) {
      const { error } = await supabase.from(table).delete().in('id', ids);
      if (error) throw error;
    }
    const userIds = rows.filter(r => !r.id && r.user_id).map(r => r.user_id);
    if (userIds.length > 0) {
      const { error } = await supabase.from(table).delete().in('user_id', userIds);
      if (error) throw error;
    }
    return rows.length;
  },
};

module.exports = db;
