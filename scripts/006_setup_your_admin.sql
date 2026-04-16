-- Setup admin for mohammedgobena111@gmail.com

-- Step 1: Add email to whitelist (allows this email to become admin)
INSERT INTO admin_whitelist (email)
VALUES ('mohammedgobena111@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- Step 2: Create a trigger that automatically makes this user an admin when they sign up
CREATE OR REPLACE FUNCTION auto_create_admin_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if email is in whitelist
  IF EXISTS (SELECT 1 FROM admin_whitelist WHERE email = NEW.email AND is_active = true) THEN
    -- Insert into admins table
    INSERT INTO admins (id, email, role)
    VALUES (NEW.id, NEW.email, 'super_admin')
    ON CONFLICT (id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_admin_on_signup();

-- Confirmation
SELECT 'Admin whitelist updated for: mohammedgobena111@gmail.com' as status;
