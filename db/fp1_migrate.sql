-- Run in Supabase SQL Editor

-- 1. Add fp1_at column (UTC timestamps)
ALTER TABLE races ADD COLUMN IF NOT EXISTS fp1_at TIMESTAMPTZ;

-- 2. Set FP1 times — all times given in GMT+2, converted to UTC (−2h)
UPDATE races SET fp1_at = '2026-03-06 00:30:00+00' WHERE round = 1;  -- Australian GP
UPDATE races SET fp1_at = '2026-03-13 02:30:00+00' WHERE round = 2;  -- Chinese GP
UPDATE races SET fp1_at = '2026-03-27 01:30:00+00' WHERE round = 3;  -- Japanese GP
UPDATE races SET fp1_at = '2026-05-01 16:30:00+00' WHERE round = 4;  -- Miami GP
UPDATE races SET fp1_at = '2026-05-22 16:30:00+00' WHERE round = 5;  -- Canadian GP
UPDATE races SET fp1_at = '2026-06-05 11:30:00+00' WHERE round = 6;  -- Monaco GP
UPDATE races SET fp1_at = '2026-06-12 11:30:00+00' WHERE round = 7;  -- Spanish GP
UPDATE races SET fp1_at = '2026-06-26 11:30:00+00' WHERE round = 8;  -- Austrian GP
UPDATE races SET fp1_at = '2026-07-03 10:30:00+00' WHERE round = 9;  -- British GP
UPDATE races SET fp1_at = '2026-07-17 11:30:00+00' WHERE round = 10; -- Belgian GP
UPDATE races SET fp1_at = '2026-07-24 11:30:00+00' WHERE round = 11; -- Hungarian GP
UPDATE races SET fp1_at = '2026-08-21 10:30:00+00' WHERE round = 12; -- Dutch GP
UPDATE races SET fp1_at = '2026-09-04 11:30:00+00' WHERE round = 13; -- Italian GP
UPDATE races SET fp1_at = '2026-09-11 11:30:00+00' WHERE round = 14; -- Madrid GP
UPDATE races SET fp1_at = '2026-09-25 09:30:00+00' WHERE round = 15; -- Azerbaijan GP
UPDATE races SET fp1_at = '2026-10-09 09:30:00+00' WHERE round = 16; -- Singapore GP
UPDATE races SET fp1_at = '2026-10-23 16:30:00+00' WHERE round = 17; -- US GP
UPDATE races SET fp1_at = '2026-10-30 16:30:00+00' WHERE round = 18; -- Mexico City GP
UPDATE races SET fp1_at = '2026-11-06 13:30:00+00' WHERE round = 19; -- São Paulo GP
UPDATE races SET fp1_at = '2026-11-20 01:30:00+00' WHERE round = 20; -- Las Vegas GP
UPDATE races SET fp1_at = '2026-11-27 12:30:00+00' WHERE round = 21; -- Qatar GP
UPDATE races SET fp1_at = '2026-12-04 08:30:00+00' WHERE round = 22; -- Abu Dhabi GP

-- 3. Fix sprint weekends
--    New sprints: Canada(5), Britain(9), Dutch(12), Singapore(16), Brazil(19)
--    Removed sprints: Belgium(10), USA(17)
UPDATE races SET has_sprint = true  WHERE round IN (5, 9, 12, 16, 19);
UPDATE races SET has_sprint = false WHERE round IN (10, 17);
