-- Telegram Bingo Mini App - Database Functions v4
-- Production-ready with advisory locks, bitmasks, and idempotency

-- ============================================
-- HELPER: Update player masks for a number
-- ============================================

CREATE OR REPLACE FUNCTION update_player_masks_for_number(
  p_game_id UUID, 
  p_number INT
)
RETURNS VOID AS $$
BEGIN
  -- Update marked_mask for all players who have this number
  UPDATE game_players gp
  SET marked_mask = gp.marked_mask | (
    B'1000000000000000000000000'::BIT(25) >> (bc.number_positions->>p_number::text)::int
  )
  FROM bingo_cards bc
  WHERE gp.game_id = p_game_id
    AND bc.card_number = gp.card_number
    AND bc.number_positions ? p_number::text;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- HELPER: Validate bingo fast (bitmask)
-- ============================================

CREATE OR REPLACE FUNCTION validate_bingo_fast(
  p_marked_mask BIT(25)
)
RETURNS TABLE(is_valid BOOLEAN, pattern_name TEXT) AS $$
BEGIN
  -- Check center cell is FREE (position 12 must be marked for proper check)
  -- Since FREE is auto-marked, we check against patterns
  RETURN QUERY
  SELECT true, wp.name
  FROM winning_patterns wp
  WHERE (p_marked_mask & wp.pattern_mask) = wp.pattern_mask
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ATOMIC REFUND (no double refund possible)
-- ============================================

