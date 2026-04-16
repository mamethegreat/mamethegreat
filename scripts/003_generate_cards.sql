-- Generate 400 unique bingo cards with proper distribution
-- Standard 5x5 Bingo format: B(1-15), I(16-30), N(31-45), G(46-60), O(61-75)
-- Center position (12) is FREE

DO $$
DECLARE
  v_card_num INT;
  v_numbers INT[25];
  v_positions JSONB;
  v_col_start INT;
  v_col_end INT;
  v_available INT[];
  v_selected INT;
  v_idx INT;
  v_pos INT;
BEGIN
  -- Clear existing cards
  DELETE FROM bingo_cards;
  
  -- Generate 400 cards
  FOR v_card_num IN 1..400 LOOP
    v_numbers := '{}';
    v_positions := '{}'::JSONB;
    
    -- Generate each column
    FOR v_idx IN 0..4 LOOP
      -- B: 1-15, I: 16-30, N: 31-45, G: 46-60, O: 61-75
      v_col_start := v_idx * 15 + 1;
      v_col_end := v_idx * 15 + 15;
      
      -- Get shuffled available numbers for this column
      SELECT array_agg(n ORDER BY random()) INTO v_available
      FROM generate_series(v_col_start, v_col_end) n;
      
      -- Pick 5 numbers for this column (or 4 for N column which has FREE)
      FOR v_pos IN 0..4 LOOP
        -- Calculate actual position in the card array
        -- Position = row * 5 + column
        -- We fill column by column: positions 0,5,10,15,20 for B, 1,6,11,16,21 for I, etc.
        
        IF v_idx = 2 AND v_pos = 2 THEN
          -- Center position is FREE (position 12)
          v_numbers := array_append(v_numbers, 0); -- 0 represents FREE
        ELSE
          v_selected := v_available[v_pos + 1];
          v_numbers := array_append(v_numbers, v_selected);
          v_positions := v_positions || jsonb_build_object(v_selected::text, v_idx * 5 + v_pos);
        END IF;
      END LOOP;
    END LOOP;
    
    -- Insert the card
    INSERT INTO bingo_cards (card_number, numbers, number_positions)
    VALUES (v_card_num, v_numbers, v_positions);
    
  END LOOP;
  
  RAISE NOTICE 'Generated 400 bingo cards';
END;
$$;

-- Verify cards were created
SELECT COUNT(*) as card_count FROM bingo_cards;

-- Show a sample card
SELECT card_number, numbers, number_positions FROM bingo_cards WHERE card_number = 1;
