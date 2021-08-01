CREATE TABLE IF NOT EXISTS prices(
	price INTEGER NOT NULL,
	timestamp INTEGER NOT NULL,
	symbol CHAR NOT NULL,
	UNIQUE (timestamp, symbol)
);
CREATE INDEX prices_symbol ON prices(symbol);
CREATE INDEX prices_timestamp ON prices(timestamp);
