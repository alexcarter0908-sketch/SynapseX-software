import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  source: varchar("source", { length: 500 }).notNull(),
  description: text("description"),
  sourceContent: text("sourceContent"),
  archiveKey: varchar("archiveKey", { length: 500 }),
  archiveName: varchar("archiveName", { length: 260 }),
  archiveMime: varchar("archiveMime", { length: 120 }),
  archiveSize: int("archiveSize"),
  languages: text("languages"),
  frameworks: text("frameworks"),
  dependencies: text("dependencies"),
  status: mysqlEnum("status", ["Connected", "Inspecting", "Ready"]).default("Ready").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastInspectedAt: timestamp("lastInspectedAt"),
});

export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  description: text("description"),
  assignee: varchar("assignee", { length: 160 }),
  status: mysqlEnum("status", ["Pending", "In Progress", "Done"]).default("Pending").notNull(),
  priority: mysqlEnum("priority", ["Low", "Medium", "High"]).default("Medium").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const changeHistory = mysqlTable("changeHistory", {
  id: int("id").autoincrement().primaryKey(),
  changeId: int("changeId").notNull(),
  userId: int("userId").notNull(),
  action: mysqlEnum("action", ["Created", "Applied", "Rejected"]).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const codeChanges = mysqlTable("codeChanges", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  summary: varchar("summary", { length: 220 }).notNull(),
  diff: text("diff").notNull(),
  status: mysqlEnum("status", ["Proposed", "Applied", "Rejected"]).default("Proposed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt"),
});

export const audits = mysqlTable("audits", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["Queued", "Running", "Complete"]).default("Complete").notNull(),
  summary: text("summary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditFindings = mysqlTable("auditFindings", {
  id: int("id").autoincrement().primaryKey(),
  auditId: int("auditId").notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  detail: text("detail").notNull(),
  severity: mysqlEnum("severity", ["Critical", "High", "Medium", "Low"]).notNull(),
  location: varchar("location", { length: 260 }),
  resolved: int("resolved").default(0).notNull(),
});

export const scripts = mysqlTable("scripts", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 180 }).notNull(),
  shell: mysqlEnum("shell", ["PowerShell", "Shell"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const scriptRuns = mysqlTable("scriptRuns", {
  id: int("id").autoincrement().primaryKey(),
  scriptId: int("scriptId").notNull(),
  userId: int("userId").notNull(),
  status: mysqlEnum("status", ["Queued", "Running", "Passed", "Failed", "Not Verified"]).default("Queued").notNull(),
  output: text("output"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
});

export const testRuns = mysqlTable("testRuns", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  suiteName: varchar("suiteName", { length: 180 }).notNull(),
  status: mysqlEnum("status", ["Passed", "Failed", "Running", "Not Verified"]).default("Not Verified").notNull(),
  passed: int("passed").default(0).notNull(),
  failed: int("failed").default(0).notNull(),
  coverage: decimal("coverage", { precision: 5, scale: 2 }),
  output: text("output"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["Inspection", "Audit", "Testing"]).notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  markdown: text("markdown").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const activity = mysqlTable("activity", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId"),
  userId: int("userId").notNull(),
  kind: varchar("kind", { length: 80 }).notNull(),
  message: varchar("message", { length: 300 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const buildProposals = mysqlTable("buildProposals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  prompt: text("prompt").notNull(),
  analysis: text("analysis").notNull(),
  plan: text("plan").notNull(),
  files: text("files").notNull(),
  diffs: text("diffs").notNull(),
  operations: text("operations").notNull(),
  fileActions: text("fileActions").notNull(),
  verification: text("verification").notNull(),
  commands: text("commands").notNull(),
  risks: text("risks").notNull(),
  status: mysqlEnum("status", ["Proposed", "Applied", "Rejected"]).default("Proposed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const runners = mysqlTable("runners", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  status: mysqlEnum("status", ["Active", "Revoked"]).default("Active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt"),
});

export const executionRequests = mysqlTable("executionRequests", {
  id: int("id").autoincrement().primaryKey(),
  runnerId: int("runnerId").notNull(),
  userId: int("userId").notNull(),
  kind: mysqlEnum("kind", ["Script", "Test"]).notNull(),
  scriptId: int("scriptId"),
  scriptRunId: int("scriptRunId"),
  testRunId: int("testRunId"),
  status: mysqlEnum("status", ["Requested", "Running", "Passed", "Failed", "Not Verified"]).default("Requested").notNull(),
  output: text("output"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const assistantMessages = mysqlTable("assistantMessages", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId"),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Authorized workspace controls keep automated changes scoped to projects the owner explicitly approved.
export const workspaceAuthorizations = mysqlTable("workspaceAuthorizations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  rootPath: varchar("rootPath", { length: 500 }).notNull(),
  scopes: text("scopes").notNull(),
  status: mysqlEnum("status", ["Active", "Revoked"]).default("Active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Sessions preserve the original brief, structured task state, and final verification outcome.
export const developmentSessions = mysqlTable("developmentSessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  workspaceAuthorizationId: int("workspaceAuthorizationId"),
  originalRequirement: text("originalRequirement").notNull(),
  taskState: text("taskState").notNull(),
  status: mysqlEnum("status", ["Planned", "Awaiting Local Execution", "Repairing", "Pending External", "Verified", "Blocked"]).default("Planned").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Immutable append-only events make terminal evidence, repairs, and verification decisions auditable.
export const developmentSessionEvents = mysqlTable("developmentSessionEvents", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  userId: int("userId").notNull(),
  kind: mysqlEnum("kind", ["Requirement", "Plan", "Command", "Terminal Output", "Repair", "Verification", "Safety", "Status"]).notNull(),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type CodeChange = typeof codeChanges.$inferSelect;
export type ChangeHistory = typeof changeHistory.$inferSelect;
export type Audit = typeof audits.$inferSelect;
export type AuditFinding = typeof auditFindings.$inferSelect;
export type Script = typeof scripts.$inferSelect;
export type TestRun = typeof testRuns.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Activity = typeof activity.$inferSelect;
export type BuildProposal = typeof buildProposals.$inferSelect;
export type Runner = typeof runners.$inferSelect;
export type ExecutionRequest = typeof executionRequests.$inferSelect;
export type WorkspaceAuthorization = typeof workspaceAuthorizations.$inferSelect;
export type DevelopmentSession = typeof developmentSessions.$inferSelect;
export type DevelopmentSessionEvent = typeof developmentSessionEvents.$inferSelect;
