CREATE TABLE IF NOT EXISTS blocks (
	number PRIMARY KEY NOT NULL,
	hash CHAR(100) NOT NULL,
	`timestamp` INTEGER
);
CREATE INDEX blocks_timestamp ON blocks(timestamp);
