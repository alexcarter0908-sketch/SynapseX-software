CREATE TABLE `executionRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runnerId` int NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('Script','Test') NOT NULL,
	`scriptId` int,
	`testRunId` int,
	`status` enum('Requested','Running','Passed','Failed','Not Verified') NOT NULL DEFAULT 'Requested',
	`output` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `executionRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `runners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`status` enum('Active','Revoked') NOT NULL DEFAULT 'Active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp,
	CONSTRAINT `runners_id` PRIMARY KEY(`id`),
	CONSTRAINT `runners_tokenHash_unique` UNIQUE(`tokenHash`)
);
