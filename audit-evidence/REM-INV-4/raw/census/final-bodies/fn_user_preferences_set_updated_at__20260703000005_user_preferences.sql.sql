-- DECLARED FINAL STATE (Git) de fn_user_preferences_set_updated_at
-- fuente: 20260703000005_user_preferences.sql stmt#7

CREATE OR REPLACE FUNCTION fn_user_preferences_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
