-- Run in Supabase SQL Editor

-- 1. Add position + DNF to race_results (needed for bet settlement when both score 0)
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS position INT;
ALTER TABLE race_results ADD COLUMN IF NOT EXISTS dnf BOOLEAN DEFAULT FALSE;

-- 2. Pick snapshot — frozen at race weekend lock time
CREATE TABLE IF NOT EXISTS user_race_picks (
  race_id    INT NOT NULL REFERENCES races(id),
  user_id    INT NOT NULL REFERENCES users(id),
  driver1_id INT REFERENCES drivers(id),
  driver2_id INT REFERENCES drivers(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (race_id, user_id)
);
