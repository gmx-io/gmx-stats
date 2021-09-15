CREATE TABLE vaultLogsQueue (
	fromBlock INTEGER NOT NULL,
	toBlock INTEGER NOT NULL,
	UNIQUE (fromBlock, toBlock)
);
CREATE INDEX vaultLogsQueue_fromBlockToBlock ON vaultLogsQueue(fromBlock, toBlock);