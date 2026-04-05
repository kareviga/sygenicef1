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

-- 5. Replace race calendar with updated 22-race 2026 season
--    WARNING: clears all race results and user race scores
DELETE FROM user_race_scores;
DELETE FROM race_results;
DELETE FROM races;
UPDATE drivers SET championship_pts = 0;

INSERT INTO races (round, name, circuit, date, is_completed, has_sprint, cancelled) VALUES
(1,  'Australian GP',      'Melbourne',   '2026-03-08', false, false, false),
(2,  'Chinese GP',         'Shanghai',    '2026-03-15', false, true,  false),
(3,  'Japanese GP',        'Suzuka',      '2026-03-29', false, false, false),
(4,  'Miami GP',           'Miami',       '2026-05-03', false, true,  false),
(5,  'Canadian GP',        'Montreal',    '2026-05-24', false, false, false),
(6,  'Monaco GP',          'Monaco',      '2026-06-07', false, false, false),
(7,  'Spanish GP',         'Barcelona',   '2026-06-14', false, false, false),
(8,  'Austrian GP',        'Spielberg',   '2026-06-28', false, false, false),
(9,  'British GP',         'Silverstone', '2026-07-05', false, false, false),
(10, 'Belgian GP',         'Spa',         '2026-07-19', false, true,  false),
(11, 'Hungarian GP',       'Budapest',    '2026-07-26', false, false, false),
(12, 'Dutch GP',           'Zandvoort',   '2026-08-23', false, false, false),
(13, 'Italian GP',         'Monza',       '2026-09-06', false, false, false),
(14, 'Madrid GP',          'Madrid',      '2026-09-13', false, false, false),
(15, 'Azerbaijan GP',      'Baku',        '2026-09-26', false, false, false),
(16, 'Singapore GP',       'Singapore',   '2026-10-11', false, false, false),
(17, 'US GP',              'Austin',      '2026-10-25', false, true,  false),
(18, 'Mexico City GP',     'Mexico City', '2026-11-01', false, false, false),
(19, 'São Paulo GP',       'São Paulo',   '2026-11-08', false, false, false),
(20, 'Las Vegas GP',       'Las Vegas',   '2026-11-21', false, false, false),
(21, 'Qatar GP',           'Lusail',      '2026-11-29', false, true,  false),
(22, 'Abu Dhabi GP',       'Yas Marina',  '2026-12-06', false, false, false);
