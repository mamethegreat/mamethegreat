-- Additional database functions for wallet operations

-- Approve deposit function
CREATE OR REPLACE FUNCTION approve_deposit(
  p_transaction_id UUID,
  p_admin_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction RECORD;
BEGIN
  -- Get and lock the transaction
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = p_transaction_id
    AND type = 'deposit'
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found or already processed');
  END IF;

  -- Update transaction status
  UPDATE transactions
  SET status = 'approved',
      processed_at = NOW(),
      processed_by = p_admin_id
  WHERE id = p_transaction_id;

  -- Add balance to user
  UPDATE users
  SET balance = balance + v_transaction.amount
  WHERE id = v_transaction.user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Process withdrawal function (deduct balance at request time)
CREATE OR REPLACE FUNCTION process_withdrawal(
  p_user_id UUID,
  p_amount NUMERIC,
  p_telebirr_number TEXT,
  p_account_name TEXT,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
  v_transaction_id UUID;
BEGIN
  -- Check idempotency
  IF EXISTS (SELECT 1 FROM transactions WHERE idempotency_key = p_idempotency_key) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duplicate request');
  END IF;

  -- Get and lock user
  SELECT * INTO v_user
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_user.balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Deduct balance immediately
  UPDATE users
  SET balance = balance - p_amount
  WHERE id = p_user_id;

  -- Create withdrawal request
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    status,
    telebirr_number,
    recipient_name,
    idempotency_key
  ) VALUES (
    p_user_id,
    'withdrawal',
    p_amount,
    'pending',
    p_telebirr_number,
    p_account_name,
    p_idempotency_key
  )
  RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_transaction_id);
END;
$$;

