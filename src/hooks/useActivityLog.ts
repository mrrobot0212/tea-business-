import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

/**
 * Custom hook that provides a `logActivity` helper.
 * Inserts a row into activity_logs tied to the currently authenticated partner.
 */
export function useActivityLog() {
  const { partner } = useAuth()

  async function logActivity(
    action: string,
    tableName: string,
    recordId?: string,
    oldValues?: Record<string, unknown> | null,
    newValues?: Record<string, unknown> | null,
  ): Promise<void> {
    if (!partner) return

    await supabase.from('activity_logs').insert({
      partner_id: partner.id,
      action,
      table_name: tableName,
      record_id: recordId ?? null,
      old_values: oldValues ?? null,
      new_values: newValues ?? null,
    })
  }

  return { logActivity }
}
