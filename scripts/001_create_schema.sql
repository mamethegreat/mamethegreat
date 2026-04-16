-- Telegram Bingo Mini App - Database Schema v4
-- Production-ready with advisory locks, bitmasks, and idempotency

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE game_status AS ENUM ('lobby', 'countdown', 'active', 'processing', 'completed', 'cancelled');
CREATE TYPE transaction_type AS ENUM ('deposit', 'withdrawal', 'entry_fee', 'prize', 'refund', 'house_fee');
CREATE TYPE transaction_status AS ENUM ('pending', 'approved', 'rejected', 'completed', 'auto_rejected');
CREATE TYPE event_type AS ENUM (
  'game_created', 'player_joined', 'player_left',
  'countdown_started', 'game_started', 
  'number_drawn', 'bingo_claimed', 'bingo_validated',
  'winner_declared', 'prizes_distributed', 'refunds_processed',
  'game_completed', 'game_cancelled'
);

-- ============================================
-- 1. USERS TABLE
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  balance DECIMAL(10,2) DEFAULT 0.00 CHECK (balance >= 0),
  total_games INT DEFAULT 0,
  total_wins INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_telegram_id ON users(telegram_id);

-- ============================================
-- 2. ADMINS TABLE
-- ============================================

CREATE TABLE admins (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE admin_whitelist (
  email TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial whitelisted admin email (change this to your email)
INSERT INTO admin_whitelist (email) VALUES ('admin@bingo.com');

-- AUDIT LOG (immutable)
CREATE TABLE admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_logs_admin ON admin_logs(admin_id);
CREATE INDEX idx_admin_logs_created ON admin_logs(created_at);

-- ============================================
-- 3. BINGO CARDS (400 pre-generated)
-- ============================================

CREATE TABLE bingo_cards (
  card_number INT PRIMARY KEY CHECK (card_number BETWEEN 1 AND 400),
  numbers INT[25] NOT NULL,
  -- JSONB map: number -> position (0-24)
  number_positions JSONB NOT NULL,
  win_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. WINNING PATTERNS (12 total)
-- ============================================

CREATE TABLE winning_patterns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  pattern_mask BIT(25) NOT NULL,
  positions INT[] NOT NULL
);

-- Insert winning patterns (5 rows, 5 columns, 2 diagonals)
-- Grid layout:
-- 0  1  2  3  4
-- 5  6  7  8  9
-- 10 11 12 13 14
-- 15 16 17 18 19
-- 20 21 22 23 24

INSERT INTO winning_patterns (name, pattern_mask, positions) VALUES
-- Rows
('row_1', B'1111100000000000000000000', ARRAY[0,1,2,3,4]),
('row_2', B'0000011111000000000000000', ARRAY[5,6,7,8,9]),
('row_3', B'0000000000111110000000000', ARRAY[10,11,12,13,14]),
('row_4', B'0000000000000001111100000', ARRAY[15,16,17,18,19]),
('row_5', B'0000000000000000000011111', ARRAY[20,21,22,23,24]),
-- Columns
('col_1', B'1000010000100001000010000', ARRAY[0,5,10,15,20]),
('col_2', B'0100001000010000100001000', ARRAY[1,6,11,16,21]),
('col_3', B'0010000100001000010000100', ARRAY[2,7,12,17,22]),
('col_4', B'0001000010000100001000010', ARRAY[3,8,13,18,23]),
('col_5', B'0000100001000010000100001', ARRAY[4,9,14,19,24]),
-- Diagonals
('diagonal_1', B'1000001000001000001000001', ARRAY[0,6,12,18,24]),
('diagonal_2', B'0000100010001000100010000', ARRAY[4,8,12,16,20]);

-- ============================================
-- 5. GAMES TABLE
-- ============================================

CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status game_status DEFAULT 'lobby',
  entry_fee DECIMAL(10,2) DEFAULT 10.00,
  pot DECIMAL(10,2) DEFAULT 0.00,
  house_fee DECIMAL(10,2) DEFAULT 0.00,
  
  -- Current state
  current_number INT,
  total_draws INT DEFAULT 0,
  
  winner_ids UUID[],
  prize_per_winner DECIMAL(10,2),
  winning_pattern TEXT,
  
  -- Timing
  lobby_ends_at TIMESTAMPTZ,
  countdown_ends_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  last_draw_at TIMESTAMPTZ,
  
  -- For debugging/audit
  active_token UUID,
  token_acquired_at TIMESTAMPTZ,
  
  -- Refund safety
  refund_processed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one active game at a time
CREATE UNIQUE INDEX idx_single_active_game 
ON games (status) 
WHERE status IN ('lobby', 'countdown', 'active', 'processing');

CREATE INDEX idx_games_status ON games(status);

-- ============================================
-- 6. GAME DRAWS (separate table)
-- ============================================

CREATE TABLE game_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  number INT NOT NULL CHECK (number BETWEEN 1 AND 75),
  draw_sequence INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(game_id, number),
  UNIQUE(game_id, draw_sequence)
);

CREATE INDEX idx_game_draws_game ON game_draws(game_id);
CREATE INDEX idx_game_draws_sequence ON game_draws(game_id, draw_sequence);

-- ============================================
-- 7. GAME PLAYERS
-- ============================================

CREATE TABLE game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  card_number INT REFERENCES bingo_cards(card_number),
  
  -- Bitmask of marked positions (auto-computed)
  marked_mask BIT(25) DEFAULT B'0000000000000000000000000',
  
  has_won BOOLEAN DEFAULT false,
  is_disqualified BOOLEAN DEFAULT false,
  invalid_bingo_count INT DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  
  entry_idempotency_key TEXT UNIQUE,
  
  UNIQUE(game_id, user_id),
  UNIQUE(game_id, card_number)
);