-- Reject withdrawal function (refund balance)
CREATE OR REPLACE FUNCTION reject_withdrawal(
  p_transaction_id UUID,
  p_admin_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction RECORD;
BEGIN
  -- Get and lock the transaction
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = p_transaction_id
    AND type = 'withdrawal'
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found or already processed');
  END IF;

  -- Update transaction status
  UPDATE transactions
  SET status = 'rejected',
      processed_at = NOW(),
      processed_by = p_admin_id
  WHERE id = p_transaction_id;

  -- Refund balance to user
  UPDATE users
  SET balance = balance + v_transaction.amount
  WHERE id = v_transaction.user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Process pending draws (lazy deterministic ticking)
CREATE OR REPLACE FUNCTION process_pending_draws()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_game RECORD;
  v_draw_interval INTERVAL := '2.5 seconds';
  v_draws_needed INT;
  v_available_numbers INT[];
  v_next_number INT;
  v_i INT;
BEGIN
  -- Get active game
  SELECT * INTO v_game
  FROM games
  WHERE status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    -- Check for countdown games that should start
    UPDATE games
    SET status = 'active',
        last_draw_at = NOW()
    WHERE status = 'countdown'
      AND game_starts_at <= NOW();
    RETURN;
  END IF;

  -- Check lobby games that should move to countdown
  UPDATE games
  SET status = 'countdown',
      game_starts_at = NOW() + INTERVAL '30 seconds'
  WHERE status = 'lobby'
    AND lobby_ends_at <= NOW()
    AND player_count >= 2;

  -- Refund games with less than 2 players
  UPDATE games
  SET status = 'completed',
      refund_processed = true
  WHERE status = 'lobby'
    AND lobby_ends_at <= NOW()
    AND player_count < 2;

  -- Calculate draws needed
  IF v_game.last_draw_at IS NULL THEN
    v_draws_needed := 1;
  ELSE
    v_draws_needed := FLOOR(EXTRACT(EPOCH FROM (NOW() - v_game.last_draw_at)) / 2.5)::INT;
  END IF;

  IF v_draws_needed <= 0 OR v_game.draw_count >= 75 THEN
    RETURN;
  END IF;

  -- Get available numbers (1-75 minus already called)
  SELECT ARRAY(
    SELECT n
    FROM generate_series(1, 75) AS n
    WHERE n NOT IN (
      SELECT number FROM game_draws WHERE game_id = v_game.id
    )
    ORDER BY random()
  ) INTO v_available_numbers;

  -- Draw numbers
  FOR v_i IN 1..LEAST(v_draws_needed, array_length(v_available_numbers, 1)) LOOP
    v_next_number := v_available_numbers[v_i];
    
    INSERT INTO game_draws (game_id, number, sequence)
    VALUES (v_game.id, v_next_number, v_game.draw_count + v_i);

    -- Log event
    INSERT INTO game_events (game_id, event_type, event_data)
    VALUES (v_game.id, 'number_drawn', jsonb_build_object('number', v_next_number, 'sequence', v_game.draw_count + v_i));
  END LOOP;

  -- Update game
  UPDATE games
  SET draw_count = draw_count + LEAST(v_draws_needed, array_length(v_available_numbers, 1)),
      last_draw_at = NOW()
  WHERE id = v_game.id;

END;
$$;

-- Check for auto-win (after each draw)
CREATE OR REPLACE FUNCTION check_auto_win(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_game RECORD;
  v_called_numbers INT[];
  v_player RECORD;
  v_card_numbers INT[];
  v_marked_indices INT[];
  v_has_win BOOLEAN;
BEGIN
  SELECT * INTO v_game
  FROM games
  WHERE id = p_game_id AND status = 'active'
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Get called numbers
  SELECT ARRAY_AGG(number ORDER BY sequence) INTO v_called_numbers
  FROM game_draws
  WHERE game_id = p_game_id;

  IF v_called_numbers IS NULL OR array_length(v_called_numbers, 1) < 5 THEN
    RETURN;
  END IF;

  -- Check each player
  FOR v_player IN 
    SELECT gp.*, bc.numbers 
    FROM game_players gp
    JOIN bingo_cards bc ON bc.card_number = gp.card_number
    WHERE gp.game_id = p_game_id AND gp.is_disqualified = false
  LOOP
    -- Find marked indices
    SELECT ARRAY_AGG(idx - 1) INTO v_marked_indices
    FROM (
      SELECT idx, v_player.numbers[idx] as num
      FROM generate_subscripts(v_player.numbers, 1) as idx
    ) sub
    WHERE num = ANY(v_called_numbers) OR idx = 13; -- 13 is center FREE space

    -- Check winning patterns
    v_has_win := false;
    
    -- Horizontal lines
    IF ARRAY[0,1,2,3,4] <@ v_marked_indices OR
       ARRAY[5,6,7,8,9] <@ v_marked_indices OR
       ARRAY[10,11,12,13,14] <@ v_marked_indices OR
       ARRAY[15,16,17,18,19] <@ v_marked_indices OR
       ARRAY[20,21,22,23,24] <@ v_marked_indices THEN
      v_has_win := true;
    END IF;

    -- Vertical lines
    IF ARRAY[0,5,10,15,20] <@ v_marked_indices OR
       ARRAY[1,6,11,16,21] <@ v_marked_indices OR
       ARRAY[2,7,12,17,22] <@ v_marked_indices OR
       ARRAY[3,8,13,18,23] <@ v_marked_indices OR
       ARRAY[4,9,14,19,24] <@ v_marked_indices THEN
      v_has_win := true;
    END IF;

    -- Diagonals
    IF ARRAY[0,6,12,18,24] <@ v_marked_indices OR
       ARRAY[4,8,12,16,20] <@ v_marked_indices THEN
      v_has_win := true;
    END IF;

    IF v_has_win THEN
      -- Auto-claim for this player
      PERFORM claim_bingo(v_player.user_id, p_game_id, gen_random_uuid()::text);
      RETURN;
    END IF;
  END LOOP;

  -- Check if all 75 numbers called - refund if no winner
  IF array_length(v_called_numbers, 1) >= 75 THEN
    PERFORM process_game_refund(p_game_id);
  END IF;
END;
$$;

-- Process game refund
CREATE OR REPLACE FUNCTION process_game_refund(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_game RECORD;
  v_player RECORD;
BEGIN
  -- Lock game
  UPDATE games
  SET refund_processed = true, status = 'completed'
  WHERE id = p_game_id
    AND refund_processed = false
  RETURNING * INTO v_game;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Refund each player
  FOR v_player IN 
    SELECT * FROM game_players WHERE game_id = p_game_id
  LOOP
    -- Add balance back
    UPDATE users
    SET balance = balance + v_game.entry_fee
    WHERE id = v_player.user_id;

    -- Create refund transaction
    INSERT INTO transactions (user_id, type, amount, status, game_id)
    VALUES (v_player.user_id, 'refund', v_game.entry_fee, 'completed', p_game_id);

    -- Log event
    INSERT INTO game_events (game_id, user_id, event_type, event_data)
    VALUES (p_game_id, v_player.user_id, 'refund', jsonb_build_object('amount', v_game.entry_fee));
  END LOOP;
END;
$$;
