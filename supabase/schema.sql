-- =============================================
-- TeaLedger Database Schema for Supabase
-- Run this in your Supabase SQL Editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PARTNERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'partner' CHECK (role IN ('admin', 'partner')),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  profit_share_percent NUMERIC(5,2) DEFAULT 25.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TEA GRADES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS tea_grades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default tea grades
INSERT INTO tea_grades (name, description, created_by) VALUES
  ('Premium Grade', 'Highest quality tea leaves', NULL),
  ('Standard Grade', 'Good quality standard tea', NULL),
  ('Regular Grade', 'Everyday tea for mass market', NULL),
  ('Special Grade', 'Special blend or variety', NULL)
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- PRODUCTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  brand_name TEXT,
  sku TEXT NOT NULL UNIQUE,
  tea_grade_id UUID REFERENCES tea_grades(id) ON DELETE RESTRICT NOT NULL,
  purchase_price_per_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price_per_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_stock_kg NUMERIC(12,3) DEFAULT 0,
  minimum_stock_kg NUMERIC(12,3) DEFAULT 10,
  weighted_avg_cost NUMERIC(12,2) DEFAULT 0,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SUPPLIERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  total_purchased NUMERIC(15,2) DEFAULT 0,
  total_paid NUMERIC(15,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CUSTOMERS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  alt_phone TEXT,
  address TEXT,
  area TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  total_purchased_amount NUMERIC(15,2) DEFAULT 0,
  total_paid_amount NUMERIC(15,2) DEFAULT 0,
  last_purchase_date DATE,
  last_payment_date DATE,
  created_by UUID REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PURCHASES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT NOT NULL UNIQUE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT NOT NULL,
  purchase_date DATE NOT NULL,
  total_amount NUMERIC(15,2) DEFAULT 0,
  transportation_cost NUMERIC(12,2) DEFAULT 0,
  packaging_cost NUMERIC(12,2) DEFAULT 0,
  other_costs NUMERIC(12,2) DEFAULT 0,
  total_landed_cost NUMERIC(15,2) DEFAULT 0,
  amount_paid NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PURCHASE ITEMS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT NOT NULL,
  quantity_kg NUMERIC(12,3) NOT NULL,
  price_per_kg NUMERIC(12,2) NOT NULL,
  total_amount NUMERIC(15,2) GENERATED ALWAYS AS (quantity_kg * price_per_kg) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SALES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT NOT NULL,
  sale_date DATE NOT NULL,
  total_amount NUMERIC(15,2) DEFAULT 0,
  discount NUMERIC(12,2) DEFAULT 0,
  final_amount NUMERIC(15,2) DEFAULT 0,
  paid_amount NUMERIC(15,2) DEFAULT 0,
  payment_method TEXT DEFAULT 'credit' CHECK (payment_method IN ('cash', 'credit', 'bkash', 'nagad', 'bank')),
  delivery_status TEXT DEFAULT 'delivered' CHECK (delivery_status IN ('pending', 'delivered', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SALE ITEMS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT NOT NULL,
  quantity_kg NUMERIC(12,3) NOT NULL,
  price_per_kg NUMERIC(12,2) NOT NULL,
  cost_per_kg NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(15,2) GENERATED ALWAYS AS (quantity_kg * price_per_kg) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PAYMENTS TABLE (Customer Payments)
-- =============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bkash', 'nagad', 'bank')),
  notes TEXT,
  created_by UUID REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SUPPLIER PAYMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS supplier_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT NOT NULL,
  purchase_id UUID REFERENCES purchases(id),
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bkash', 'nagad', 'bank')),
  notes TEXT,
  created_by UUID REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- EXPENSES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('transportation', 'packaging', 'salary', 'rent', 'marketing', 'electricity', 'other')),
  amount NUMERIC(12,2) NOT NULL,
  description TEXT NOT NULL,
  receipt_url TEXT,
  created_by UUID REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INVENTORY MOVEMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'adjustment', 'damaged')),
  quantity_kg NUMERIC(12,3) NOT NULL,
  reference_id UUID,
  notes TEXT,
  created_by UUID REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PARTNER INVESTMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS partner_investments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id UUID REFERENCES partners(id) ON DELETE RESTRICT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('initial', 'additional', 'withdrawal', 'profit')),
  amount NUMERIC(15,2) NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- NOTES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES partners(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ACTIVITY LOGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id UUID REFERENCES partners(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE tea_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is authenticated partner
CREATE OR REPLACE FUNCTION auth.is_partner()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM partners 
    WHERE user_id = auth.uid() AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies: All authenticated partners can access shared business data
CREATE POLICY "Partners can view all partners" ON partners FOR SELECT USING (auth.is_partner());
CREATE POLICY "Partners can update own profile" ON partners FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Partners can view tea grades" ON tea_grades FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view products" ON products FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view suppliers" ON suppliers FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view customers" ON customers FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view purchases" ON purchases FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view purchase items" ON purchase_items FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view sales" ON sales FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view sale items" ON sale_items FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view payments" ON payments FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view supplier payments" ON supplier_payments FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view expenses" ON expenses FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view inventory movements" ON inventory_movements FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view partner investments" ON partner_investments FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view notes" ON notes FOR ALL USING (auth.is_partner());
CREATE POLICY "Partners can view activity logs" ON activity_logs FOR SELECT USING (auth.is_partner());
CREATE POLICY "Partners can insert activity logs" ON activity_logs FOR INSERT WITH CHECK (auth.is_partner());

-- =============================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_partners_updated_at BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_tea_grades_updated_at BEFORE UPDATE ON tea_grades FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_purchases_updated_at BEFORE UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================
CREATE INDEX IF NOT EXISTS idx_partners_user_id ON partners(user_id);
CREATE INDEX IF NOT EXISTS idx_products_tea_grade ON products(tea_grade_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_partner ON activity_logs(partner_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
