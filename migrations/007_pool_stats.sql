DROP TABLE poolStats;
CREATE TABLE IF NOT EXISTS poolStats(
	value INTEGER NOT NULL,
	valueHex CHAR NOT NULL,
	symbol CHAR NOT NULL,
	type CHAR NOT NULL,
	timestamp INTEGER NOT NULL,
	blockNumber INTEGER NOT NULL,
	logIndex INTEGER NOT NULL,
	UNIQUE(blockNumber, logIndex)
);
CREATE INDEX poolStats_timestamp ON poolStats(timestamp);
CREATE INDEX poolStats_blockNumber ON poolStats(blockNumber);
