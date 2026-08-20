CREATE TABLE `buildProposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` int,
	`prompt` text NOT NULL,
	`analysis` text NOT NULL,
	`plan` text NOT NULL,
	`files` text NOT NULL,
	`commands` text NOT NULL,
	`risks` text NOT NULL,
	`status` enum('Proposed','Applied','Rejected') NOT NULL DEFAULT 'Proposed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `buildProposals_id` PRIMARY KEY(`id`)
);
