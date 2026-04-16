-- Create admin user setup function
-- Run this after creating an admin account in Supabase Auth

-- Function to make a user an admin by email
CREATE OR REPLACE FUNCTION make_user_admin(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user id from auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_email;
  END IF;
  
  -- Insert or update admin record (id IS the user_id)
  INSERT INTO admins (id, email, name, is_active)
  VALUES (v_user_id, p_email, 'Admin', true)
  ON CONFLICT (id) DO UPDATE
  SET is_active = true, email = p_email;
  
  RETURN TRUE;
END;
$$;

-- Function to check if email is whitelisted
CREATE OR REPLACE FUNCTION is_admin_email_whitelisted(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_whitelist WHERE email = p_email
  );
END;
$$;

-- Clear and re-add your admin email
-- IMPORTANT: Change this to your actual admin email!
DELETE FROM admin_whitelist WHERE email = 'admin@bingo.com';
INSERT INTO admin_whitelist (email) VALUES 
  ('admin@example.com')
ON CONFLICT (email) DO NOTHING;

-- Create RLS policy for admin_whitelist
ALTER TABLE admin_whitelist ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists
DROP POLICY IF EXISTS "Only super admins can view whitelist" ON admin_whitelist;

CREATE POLICY "Only super admins can view whitelist"
  ON admin_whitelist FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE id = auth.uid()
      AND is_active = true
    )
  );