CREATE OR REPLACE FUNCTION process_no_winner_refund(p_game_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_updated_id UUID;
  v_player RECORD;
  v_refund_key TEXT;
  v_entry_fee DECIMAL;
  v_refund_count INT := 0;
BEGIN
  -- ATOMIC: Only proceed if we successfully flip the flag
  UPDATE games
  SET refund_processed = true,
      status = 'cancelled',
      ended_at = NOW()
  WHERE id = p_game_id
    AND refund_processed = false
  RETURNING id, entry_fee INTO v_updated_id, v_entry_fee;
  
  -- If no row returned, refund already processed
  IF v_updated_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already refunded or game not found');
  END IF;
  
  -- Process individual refunds with idempotency
  FOR v_player IN 
    SELECT user_id FROM game_players WHERE game_id = p_game_id
  LOOP
    v_refund_key := p_game_id || '-refund-' || v_player.user_id;
    
    -- Idempotent insert (won't fail if already exists)
    BEGIN
      INSERT INTO transactions (idempotency_key, user_id, type, amount, status, game_id)
      VALUES (v_refund_key, v_player.user_id, 'refund', v_entry_fee, 'completed', p_game_id);
      
      -- Only update balance if transaction was inserted
      UPDATE users SET balance = balance + v_entry_fee WHERE id = v_player.user_id;
      v_refund_count := v_refund_count + 1;
    EXCEPTION WHEN unique_violation THEN
      -- Already refunded this player, skip
      NULL;
    END;
  END LOOP;
  
  -- Log event
  INSERT INTO game_events (game_id, event_type, data)
  VALUES (p_game_id, 'refunds_processed', jsonb_build_object('reason', 'no_winner', 'refund_count', v_refund_count));
  
  RETURN jsonb_build_object('success', true, 'action', 'refunded', 'count', v_refund_count);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CHECK FOR AUTO-WINNERS
-- ============================================

CREATE OR REPLACE FUNCTION check_auto_winners(p_game_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_winner RECORD;
  v_winners UUID[] := '{}';
  v_pattern TEXT;
BEGIN
  -- Find all players with winning patterns (ordered by joined_at, user_id for determinism)
  FOR v_winner IN 
    SELECT gp.user_id, gp.marked_mask, wp.name as pattern_name
    FROM game_players gp
    CROSS JOIN winning_patterns wp
    WHERE gp.game_id = p_game_id
      AND gp.is_disqualified = false
      AND (gp.marked_mask & wp.pattern_mask) = wp.pattern_mask
    ORDER BY gp.joined_at ASC, gp.user_id ASC
  LOOP
    v_winners := array_append(v_winners, v_winner.user_id);
    v_pattern := v_winner.pattern_name;
  END LOOP;
  
  IF array_length(v_winners, 1) > 0 THEN
    RETURN jsonb_build_object(
      'has_winners', true, 
      'winner_ids', v_winners,
      'pattern', v_pattern
    );
  END IF;
  
  RETURN jsonb_build_object('has_winners', false);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DRAW NEXT NUMBER (with advisory lock)
-- ============================================

CREATE OR REPLACE FUNCTION draw_next_number(p_game_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_game RECORD;
  v_available INT[];
  v_next_number INT;
  v_draw_seq INT;
  v_auto_winners JSONB;
BEGIN
  -- ADVISORY LOCK (bulletproof against race conditions)
  PERFORM pg_advisory_xact_lock(hashtext(p_game_id::text));
  
  -- Get game with row lock
  SELECT * INTO v_game FROM games 
  WHERE id = p_game_id 
  FOR UPDATE;
  
  IF v_game IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found');
  END IF;
  
  IF v_game.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not active', 'status', v_game.status);
  END IF;
  
  -- Check timing (lazy tick validation)
  IF v_game.last_draw_at IS NOT NULL AND 
     v_game.last_draw_at > NOW() - INTERVAL '2.5 seconds' THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Too soon', 
      'wait_ms', EXTRACT(MILLISECONDS FROM (v_game.last_draw_at + INTERVAL '2.5 seconds' - NOW()))::int
    );
  END IF;
  
  -- Check if already has winners
  IF v_game.winner_ids IS NOT NULL AND array_length(v_game.winner_ids, 1) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game already won');
  END IF;
  
  -- Get available numbers (not yet drawn)
  SELECT array_agg(n ORDER BY random()) INTO v_available
  FROM (
    SELECT n FROM generate_series(1, 75) n
    WHERE n NOT IN (SELECT number FROM game_draws WHERE game_id = p_game_id)
  ) sub;
  
  IF v_available IS NULL OR array_length(v_available, 1) IS NULL THEN
    -- All 75 numbers called, no winner - process refund
    RETURN process_no_winner_refund(p_game_id);
  END IF;
  
  -- Draw first random number from shuffled array
  v_next_number := v_available[1];
  v_draw_seq := v_game.total_draws + 1;
  
  -- Insert into draws table
  INSERT INTO game_draws (game_id, number, draw_sequence)
  VALUES (p_game_id, v_next_number, v_draw_seq);
  
  -- Update game state
  UPDATE games SET 
    current_number = v_next_number,
    total_draws = v_draw_seq,
    last_draw_at = NOW()
  WHERE id = p_game_id;
  
  -- Update all player bitmasks
  PERFORM update_player_masks_for_number(p_game_id, v_next_number);
  
  -- Log event
  INSERT INTO game_events (game_id, event_type, data)
  VALUES (p_game_id, 'number_drawn', jsonb_build_object(
    'number', v_next_number,
    'sequence', v_draw_seq
  ));
  
  -- Check for auto-winners
  v_auto_winners := check_auto_winners(p_game_id);
  
  RETURN jsonb_build_object(
    'success', true,
    'number', v_next_number,
    'sequence', v_draw_seq,
    'remaining', array_length(v_available, 1) - 1,
    'auto_winners', v_auto_winners
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CLAIM BINGO (with late click protection)
-- ============================================

CREATE OR REPLACE FUNCTION claim_bingo_safe(
  p_game_id UUID,
  p_user_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_existing RECORD;
  v_game RECORD;
  v_player RECORD;
  v_is_valid BOOLEAN;
  v_pattern TEXT;
BEGIN
  -- Check idempotency first (before any locks)
  SELECT * INTO v_existing FROM bingo_claims 
  WHERE idempotency_key = p_idempotency_key;
  
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', v_existing.is_valid,
      'result', v_existing.result,
      'idempotent', true
    );
  END IF;
  
  -- ADVISORY LOCK
  PERFORM pg_advisory_xact_lock(hashtext(p_game_id::text));
  
  -- Get game
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  
  IF v_game IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found');
  END IF;
  
  IF v_game.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not active');
  END IF;
  
  -- LATE CLICK PROTECTION: Reject if > 3 seconds since last draw
  IF v_game.last_draw_at IS NOT NULL AND 
     NOW() - v_game.last_draw_at > INTERVAL '3 seconds' THEN
    INSERT INTO bingo_claims (idempotency_key, game_id, user_id, is_valid, result)
    VALUES (p_idempotency_key, p_game_id, p_user_id, false, 'Claim window expired');
    
    RETURN jsonb_build_object('success', false, 'error', 'Claim window expired. Wait for next number.');
  END IF;
  
  IF v_game.winner_ids IS NOT NULL AND array_length(v_game.winner_ids, 1) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game already won');
  END IF;
  
  -- Get player
  SELECT * INTO v_player FROM game_players 
  WHERE game_id = p_game_id AND user_id = p_user_id;
  
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in game');
  END IF;
  
  IF v_player.is_disqualified THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are disqualified from this game');
  END IF;
  
  -- FAST BITMASK VALIDATION
  SELECT * INTO v_is_valid, v_pattern FROM validate_bingo_fast(v_player.marked_mask);
  
  -- Record claim
  INSERT INTO bingo_claims (
    idempotency_key, game_id, user_id, card_number,
    draw_sequence_at_claim, claimed_pattern, is_valid, result
  ) VALUES (
    p_idempotency_key, p_game_id, p_user_id, v_player.card_number,
    v_game.total_draws, v_pattern, v_is_valid,
    CASE WHEN v_is_valid THEN 'WINNER' ELSE 'INVALID' END
  );
  
  -- Log event
  INSERT INTO game_events (game_id, event_type, user_id, data)
  VALUES (p_game_id, 'bingo_claimed', p_user_id, jsonb_build_object(
    'card_number', v_player.card_number,
    'is_valid', v_is_valid,
    'pattern', v_pattern
  ));
  
  IF NOT v_is_valid THEN
    -- Increment invalid count
    UPDATE game_players 
    SET invalid_bingo_count = invalid_bingo_count + 1,
        is_disqualified = CASE WHEN invalid_bingo_count >= 1 THEN true ELSE false END
    WHERE game_id = p_game_id AND user_id = p_user_id;
    
    -- Check if now disqualified (2nd invalid = disqualified)
    IF v_player.invalid_bingo_count >= 1 THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Invalid BINGO! You are now disqualified.',
        'disqualified', true
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Invalid BINGO! One more wrong claim will disqualify you.',
        'warning', true
      );
    END IF;
  END IF;
  
  -- VALID BINGO - process win
  RETURN process_winner(p_game_id, p_user_id, v_pattern);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PROCESS WINNER
-- ============================================

CREATE OR REPLACE FUNCTION process_winner(
  p_game_id UUID,
  p_user_id UUID,
  p_pattern TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_game RECORD;
  v_pot DECIMAL;
  v_house_fee DECIMAL;
  v_prize DECIMAL;
  v_prize_key TEXT;
  v_winner_username TEXT;
BEGIN
  -- Get game
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  
  -- Calculate prize (90% to winner, 10% house)
  v_house_fee := ROUND(v_game.pot * 0.10, 2);
  v_prize := v_game.pot - v_house_fee;
  
  -- Update game
  UPDATE games SET
    status = 'completed',
    winner_ids = ARRAY[p_user_id],
    prize_per_winner = v_prize,
    winning_pattern = p_pattern,
    house_fee = v_house_fee,
    ended_at = NOW()
  WHERE id = p_game_id;
  
  -- Mark player as winner
  UPDATE game_players SET has_won = true 
  WHERE game_id = p_game_id AND user_id = p_user_id;
  
  -- Prize transaction with idempotency
  v_prize_key := p_game_id || '-prize-' || p_user_id;
  
  INSERT INTO transactions (idempotency_key, user_id, type, amount, status, game_id)
  VALUES (v_prize_key, p_user_id, 'prize', v_prize, 'completed', p_game_id)
  ON CONFLICT (idempotency_key) DO NOTHING;
  
  IF FOUND THEN
    -- Update winner balance and stats
    UPDATE users SET 
      balance = balance + v_prize,
      total_wins = total_wins + 1
    WHERE id = p_user_id
    RETURNING username INTO v_winner_username;
  END IF;
  
  -- Log events
  INSERT INTO game_events (game_id, event_type, user_id, data)
  VALUES (p_game_id, 'winner_declared', p_user_id, jsonb_build_object(
    'pattern', p_pattern,
    'prize', v_prize
  ));
  
  INSERT INTO game_events (game_id, event_type, data)
  VALUES (p_game_id, 'game_completed', jsonb_build_object(
    'winner_id', p_user_id,
    'prize', v_prize,
    'house_fee', v_house_fee
  ));
  
  -- Save to public history
  INSERT INTO game_history (game_id, total_players, total_pot, house_cut, winner_count, 
    winner_usernames, prize_per_winner, all_called_numbers, winning_pattern, total_draws, duration_seconds)
  SELECT 
    p_game_id,
    (SELECT COUNT(*) FROM game_players WHERE game_id = p_game_id),
    v_game.pot,
    v_house_fee,
    1,
    ARRAY[v_winner_username],
    v_prize,
    (SELECT array_agg(number ORDER BY draw_sequence) FROM game_draws WHERE game_id = p_game_id),
    p_pattern,
    v_game.total_draws,
    EXTRACT(EPOCH FROM (NOW() - v_game.started_at))::INT
  ON CONFLICT (game_id) DO NOTHING;
  
  RETURN jsonb_build_object(
    'success', true,
    'winner', true,
    'prize', v_prize,
    'pattern', p_pattern,
    'message', 'Congratulations! You won ' || v_prize || ' Birr!'
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- JOIN GAME (with idempotency)
-- ============================================

CREATE OR REPLACE FUNCTION join_game_safe(
  p_game_id UUID,
  p_user_id UUID,
  p_card_number INT,
  p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_game RECORD;
  v_user RECORD;
  v_existing RECORD;
  v_entry_fee DECIMAL;
BEGIN
  -- Check idempotency
  SELECT * INTO v_existing FROM game_players 
  WHERE entry_idempotency_key = p_idempotency_key;
  
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true, 'card_number', v_existing.card_number);
  END IF;
  
  -- Lock game
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  
  IF v_game IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found');
  END IF;
  
  IF v_game.status != 'lobby' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not in lobby phase');
  END IF;
  
  -- Check if card already taken
  IF EXISTS (SELECT 1 FROM game_players WHERE game_id = p_game_id AND card_number = p_card_number) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Card already taken');
  END IF;
  
  -- Check if user already in game
  IF EXISTS (SELECT 1 FROM game_players WHERE game_id = p_game_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already joined this game');
  END IF;
  
  -- Check max players
  IF (SELECT COUNT(*) FROM game_players WHERE game_id = p_game_id) >= 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game is full (100 players max)');
  END IF;
  
  -- Lock user and check balance
  SELECT * INTO v_user FROM users WHERE id = p_user_id FOR UPDATE;
  
  v_entry_fee := v_game.entry_fee;
  
  IF v_user.balance < v_entry_fee THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance. Need ' || v_entry_fee || ' Birr');
  END IF;
  
  -- Deduct entry fee
  UPDATE users SET balance = balance - v_entry_fee WHERE id = p_user_id;
  
  -- Record entry fee transaction
  INSERT INTO transactions (idempotency_key, user_id, type, amount, status, game_id)
  VALUES (p_idempotency_key, p_user_id, 'entry_fee', v_entry_fee, 'completed', p_game_id);
  
  -- Add player to game (with FREE center auto-marked)
  INSERT INTO game_players (game_id, user_id, card_number, entry_idempotency_key, marked_mask)
  VALUES (
    p_game_id, 
    p_user_id, 
    p_card_number, 
    p_idempotency_key,
    -- Auto-mark the FREE center (position 12)
    B'0000000000001000000000000'
  );
  
  -- Update pot
  UPDATE games SET pot = pot + v_entry_fee WHERE id = p_game_id;
  
  -- Update user stats
  UPDATE users SET total_games = total_games + 1 WHERE id = p_user_id;
  
  -- Log event
  INSERT INTO game_events (game_id, event_type, user_id, data)
  VALUES (p_game_id, 'player_joined', p_user_id, jsonb_build_object('card_number', p_card_number));
  
  RETURN jsonb_build_object('success', true, 'card_number', p_card_number, 'balance', v_user.balance - v_entry_fee);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CREATE NEW GAME LOBBY
-- ============================================

CREATE OR REPLACE FUNCTION create_game_lobby()
RETURNS JSONB AS $$
DECLARE
  v_game_id UUID;
  v_lobby_duration INTERVAL := '90 seconds';
BEGIN
  -- Check no active game exists
  IF EXISTS (SELECT 1 FROM games WHERE status IN ('lobby', 'countdown', 'active', 'processing')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Another game is already running');
  END IF;
  
  -- Create new game
  INSERT INTO games (lobby_ends_at)
  VALUES (NOW() + v_lobby_duration)
  RETURNING id INTO v_game_id;
  
  -- Log event
  INSERT INTO game_events (game_id, event_type, data)
  VALUES (v_game_id, 'game_created', jsonb_build_object('lobby_duration_sec', 90));
  
  RETURN jsonb_build_object('success', true, 'game_id', v_game_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRANSITION GAME STATE (called by lazy tick)
-- ============================================

CREATE OR REPLACE FUNCTION transition_game_state(p_game_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_game RECORD;
  v_player_count INT;
BEGIN
  -- Advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(p_game_id::text));
  
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  
  IF v_game IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found');
  END IF;
  
  -- LOBBY -> COUNTDOWN (or CANCELLED if < 2 players)
  IF v_game.status = 'lobby' AND NOW() >= v_game.lobby_ends_at THEN
    SELECT COUNT(*) INTO v_player_count FROM game_players WHERE game_id = p_game_id;
    
    IF v_player_count < 2 THEN
      -- Not enough players - refund and cancel
      RETURN process_no_winner_refund(p_game_id);
    END IF;
    
    -- Transition to countdown
    UPDATE games SET 
      status = 'countdown',
      countdown_ends_at = NOW() + INTERVAL '30 seconds'
    WHERE id = p_game_id;
    
    INSERT INTO game_events (game_id, event_type, data)
    VALUES (p_game_id, 'countdown_started', jsonb_build_object('player_count', v_player_count));
    
    RETURN jsonb_build_object('success', true, 'new_status', 'countdown');
  END IF;
  
  -- COUNTDOWN -> ACTIVE
  IF v_game.status = 'countdown' AND NOW() >= v_game.countdown_ends_at THEN
    UPDATE games SET 
      status = 'active',
      started_at = NOW(),
      last_draw_at = NOW() - INTERVAL '3 seconds' -- Allow immediate first draw
    WHERE id = p_game_id;
    
    INSERT INTO game_events (game_id, event_type, data)
    VALUES (p_game_id, 'game_started', jsonb_build_object('started_at', NOW()));
    
    RETURN jsonb_build_object('success', true, 'new_status', 'active');
  END IF;
  
  RETURN jsonb_build_object('success', true, 'status', v_game.status, 'no_transition', true);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RATE LIMIT CHECK
-- ============================================

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_minute_limit INT,
  p_daily_limit INT
)
RETURNS JSONB AS $$
DECLARE
  v_limit RECORD;
  v_current_minute TIMESTAMPTZ := date_trunc('minute', NOW());
  v_current_day DATE := CURRENT_DATE;
BEGIN
  -- Get or create rate limit record
  INSERT INTO rate_limits (user_id, action, minute_count, minute_window, daily_count, daily_window)
  VALUES (p_user_id, p_action, 0, v_current_minute, 0, v_current_day)
  ON CONFLICT (user_id, action) DO UPDATE
  SET 
    minute_count = CASE 
      WHEN rate_limits.minute_window < v_current_minute THEN 0 
      ELSE rate_limits.minute_count 
    END,
    minute_window = CASE 
      WHEN rate_limits.minute_window < v_current_minute THEN v_current_minute 
      ELSE rate_limits.minute_window 
    END,
    daily_count = CASE 
      WHEN rate_limits.daily_window < v_current_day THEN 0 
      ELSE rate_limits.daily_count 
    END,
    daily_window = CASE 
      WHEN rate_limits.daily_window < v_current_day THEN v_current_day 
      ELSE rate_limits.daily_window 
    END
  RETURNING * INTO v_limit;
  
  -- Check limits
  IF v_limit.minute_count >= p_minute_limit THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Rate limit exceeded. Try again in a minute.');
  END IF;
  
  IF v_limit.daily_count >= p_daily_limit THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'Daily limit reached. Try again tomorrow.');
  END IF;
  
  -- Increment counts
  UPDATE rate_limits 
  SET minute_count = minute_count + 1, daily_count = daily_count + 1
  WHERE user_id = p_user_id AND action = p_action;
  
  RETURN jsonb_build_object('allowed', true);
END;
$$ LANGUAGE plpgsql;
