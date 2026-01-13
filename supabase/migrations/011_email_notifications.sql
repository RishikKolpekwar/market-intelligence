-- Add email notifications column to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true;

-- Add index for efficient cron job queries
CREATE INDEX IF NOT EXISTS idx_users_email_notifications
  ON users(email_notifications_enabled)
  WHERE email_notifications_enabled = true;

-- Add comment
COMMENT ON COLUMN users.email_notifications_enabled IS 'Whether user wants to receive daily briefing emails';
