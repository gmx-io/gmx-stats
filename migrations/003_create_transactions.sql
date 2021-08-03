CREATE TABLE IF NOT EXISTS `transactions` (
	hash CHAR(100) PRIMARY KEY NOT NULL,
	`from` CHAR(100) NOT NULL,
	`to` CHAR(100) NOT NULL,
	blockNumber INTEGER NOT NULL,
	UNIQUE(hash)
);
CREATE INDEX transactions_blockNumber ON transactions(blockNumber);
CREATE INDEX transactions_to ON transactions(`to`);
CREATE INDEX transactions_from ON transactions(`from`);
