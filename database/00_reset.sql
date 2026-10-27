-- =====================================================================
-- 00_reset.sql : remove the database completely (DDL - DROP)
--
-- Only needed to start over. Afterwards run 01 ... 06 again
-- (npm run db:reset does both steps).
-- =====================================================================

DROP DATABASE IF EXISTS ReverseLogisticsDB;
