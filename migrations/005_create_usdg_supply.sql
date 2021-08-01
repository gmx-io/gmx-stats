CREATE TABLE IF NOT EXISTS usdgSupply(
	blockNumber INTEGER PRIMARY KEY,
	supply CHAR(100) NOT NULL
);
CREATE INDEX usdgSupply_blockNumber ON usdgSupply(blockNumber);
