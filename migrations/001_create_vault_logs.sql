CREATE TABLE IF NOT EXISTS vaultLogs(
	blockNumber INTEGER NOT NULL,
	blockHash CHAR NOT NULL,
	txHash CHAR NOT NULL,
	name CHAR NOT NULL,
	args TEXT,
	logIndex INTEGER,
	UNIQUE(blockNumber, logIndex)
);
CREATE INDEX vaultLogs_blockNumber ON vaultLogs(blockNumber);
CREATE INDEX vaultLogs_txHash ON vaultLogs(txHash);
CREATE INDEX vaultLogs_blockNumber_logIndex ON vaultLogs(blockNumber, logIndex);