-- Run in Supabase SQL Editor to add the bets feature

CREATE TABLE IF NOT EXISTS bets (
  id            SERIAL PRIMARY KEY,
  race_id       INT  REFERENCES races(id),
  creator_id    INT  REFERENCES users(id),
  acceptor_id   INT  REFERENCES users(id),
  driver_above_id INT REFERENCES drivers(id),
  driver_below_id INT REFERENCES drivers(id),
  points        FLOAT NOT NULL,
  status        TEXT  NOT NULL DEFAULT 'open',  -- open / accepted / settled / void / cancelled
  winner_id     INT  REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  settled_at    TIMESTAMPTZ
);
