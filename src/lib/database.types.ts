export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      partners: {
        Row: {
          id: string
          user_id: string
          name: string
          email: string
          phone: string | null
          role: 'admin' | 'partner'
          avatar_url: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          email: string
          phone?: string | null
          role?: 'admin' | 'partner'
          avatar_url?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          email?: string
          phone?: string | null
          role?: 'admin' | 'partner'
          avatar_url?: string | null
          is_active?: boolean
          updated_at?: string
        }
      }
      tea_grades: {
        Row: {
          id: string
          name: string
          description: string | null
          is_active: boolean
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          is_active?: boolean
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          is_active?: boolean
          updated_at?: string
        }
      }
      products: {
        Row: {
          id: string
          name: string
          brand_name: string | null
          sku: string
          tea_grade_id: string
          purchase_price_per_kg: number
          selling_price_per_kg: number
          current_stock_kg: number
          minimum_stock_kg: number
          description: string | null
          is_active: boolean
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          brand_name?: string | null
          sku: string
          tea_grade_id: string
          purchase_price_per_kg: number
          selling_price_per_kg: number
          current_stock_kg?: number
          minimum_stock_kg?: number
          description?: string | null
          is_active?: boolean
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          brand_name?: string | null
          sku?: string
          tea_grade_id?: string
          purchase_price_per_kg?: number
          selling_price_per_kg?: number
          current_stock_kg?: number
          minimum_stock_kg?: number
          description?: string | null
          is_active?: boolean
          updated_at?: string
        }
      }
      suppliers: {
        Row: {
          id: string
          name: string
          contact_person: string | null
          phone: string | null
          address: string | null
          notes: string | null
          total_purchased: number
          total_paid: number
          is_active: boolean
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          contact_person?: string | null
          phone?: string | null
          address?: string | null
          notes?: string | null
          total_purchased?: number
          total_paid?: number
          is_active?: boolean
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          contact_person?: string | null
          phone?: string | null
          address?: string | null
          notes?: string | null
          total_purchased?: number
          total_paid?: number
          is_active?: boolean
          updated_at?: string
        }
      }
      customers: {
        Row: {
          id: string
          shop_name: string
          owner_name: string
          phone: string
          alt_phone: string | null
          address: string | null
          area: string | null
          notes: string | null
          status: 'active' | 'inactive'
          total_purchased_amount: number
          total_paid_amount: number
          last_purchase_date: string | null
          last_payment_date: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          shop_name: string
          owner_name: string
          phone: string
          alt_phone?: string | null
          address?: string | null
          area?: string | null
          notes?: string | null
          status?: 'active' | 'inactive'
          total_purchased_amount?: number
          total_paid_amount?: number
          last_purchase_date?: string | null
          last_payment_date?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          shop_name?: string
          owner_name?: string
          phone?: string
          alt_phone?: string | null
          address?: string | null
          area?: string | null
          notes?: string | null
          status?: 'active' | 'inactive'
          total_purchased_amount?: number
          total_paid_amount?: number
          last_purchase_date?: string | null
          last_payment_date?: string | null
          updated_at?: string
        }
      }
      purchases: {
        Row: {
          id: string
          invoice_number: string
          supplier_id: string
          purchase_date: string
          total_amount: number
          transportation_cost: number
          packaging_cost: number
          other_costs: number
          total_landed_cost: number
          amount_paid: number
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          invoice_number: string
          supplier_id: string
          purchase_date: string
          total_amount?: number
          transportation_cost?: number
          packaging_cost?: number
          other_costs?: number
          total_landed_cost?: number
          amount_paid?: number
          notes?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          invoice_number?: string
          supplier_id?: string
          purchase_date?: string
          total_amount?: number
          transportation_cost?: number
          packaging_cost?: number
          other_costs?: number
          total_landed_cost?: number
          amount_paid?: number
          notes?: string | null
          updated_at?: string
        }
      }
      purchase_items: {
        Row: {
          id: string
          purchase_id: string
          product_id: string
          quantity_kg: number
          price_per_kg: number
          total_amount: number
          created_at: string
        }
        Insert: {
          id?: string
          purchase_id: string
          product_id: string
          quantity_kg: number
          price_per_kg: number
          total_amount?: number
          created_at?: string
        }
        Update: {
          id?: string
          purchase_id?: string
          product_id?: string
          quantity_kg?: number
          price_per_kg?: number
          total_amount?: number
        }
      }
      sales: {
        Row: {
          id: string
          invoice_number: string
          customer_id: string
          sale_date: string
          total_amount: number
          discount: number
          final_amount: number
          paid_amount: number
          payment_method: 'cash' | 'credit' | 'bkash' | 'nagad' | 'bank'
          delivery_status: 'pending' | 'delivered' | 'cancelled'
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          invoice_number: string
          customer_id: string
          sale_date: string
          total_amount?: number
          discount?: number
          final_amount?: number
          paid_amount?: number
          payment_method?: 'cash' | 'credit' | 'bkash' | 'nagad' | 'bank'
          delivery_status?: 'pending' | 'delivered' | 'cancelled'
          notes?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          invoice_number?: string
          customer_id?: string
          sale_date?: string
          total_amount?: number
          discount?: number
          final_amount?: number
          paid_amount?: number
          payment_method?: 'cash' | 'credit' | 'bkash' | 'nagad' | 'bank'
          delivery_status?: 'pending' | 'delivered' | 'cancelled'
          notes?: string | null
          updated_at?: string
        }
      }
      sale_items: {
        Row: {
          id: string
          sale_id: string
          product_id: string
          quantity_kg: number
          price_per_kg: number
          cost_per_kg: number
          total_amount: number
          created_at: string
        }
        Insert: {
          id?: string
          sale_id: string
          product_id: string
          quantity_kg: number
          price_per_kg: number
          cost_per_kg?: number
          total_amount?: number
          created_at?: string
        }
        Update: {
          id?: string
          sale_id?: string
          product_id?: string
          quantity_kg?: number
          price_per_kg?: number
          cost_per_kg?: number
          total_amount?: number
        }
      }
      payments: {
        Row: {
          id: string
          customer_id: string
          amount: number
          payment_date: string
          payment_method: 'cash' | 'bkash' | 'nagad' | 'bank'
          notes: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          amount: number
          payment_date: string
          payment_method?: 'cash' | 'bkash' | 'nagad' | 'bank'
          notes?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          amount?: number
          payment_date?: string
          payment_method?: 'cash' | 'bkash' | 'nagad' | 'bank'
          notes?: string | null
        }
      }
      expenses: {
        Row: {
          id: string
          date: string
          category: string
          amount: number
          description: string
          receipt_url: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          date: string
          category: string
          amount: number
          description: string
          receipt_url?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          date?: string
          category?: string
          amount?: number
          description?: string
          receipt_url?: string | null
          updated_at?: string
        }
      }
      inventory_movements: {
        Row: {
          id: string
          product_id: string
          movement_type: 'purchase' | 'sale' | 'adjustment' | 'damaged'
          quantity_kg: number
          reference_id: string | null
          notes: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          movement_type: 'purchase' | 'sale' | 'adjustment' | 'damaged'
          quantity_kg: number
          reference_id?: string | null
          notes?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          movement_type?: 'purchase' | 'sale' | 'adjustment' | 'damaged'
          quantity_kg?: number
          reference_id?: string | null
          notes?: string | null
        }
      }
      partner_investments: {
        Row: {
          id: string
          partner_id: string
          type: 'initial' | 'additional' | 'withdrawal' | 'profit'
          amount: number
          date: string
          notes: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          partner_id: string
          type: 'initial' | 'additional' | 'withdrawal' | 'profit'
          amount: number
          date: string
          notes?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          partner_id?: string
          type?: 'initial' | 'additional' | 'withdrawal' | 'profit'
          amount?: number
          date?: string
          notes?: string | null
        }
      }
      notes: {
        Row: {
          id: string
          title: string
          content: string
          is_pinned: boolean
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          content: string
          is_pinned?: boolean
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          content?: string
          is_pinned?: boolean
          updated_at?: string
        }
      }
      activity_logs: {
        Row: {
          id: string
          partner_id: string
          action: string
          table_name: string
          record_id: string | null
          old_values: Json | null
          new_values: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          partner_id: string
          action: string
          table_name: string
          record_id?: string | null
          old_values?: Json | null
          new_values?: Json | null
          created_at?: string
        }
        Update: never
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
