CREATE TABLE `activity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int,
	`userId` int NOT NULL,
	`kind` varchar(80) NOT NULL,
	`message` varchar(300) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assistantMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int,
	`userId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assistantMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditFindings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`auditId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`detail` text NOT NULL,
	`severity` enum('Critical','High','Medium','Low') NOT NULL,
	`location` varchar(260),
	`resolved` int NOT NULL DEFAULT 0,
	CONSTRAINT `auditFindings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('Queued','Running','Complete') NOT NULL DEFAULT 'Complete',
	`summary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `codeChanges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`summary` varchar(220) NOT NULL,
	`diff` text NOT NULL,
	`status` enum('Proposed','Applied','Rejected') NOT NULL DEFAULT 'Proposed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedAt` timestamp,
	CONSTRAINT `codeChanges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`source` varchar(500) NOT NULL,
	`description` text,
	`languages` text,
	`frameworks` text,
	`dependencies` text,
	`status` enum('Connected','Inspecting','Ready') NOT NULL DEFAULT 'Ready',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastInspectedAt` timestamp,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('Inspection','Audit','Testing') NOT NULL,
	`title` varchar(220) NOT NULL,
	`markdown` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scriptRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scriptId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('Queued','Running','Passed','Failed','Not Verified') NOT NULL DEFAULT 'Queued',
	`output` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	CONSTRAINT `scriptRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`shell` enum('PowerShell','Shell') NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scripts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`description` text,
	`assignee` varchar(160),
	`status` enum('Pending','In Progress','Done') NOT NULL DEFAULT 'Pending',
	`priority` enum('Low','Medium','High') NOT NULL DEFAULT 'Medium',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `testRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`suiteName` varchar(180) NOT NULL,
	`status` enum('Passed','Failed','Running','Not Verified') NOT NULL DEFAULT 'Not Verified',
	`passed` int NOT NULL DEFAULT 0,
	`failed` int NOT NULL DEFAULT 0,
	`coverage` decimal(5,2),
	`output` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `testRuns_id` PRIMARY KEY(`id`)
);
