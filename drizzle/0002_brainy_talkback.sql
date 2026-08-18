CREATE TABLE `changeHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`changeId` int NOT NULL,
	`userId` int NOT NULL,
	`action` enum('Created','Applied','Rejected') NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `changeHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `sourceContent` text;