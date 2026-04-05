-- Run this once in the Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- 1. Add cancelled column to races
ALTER TABLE races ADD COLUMN IF NOT EXISTS cancelled boolean DEFAULT false;

-- 2. Mark Bahrain (R4) and Saudi Arabia (R5) as cancelled
UPDATE races SET cancelled = true WHERE round IN (4, 5);

-- 3. Add driver detail columns to user_race_scores
ALTER TABLE user_race_scores ADD COLUMN IF NOT EXISTS driver1_race_pts float DEFAULT 0;
ALTER TABLE user_race_scores ADD COLUMN IF NOT EXISTS driver1_hc float DEFAULT 1;
ALTER TABLE user_race_scores ADD COLUMN IF NOT EXISTS driver2_race_pts float DEFAULT 0;
ALTER TABLE user_race_scores ADD COLUMN IF NOT EXISTS driver2_hc float DEFAULT 1;

-- 4. Set max HC multiplier to 50
INSERT INTO settings (key, value) VALUES ('max_handicap', '50')
ON CONFLICT (key) DO UPDATE SET value = '50';
