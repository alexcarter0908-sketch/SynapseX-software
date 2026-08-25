CREATE TABLE `workspaceAuthorizations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `label` varchar(160) NOT NULL,
  `rootPath` varchar(500) NOT NULL,
  `scopes` text NOT NULL,
  `status` enum('Active','Revoked') NOT NULL DEFAULT 'Active',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `workspaceAuthorizations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `developmentSessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `projectId` int,
  `workspaceAuthorizationId` int,
  `originalRequirement` text NOT NULL,
  `taskState` text NOT NULL,
  `status` enum('Planned','Awaiting Local Execution','Repairing','Pending External','Verified','Blocked') NOT NULL DEFAULT 'Planned',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `developmentSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `developmentSessionEvents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionId` int NOT NULL,
  `userId` int NOT NULL,
  `kind` enum('Requirement','Plan','Command','Terminal Output','Repair','Verification','Safety','Status') NOT NULL,
  `payload` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `developmentSessionEvents_id` PRIMARY KEY(`id`)
);
