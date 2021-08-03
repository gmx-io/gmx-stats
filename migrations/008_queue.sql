CREATE TABLE IF NOT EXISTS blocksQueue (
	number INTEGER NOT NULL
);
CREATE INDEX blocksQueue_number on blocks_queue(number);
CREATE TABLE IF NOT EXISTS transactionsQueue (
	hash CHAR NOT NULL
);
CREATE INDEX transactionsQueue_hash on transactions_queue(hash);
