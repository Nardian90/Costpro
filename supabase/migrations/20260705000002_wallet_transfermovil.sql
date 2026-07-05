-- ============================================================================
-- Wallet Digital — Tablas para datos de Transfermovil
-- ============================================================================
-- Almacena cuentas y transacciones descifradas de respaldos .trm
-- ============================================================================

-- Tabla: wallet_accounts
CREATE TABLE IF NOT EXISTS public.wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'CuentaBanco', -- CuentaBanco, MCBank, Nauta
  bank TEXT NOT NULL DEFAULT 'DESCONOCIDO', -- BPA, BANDEC, METRO
  account_number TEXT, -- número enmascarado ****1234
  account_full TEXT, -- número completo descifrado (solo server-side)
  description TEXT,
  movil TEXT,
  tipo_cuenta INTEGER,
  current_balance NUMERIC(14,2) DEFAULT 0,
  last_balance_date TEXT,
  currency TEXT DEFAULT 'CUP',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, source, account_number)
);

-- Tabla: wallet_transactions
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trm_transaction_id TEXT, -- idTransaccion del .trm
  date TEXT NOT NULL, -- YYYY-MM-DD
  bank TEXT NOT NULL DEFAULT 'DESCONOCIDO',
  card TEXT, -- ****1234
  operation TEXT NOT NULL, -- CR o DB
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT DEFAULT 'CUP',
  service TEXT, -- Transferencia, Recarga, Pago...
  service_type TEXT, -- BancoBANDEC, EtecsaRecarga...
  category TEXT DEFAULT 'Otros',
  manual_category TEXT, -- override manual del usuario
  counterparty TEXT,
  note TEXT,
  balance_after NUMERIC(14,2),
  is_statement BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, trm_transaction_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_user ON public.wallet_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_bank ON public.wallet_accounts(bank);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_date ON public.wallet_transactions(date);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_bank ON public.wallet_transactions(bank);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_category ON public.wallet_transactions(category);

-- RLS
ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wallet accounts" ON public.wallet_accounts;
CREATE POLICY "Users can view own wallet accounts"
  ON public.wallet_accounts FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own wallet accounts" ON public.wallet_accounts;
CREATE POLICY "Users can insert own wallet accounts"
  ON public.wallet_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own wallet accounts" ON public.wallet_accounts;
CREATE POLICY "Users can update own wallet accounts"
  ON public.wallet_accounts FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users can view own wallet transactions"
  ON public.wallet_transactions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users can insert own wallet transactions"
  ON public.wallet_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users can update own wallet transactions"
  ON public.wallet_transactions FOR UPDATE USING (auth.uid() = user_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trigger_wallet_accounts_updated ON public.wallet_accounts;
CREATE TRIGGER trigger_wallet_accounts_updated
  BEFORE UPDATE ON public.wallet_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_wallet_tx_updated ON public.wallet_transactions;
CREATE TRIGGER trigger_wallet_tx_updated
  BEFORE UPDATE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.wallet_accounts IS 'Cuentas bancarias importadas desde Transfermovil .trm';
COMMENT ON TABLE public.wallet_transactions IS 'Transacciones importadas desde Transfermovil .trm';
