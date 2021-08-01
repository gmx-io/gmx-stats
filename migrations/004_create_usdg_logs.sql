CREATE TABLE IF NOT EXISTS usdgLogs(
	blockNumber INTEGER NOT NULL,
	blockHash CHAR NOT NULL,
	txHash CHAR NOT NULL,
	name CHAR NOT NULL,
	args TEXT,
	logIndex INTEGER,
	UNIQUE(blockNumber, logIndex)
);
CREATE INDEX usdgLogs_blockNumber ON usdgLogs(blockNumber);
CREATE INDEX usdgLogs_txHash ON usdgLogs(txHash);
CREATE INDEX usdgLogs_blockNumber_logIndex ON usdgLogs(blockNumber, logIndex);