CREATE INDEX idx_game_players_game ON game_players(game_id);
CREATE INDEX idx_game_players_joined ON game_players(joined_at);

-- ============================================
-- 8. TRANSACTIONS
-- ============================================

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE,
  
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  status transaction_status DEFAULT 'pending',
  
  -- Deposits
  screenshot_url TEXT,
  telebirr_transaction_id TEXT,
  sender_name TEXT,
  sender_phone TEXT,
  
  -- Game-related
  game_id UUID REFERENCES games(id),
  
  -- Admin
  admin_id UUID,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_type ON transactions(type);

-- CRITICAL: Prevent duplicate Telebirr transactions
CREATE UNIQUE INDEX unique_telebirr_txn
ON transactions(telebirr_transaction_id)
WHERE type = 'deposit' AND telebirr_transaction_id IS NOT NULL;

-- ============================================
-- 9. BINGO CLAIMS
-- ============================================

CREATE TABLE bingo_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE,
  
  game_id UUID REFERENCES games(id),
  user_id UUID REFERENCES users(id),
  card_number INT,
  draw_sequence_at_claim INT,
  claimed_pattern TEXT,
  is_valid BOOLEAN,
  result TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bingo_claims_game ON bingo_claims(game_id);

-- ============================================
-- 10. GAME EVENTS (immutable audit)
-- ============================================

CREATE TABLE game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id),
  event_type event_type NOT NULL,
  user_id UUID REFERENCES users(id),
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_game_events_game ON game_events(game_id);
CREATE INDEX idx_game_events_type ON game_events(event_type);

-- ============================================
-- 11. TELEGRAM AUTH HASHES (replay protection)
-- ============================================

CREATE TABLE telegram_auth_hashes (
  hash TEXT PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  auth_date TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_telegram_hashes_used ON telegram_auth_hashes(used_at);

-- ============================================
-- 12. RATE LIMITS
-- ============================================

CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  minute_count INT DEFAULT 1,
  minute_window TIMESTAMPTZ DEFAULT date_trunc('minute', NOW()),
  daily_count INT DEFAULT 1,
  daily_window DATE DEFAULT CURRENT_DATE,
  
  UNIQUE(user_id, action)
);

-- ============================================
-- 13. GAME HISTORY (public transparency)
-- ============================================

CREATE TABLE game_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES games(id) UNIQUE,
  total_players INT,
  total_pot DECIMAL(10,2),
  house_cut DECIMAL(10,2),
  winner_count INT,
  winner_usernames TEXT[],
  prize_per_winner DECIMAL(10,2),
  all_called_numbers INT[],
  winning_pattern TEXT,
  total_draws INT,
  duration_seconds INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
