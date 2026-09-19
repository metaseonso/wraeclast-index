-- Real prices from the trade site for every item (not just trade sliders and farms):
-- v = the price in divines worked out when it was checked, h = one price per day (JSON [[day, v], ...], last 45 days)
ALTER TABLE trade_prices ADD COLUMN v REAL;
ALTER TABLE trade_prices ADD COLUMN h TEXT;
