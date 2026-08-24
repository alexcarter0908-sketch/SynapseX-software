import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  activity,
  assistantMessages,
  auditFindings,
  changeHistory,
  buildProposals,
  audits,
  codeChanges,
  projects,
  reports,
  runners,
  executionRequests,
  scriptRuns,
  scripts,
  tasks,
  testRuns,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  values.lastSignedIn ??= new Date();
  updateSet.lastSignedIn ??= new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getProjectsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt));
}

export async function getAssistantMessagesForUser(userId: number, projectId?: number) {
  const db = await getDb();
  if (!db) return [];
  const condition = projectId ? and(eq(assistantMessages.userId, userId), eq(assistantMessages.projectId, projectId)) : eq(assistantMessages.userId, userId);
  return db.select().from(assistantMessages).where(condition).orderBy(assistantMessages.createdAt, assistantMessages.id);
}

export async function getProjectForUser(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects).where(and(eq(projects.userId, userId), eq(projects.id, projectId))).limit(1);
  return result[0];
}

export async function addActivity(userId: number, message: string, kind: string, projectId?: number) {
  if (process.env.VITEST) return;
  const db = await getDb();
  if (!db) return;
  await db.insert(activity).values({ userId, projectId, message, kind });
}

export async function getDashboardData(userId: number) {
  const db = await getDb();
  if (!db) return { projects: [], tasks: [], activity: [], audits: [], testRuns: [] };
  const [projectRows, taskRows, activityRows, auditRows, testRows] = await Promise.all([
    db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.updatedAt)),
    db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(desc(tasks.updatedAt)),
    db.select().from(activity).where(eq(activity.userId, userId)).orderBy(desc(activity.createdAt)).limit(12),
    db.select().from(audits).where(eq(audits.userId, userId)).orderBy(desc(audits.createdAt)).limit(8),
    db.select().from(testRuns).where(eq(testRuns.userId, userId)).orderBy(desc(testRuns.createdAt)).limit(8),
  ]);
  return { projects: projectRows, tasks: taskRows, activity: activityRows, audits: auditRows, testRuns: testRows };
}

export async function getTasksForUser(userId: number, projectId?: number) {
  const db = await getDb();
  if (!db) return [];
  const condition = projectId ? and(eq(tasks.userId, userId), eq(tasks.projectId, projectId)) : eq(tasks.userId, userId);
  return db.select().from(tasks).where(condition).orderBy(desc(tasks.updatedAt));
}

export async function getChangesForUser(userId: number, projectId?: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ change: codeChanges, task: tasks }).from(codeChanges).innerJoin(tasks, eq(codeChanges.taskId, tasks.id)).where(projectId ? and(eq(tasks.userId, userId), eq(tasks.projectId, projectId)) : eq(tasks.userId, userId)).orderBy(desc(codeChanges.createdAt));
  return rows;
}

export async function getAuditsForUser(userId: number, projectId?: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(audits).where(projectId ? and(eq(audits.userId, userId), eq(audits.projectId, projectId)) : eq(audits.userId, userId)).orderBy(desc(audits.createdAt));
  const result = [];
  for (const audit of rows) {
    const findings = await db.select().from(auditFindings).where(eq(auditFindings.auditId, audit.id));
    result.push({ audit, findings });
  }
  return result;
}

export async function getScriptsForUser(userId: number, projectId?: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scripts).where(projectId ? and(eq(scripts.userId, userId), eq(scripts.projectId, projectId)) : eq(scripts.userId, userId)).orderBy(desc(scripts.updatedAt));
}

export async function getScriptRunsForUser(userId: number, scriptId?: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scriptRuns).where(scriptId ? and(eq(scriptRuns.userId, userId), eq(scriptRuns.scriptId, scriptId)) : eq(scriptRuns.userId, userId)).orderBy(desc(scriptRuns.startedAt));
}

export async function getTestRunsForUser(userId: number, projectId?: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(testRuns).where(projectId ? and(eq(testRuns.userId, userId), eq(testRuns.projectId, projectId)) : eq(testRuns.userId, userId)).orderBy(desc(testRuns.createdAt));
}

export async function getReportsForUser(userId: number, projectId?: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(reports).where(projectId ? and(eq(reports.userId, userId), eq(reports.projectId, projectId)) : eq(reports.userId, userId)).orderBy(desc(reports.createdAt));
}

export { activity, assistantMessages, auditFindings, audits, buildProposals, changeHistory, codeChanges, executionRequests, projects, reports, runners, scriptRuns, scripts, tasks, testRuns };
