import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import { buildUniversalGenerationContract, createFreeFirstArtifactPlan, evaluateGenerationEligibility, getExecutionTier, type UniversalGenerationContext } from "../shared/universalContract";
import { appendTerminalEvidence, createEngineeringTaskState, recordTaskRepair, type EngineeringProjectContext, type EngineeringTaskState } from "../shared/engineeringTask";
import {
  addActivity,
  assistantMessages,
  buildProposals,
  audits,
  changeHistory,
  codeChanges,
  executionRequests,
  runners,
  getAssistantMessagesForUser,
  getAuditsForUser,
  getChangesForUser,
  getDashboardData,
  getDb,
  getProjectForUser,
  getProjectsForUser,
  getReportsForUser,
  getScriptRunsForUser,
  getScriptsForUser,
  getTasksForUser,
  getTestRunsForUser,
  projects,
  reports,
  scriptRuns,
  scripts,
  tasks,
  testRuns,
} from "./db";

const projectInput = z.object({
  name: z.string().min(2).max(160),
  source: z.string().min(2).max(500),
  description: z.string().max(2000).optional(),
  sourceContent: z.string().max(60000).optional(),
  archiveBase64: z.string().max(28000000).optional(),
  archiveName: z.string().max(260).optional(),
  archiveMime: z.string().max(120).optional(),
});

export function validateProjectSourceContent(content?: string) {
  if (!content) return;
  const hasNullByte = content.includes("\u0000");
  const startsWithZipSignature = content.charCodeAt(0) === 0x50 && content.charCodeAt(1) === 0x4b && content.charCodeAt(2) === 0x03 && content.charCodeAt(3) === 0x04;
  const startsWithGzipSignature = content.charCodeAt(0) === 0x1f && content.charCodeAt(1) === 0x8b;
  if (hasNullByte || startsWithZipSignature || startsWithGzipSignature) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Project sourceContent must be readable text. Upload a supported source/config file or connect a repository link; archive binaries are not accepted." });
  }
}

function detectStack(source: string) {
  const value = source.toLowerCase();
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const dependencies = new Set<string>();
  if (value.includes(".py") || value.includes("python")) languages.add("Python");
  if (value.includes(".ts") || value.includes("typescript")) languages.add("TypeScript");
  if (value.includes(".js") || value.includes("javascript") || value.includes("node")) languages.add("JavaScript");
  if (value.includes(".go") || value.includes("golang")) languages.add("Go");
  if (value.includes(".rs") || value.includes("rust")) languages.add("Rust");
  if (value.includes(".java") || value.includes("spring")) languages.add("Java");
  if (value.includes(".cs") || value.includes("dotnet") || value.includes(".net")) languages.add("C#");
  if (value.includes("react")) frameworks.add("React");
  if (value.includes("next")) frameworks.add("Next.js");
  if (value.includes("vue")) frameworks.add("Vue");
  if (value.includes("angular")) frameworks.add("Angular");
  if (value.includes("express")) frameworks.add("Express");
  if (value.includes("laravel")) frameworks.add("Laravel");
  if (value.includes("spring")) frameworks.add("Spring Boot");
  for (const dependency of ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes", "GitHub Actions"]) {
    if (value.includes(dependency.toLowerCase())) dependencies.add(dependency);
  }
  if (languages.size === 0) languages.add("Not detected");
  if (frameworks.size === 0) frameworks.add("Not detected");
  if (dependencies.size === 0) dependencies.add("Not detected");
  return { languages: Array.from(languages), frameworks: Array.from(frameworks), dependencies: Array.from(dependencies) };
}

export async function fetchGitHubInspection(source: string, accessToken?: string) {
  const url = new URL(source);
  if (url.hostname !== "github.com") throw new TRPCError({ code: "BAD_REQUEST", message: "Only github.com repository links are supported by this inspection procedure." });
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "GitHub source must include an owner and repository." });
  const owner = parts[0]; const repo = parts[1].replace(/\\.git$/, "");
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "Universal-Engineering-Agent" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers });
  if (!response.ok) throw new TRPCError({ code: response.status === 401 ? "UNAUTHORIZED" : "BAD_REQUEST", message: "GitHub repository metadata could not be retrieved." });
  const metadata = await response.json() as { full_name?: string; language?: string; topics?: string[]; default_branch?: string; license?: { spdx_id?: string }; private?: boolean };
  const contentResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`, { headers });
  const entries = contentResponse.ok ? await contentResponse.json() as Array<{ name: string; type: string }> : [];
  const allowedFiles = new Set(["package.json", "requirements.txt", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", "composer.json", "README.md"]);
  const textParts: string[] = [JSON.stringify({ fullName: metadata.full_name, language: metadata.language, topics: metadata.topics, defaultBranch: metadata.default_branch, license: metadata.license?.spdx_id, private: metadata.private })];
  for (const entry of entries.slice(0, 100)) {
    if (entry.type !== "file" || !allowedFiles.has(entry.name)) continue;
    const fileResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(entry.name)}`, { headers: { ...headers, Accept: "application/vnd.github.raw+json" } });
    if (fileResponse.ok) textParts.push(`FILE:${entry.name}\\n${(await fileResponse.text()).slice(0, 12000)}`);
  }
  return { source: `https://github.com/${owner}/${repo}`, content: textParts.join("\\n\\n") };
}

async function fetchLinkedMetadata(source: string) {
  try {
    const url = new URL(source);
    if (url.hostname !== "github.com") return "";
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return "";
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1].replace(/\\.git$/, ""))}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "Universal-Engineering-Agent" } });
    if (!response.ok) return "";
    const data = await response.json() as { name?: string; language?: string; topics?: string[]; default_branch?: string; license?: { spdx_id?: string } };
    return JSON.stringify({ name: data.name, language: data.language, topics: data.topics, defaultBranch: data.default_branch, license: data.license?.spdx_id });
  } catch {
    return "";
  }
}

async function getActiveRunner(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(runners).where(and(eq(runners.userId, userId), eq(runners.status, "Active"))).orderBy(desc(runners.lastSeenAt)).limit(1))[0];
}

async function requireProject(userId: number, projectId: number) {
  const project = await getProjectForUser(userId, projectId);
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found or access denied." });
  return project;
}

export function validateSelfRunProposal(proposal: { files: Array<{ path: string; content: string }>; commands: string[] }, targetOs?: "Windows" | "Unix") {
  const issues: string[] = [];
  const files = proposal.files ?? [];
  const commands = proposal.commands ?? [];
  for (const command of commands) {
    const normalizedCommand = command.toLowerCase();
    if (normalizedCommand.includes("node -e") && (normalizedCommand.includes("writefilesync") || normalizedCommand.includes("writefile"))) issues.push("Do not inject source code through node -e or inline PowerShell escaping; save the complete generated file content as a separate file first.");
    if (normalizedCommand.includes("powershell") && normalizedCommand.includes("fs.writefilesync")) issues.push("PowerShell source injection is unsafe for TypeScript; use a complete file artifact and a safe file-save step instead.");
    if (targetOs === "Windows" && (normalizedCommand.includes("chmod ") || normalizedCommand.includes("ls -ld") || normalizedCommand.includes("mkdir -p") || normalizedCommand.startsWith("find "))) issues.push("Windows self-run proposals must use PowerShell commands, not Linux shell syntax.");
    if (targetOs === "Unix" && (normalizedCommand.includes("get-childitem") || normalizedCommand.includes("get-acl") || normalizedCommand.includes("new-item"))) issues.push("Unix self-run proposals must use POSIX shell commands, not PowerShell syntax.");
    const hasPlaceholder = normalizedCommand.includes("confirmed\\path") || normalizedCommand.includes("confirmed/path") || normalizedCommand.includes("path\\to") || normalizedCommand.includes("path/to") || normalizedCommand.includes("<confirmed");
    if (hasPlaceholder) issues.push("Commands contain a placeholder path; confirm the real path before running.");
    const normalized = command.replaceAll("\\\\", "/");
    const marker = normalized.toLowerCase().indexOf("scripts/");
    if (marker >= 0) {
      const expected = normalized.slice(marker + "scripts/".length).split(" ")[0].replaceAll("\"", "").replaceAll("'", "").toLowerCase();
      if (expected.endsWith(".ps1")) {
        const file = files.find((item) => item.path.toLowerCase().replaceAll("\\\\", "/").endsWith(`scripts/${expected}`) || item.path.toLowerCase().endsWith(expected));
        if (!file?.content?.trim()) issues.push(`Command references ${expected} but its complete file content is missing.`);
      }
    }
  }
  return issues;
}

export function repairUnsafeSourceCommands(proposal: BuildProposal, targetOs: "Windows" | "Unix" = "Windows"): BuildProposal {
  const files = proposal.files ?? [];
  const repairedCommands = proposal.commands.map((command) => {
    const normalized = command.toLowerCase();
    const isUnsafe = normalized.includes("node -e") || normalized.includes("fs.writefilesync") || normalized.includes("fs.writefile");
    if (!isUnsafe) return command;
    const firstFile = files[0]?.path ?? "src/index.ts";
    const safePath = firstFile.replace(/^[\\/]+/, "").replace(/'/g, "''");
    if (targetOs === "Unix") return `test -f '${safePath}' || { echo \"Download/copy the complete file artifact for ${safePath} first.\"; exit 1; }; echo \"Verified file artifact: ${safePath}\"`;
    return `$required = Join-Path (Get-Location) '${safePath}'; if (-not (Test-Path -LiteralPath $required)) { throw \"Download/copy the complete file artifact for ${safePath} first.\" }; Write-Host \"Verified file artifact: $required\"`;
  });
  const repaired = repairedCommands.some((command, index) => command !== proposal.commands[index]);
  if (!repaired) return proposal;
  return {
    ...proposal,
    commands: repairedCommands,
    risks: [...proposal.risks, "Unsafe inline source injection was replaced with a file-artifact verification step. Download or copy the complete file content before running commands."],
  };
}

function textContent(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => typeof item === "object" && item && "text" in item ? String(item.text) : "").join("\n");
  if (content && typeof content === "object") {
    const value = content as Record<string, unknown>;
    if (typeof value.text === "string") return value.text;
    if (typeof value.content === "string") return value.content;
    if (typeof value.value === "string") return value.value;
    if (value.json && typeof value.json === "object") return JSON.stringify(value.json);
  }
  return "The assistant returned no readable response.";
}

type BuildProposal = {
  analysis: string;
  plan: string[];
  files: Array<{ path: string; purpose: string; content: string }>;
  diffs: Array<{ path: string; diff: string }>;
  operations: string[];
  fileActions: Array<{ action: "Create" | "Update" | "Delete"; path: string; reason: string }>;
  verification: string[];
  commands: string[];
  risks: string[];
  taskState?: EngineeringTaskState;
  generation?: { provider: "local-ollama" | "direct-native" | "hosted-model" | "model-unavailable"; model?: string; ready: boolean };
};

export function parseBuildProposal(content: unknown): BuildProposal {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const value = content as Record<string, unknown>;
    if (typeof value.analysis === "string") return normalizeBuildProposal(value);
  }
  const raw = textContent(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object found");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  return normalizeBuildProposal(parsed);
}

async function requestLocalOllamaProposal(prompt: string, contract: string, projectContext?: EngineeringProjectContext): Promise<BuildProposal> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const baseUrl = (process.env.SYNAPSEX_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.SYNAPSEX_OLLAMA_MODEL || "qwen2.5-coder:7b";
  const inspectedProject = projectContext
    ? `\n\nINSPECTED PROJECT CONTEXT:\n${JSON.stringify(projectContext)}\nTreat this as the existing project. Preserve working behavior, modify only files justified by the request, and explain any information that is unavailable.`
    : "\n\nNo existing project was supplied. Create a new project that directly satisfies the brief.";
  const instruction = `You are SynapseX Local Engineering Assistant. Return ONLY one valid JSON object with these required keys: analysis, plan, files, diffs, operations, fileActions, verification, commands, risks. Each file requires path, purpose, and complete content. Each diff requires path and diff. Each fileAction requires action (Create, Update, or Delete), path, and reason. Build the requested product, not a generic starter. Choose an appropriate architecture from the brief. Include only commands that match the chosen runtime. Never claim execution. Do not fabricate testimonials, customer reviews, performance numbers, users, revenue, or security validation. Do not produce destructive, bypass, credential theft, rooting, jailbreak, or unauthorized-access instructions.\n\n${contract}${inspectedProject}\n\nUSER BRIEF:\n${prompt}`;
  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: instruction, stream: false, format: "json", options: { temperature: 0.2 } }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const body = await response.json() as { response?: string };
    if (!body.response) throw new Error("Ollama returned no proposal text");
    return parseBuildProposal(body.response);
  } finally {
    clearTimeout(timeout);
  }
}

export async function inspectLocalOllama() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  const baseUrl = (process.env.SYNAPSEX_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.SYNAPSEX_OLLAMA_MODEL || "qwen2.5-coder:7b";
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    if (!response.ok) return { ready: false, reachable: false, baseUrl, model, reason: `Ollama returned HTTP ${response.status}.` };
    const body = await response.json() as { models?: Array<{ name?: string }> };
    const installed = body.models?.some((item) => item.name === model || item.name?.startsWith(`${model}:`)) ?? false;
    return installed
      ? { ready: true, reachable: true, baseUrl, model, reason: "The configured local coding model is ready." }
      : { ready: false, reachable: true, baseUrl, model, reason: `Ollama is running, but ${model} is not installed.` };
  } catch {
    return { ready: false, reachable: false, baseUrl, model, reason: "Ollama is not reachable on this computer." };
  } finally {
    clearTimeout(timeout);
  }
}

export function createModelUnavailableProposal(prompt: string, status: { reachable: boolean; model: string; reason: string }): BuildProposal {
  return {
    analysis: `No implementation was fabricated. The requested engineering work is pending because ${status.reason} SynapseX needs the local coding model to understand and generate arbitrary software work.`,
    plan: ["Make the free local coding model available", "Re-submit the original brief without changing it", "Review the generated implementation, run commands locally, and return the complete terminal evidence"],
    files: [],
    diffs: [],
    operations: ["Record the original requirement as pending local-model generation"],
    fileActions: [],
    verification: ["Run ollama --version and confirm it prints a version.", `Run ollama list and confirm ${status.model} appears.`, "Submit the same original prompt again; only then will SynapseX generate implementation files and project commands."],
    commands: status.reachable ? [`ollama pull ${status.model}`, "ollama list"] : ["winget install --id Ollama.Ollama -e", `ollama pull ${status.model}`, "ollama list"],
    risks: ["PENDING: A local model is required for arbitrary software implementation.", "No source files, commands, tests, deployment, or external integration were claimed as completed."],
    generation: { provider: "model-unavailable", model: status.model, ready: false },
  };
}

function projectContextFromRecord(project: { name: string; source: string; languages?: string | null; frameworks?: string | null; dependencies?: string | null; sourceContent?: string | null } | undefined): EngineeringProjectContext | undefined {
  if (!project) return undefined;
  const asList = (value?: string | null) => {
    try { return value ? JSON.parse(value) as string[] : []; } catch { return value ? [value] : []; }
  };
  return {
    name: project.name,
    source: project.source,
    languages: asList(project.languages),
    frameworks: asList(project.frameworks),
    dependencies: asList(project.dependencies),
    evidence: project.sourceContent?.slice(0, 24_000),
  };
}

function withUniversalTaskState(proposal: BuildProposal, prompt: string, context: UniversalGenerationContext, projectContext: EngineeringProjectContext | undefined, generation: NonNullable<BuildProposal["generation"]>) {
  const externalPrerequisites = generation.provider === "model-unavailable" ? ["Free local coding model availability"] : [];
  return {
    ...proposal,
    generation,
    taskState: createEngineeringTaskState({
      taskId: `task-${randomBytes(8).toString("hex")}`,
      originalRequirement: prompt,
      analysis: proposal.analysis,
      target: context.targetId,
      runtime: context.runtime,
      projectContext,
      plan: proposal.plan,
      files: proposal.files,
      commands: proposal.commands,
      verification: proposal.verification,
      externalPrerequisites,
    }),
  };
}

function normalizeBuildProposal(value: Record<string, unknown>): BuildProposal {
  const arrays = ["plan", "files", "diffs", "operations", "fileActions", "verification", "commands", "risks"];
  if (typeof value.analysis !== "string" || arrays.some((key) => !Array.isArray(value[key]))) throw new Error("Proposal schema is incomplete");
  const files = value.files as Array<Record<string, unknown>>;
  const diffs = value.diffs as Array<Record<string, unknown>>;
  const actions = value.fileActions as Array<Record<string, unknown>>;
  if (files.some((item) => typeof item.path !== "string" || typeof item.purpose !== "string" || typeof item.content !== "string")) throw new Error("Proposal file entries are incomplete");
  if (diffs.some((item) => typeof item.path !== "string" || typeof item.diff !== "string")) throw new Error("Proposal diff entries are incomplete");
  if (actions.some((item) => !["Create", "Update", "Delete"].includes(String(item.action)) || typeof item.path !== "string" || typeof item.reason !== "string")) throw new Error("Proposal action entries are incomplete");
  return value as unknown as BuildProposal;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    summary: protectedProcedure.query(({ ctx }) => getDashboardData(ctx.user.id)),
  }),
  projects: router({
    list: protectedProcedure.query(({ ctx }) => getProjectsForUser(ctx.user.id)),
    create: protectedProcedure.input(projectInput).mutation(async ({ ctx, input }) => {
      validateProjectSourceContent(input.sourceContent);
      let archive: { key: string; name: string; mime: string; size: number } | undefined;
      if (input.archiveBase64) {
        if (!input.archiveName) throw new TRPCError({ code: "BAD_REQUEST", message: "Archive name is required." });
        const bytes = Buffer.from(input.archiveBase64, "base64");
        const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
        const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
        if (!isZip && !isGzip) throw new TRPCError({ code: "BAD_REQUEST", message: "Only ZIP or GZIP archive files are supported." });
        const stored = await storagePut(`projects/${ctx.user.id}/${input.archiveName}`, bytes, input.archiveMime ?? "application/octet-stream");
        archive = { key: stored.key, name: input.archiveName, mime: input.archiveMime ?? "application/octet-stream", size: bytes.length };
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const linkedMetadata = await fetchLinkedMetadata(input.source);
      const inspectableContent = [input.sourceContent, linkedMetadata].filter(Boolean).join("\n");
      const stack = detectStack(`${input.source} ${inspectableContent}`);
      const result = await db.insert(projects).values({ userId: ctx.user.id, name: input.name, source: input.source, description: input.description, sourceContent: input.sourceContent ?? (linkedMetadata || null), archiveKey: archive?.key, archiveName: archive?.name, archiveMime: archive?.mime, archiveSize: archive?.size, languages: JSON.stringify(stack.languages), frameworks: JSON.stringify(stack.frameworks), dependencies: JSON.stringify(stack.dependencies), lastInspectedAt: new Date() });
      const projectId = Number(result[0].insertId);
      await addActivity(ctx.user.id, `Inspected ${input.name} and detected its technology profile`, "inspection", projectId);
      return { id: projectId, ...stack };
    }),
    remove: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), confirm: z.literal(true) })).mutation(async ({ ctx, input }) => {
      const project = await requireProject(ctx.user.id, input.projectId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      await db.delete(projects).where(eqProject(project.id));
      return { success: true, deletedProjectId: project.id } as const;
    }),
    inspectGitHub: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), source: z.string().url(), accessToken: z.string().min(10).optional() })).mutation(async ({ ctx, input }) => {
      const project = await requireProject(ctx.user.id, input.projectId);
      const inspected = await fetchGitHubInspection(input.source, input.accessToken);
      const stack = detectStack(`${inspected.source} ${inspected.content}`);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      await db.update(projects).set({ source: inspected.source, sourceContent: inspected.content, languages: JSON.stringify(stack.languages), frameworks: JSON.stringify(stack.frameworks), dependencies: JSON.stringify(stack.dependencies), status: "Ready", lastInspectedAt: new Date() }).where(eqProject(project.id));
      await addActivity(ctx.user.id, `Inspected authorized GitHub content for ${project.name}`, "inspection", project.id);
      return stack;
    }),
    inspect: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const project = await requireProject(ctx.user.id, input.projectId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const stack = detectStack(`${project.name} ${project.source} ${project.description ?? ""} ${project.sourceContent ?? ""}`);
      await db.update(projects).set({ status: "Ready", languages: JSON.stringify(stack.languages), frameworks: JSON.stringify(stack.frameworks), dependencies: JSON.stringify(stack.dependencies), lastInspectedAt: new Date() }).where(eqProject(project.id));
      await addActivity(ctx.user.id, `Re-inspected ${project.name}`, "inspection", project.id);
      return stack;
    }),
  }),
  tasks: router({
    list: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => getTasksForUser(ctx.user.id, input?.projectId)),
    create: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), title: z.string().min(3).max(220), description: z.string().max(4000).optional(), assignee: z.string().max(160).optional(), priority: z.enum(["Low", "Medium", "High"]).default("Medium"), diff: z.string().max(12000).optional() })).mutation(async ({ ctx, input }) => {
      await requireProject(ctx.user.id, input.projectId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const result = await db.insert(tasks).values({ userId: ctx.user.id, projectId: input.projectId, title: input.title, description: input.description, assignee: input.assignee, priority: input.priority });
      const taskId = Number(result[0].insertId);
      if (input.diff) { const changeResult = await db.insert(codeChanges).values({ taskId, summary: `Proposed change for ${input.title}`, diff: input.diff }); await db.insert(changeHistory).values({ changeId: Number(changeResult[0].insertId), userId: ctx.user.id, action: "Created", note: "Proposed change created with task." }); }
      await addActivity(ctx.user.id, `Created task: ${input.title}`, "task", input.projectId);
      return { id: taskId };
    }),
    detail: protectedProcedure.input(z.object({ taskId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const task = (await db.select().from(tasks).where(andTask(ctx.user.id, input.taskId)).limit(1))[0];
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found or access denied." });
      const changes = await db.select().from(codeChanges).where(eq(codeChanges.taskId, task.id));
      const history = [];
      for (const change of changes) history.push({ change, events: await db.select().from(changeHistory).where(eq(changeHistory.changeId, change.id)).orderBy(desc(changeHistory.createdAt)) });
      return { task, changes: history };
    }),
    updateAssignee: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), assignee: z.string().max(160).nullable() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const task = (await db.select().from(tasks).where(andTask(ctx.user.id, input.taskId)).limit(1))[0];
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found or access denied." });
      await db.update(tasks).set({ assignee: input.assignee }).where(eqTask(input.taskId));
      await addActivity(ctx.user.id, `${input.assignee ? `Assigned ${task.title} to ${input.assignee}` : `Unassigned ${task.title}`}`, "task", task.projectId);
      return { success: true };
    }),
    updateStatus: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), status: z.enum(["Pending", "In Progress", "Done"]) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const result = await db.select().from(tasks).where(andTask(ctx.user.id, input.taskId)).limit(1);
      const task = result[0];
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found or access denied." });
      await db.update(tasks).set({ status: input.status }).where(eqTask(input.taskId));
      await addActivity(ctx.user.id, `Moved ${task.title} to ${input.status}`, "task", task.projectId);
      return { success: true };
    }),
  }),
  changes: router({
    list: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => getChangesForUser(ctx.user.id, input?.projectId)),
    review: protectedProcedure.input(z.object({ changeId: z.number().int().positive(), status: z.enum(["Applied", "Rejected"]) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const row = await db.select({ change: codeChanges, task: tasks }).from(codeChanges).innerJoin(tasks, eqTaskJoin(input.changeId)).where(andChangeOwner(ctx.user.id, input.changeId)).limit(1);
      if (!row[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Code change not found or access denied." });
      await db.update(codeChanges).set({ status: input.status, reviewedAt: new Date() }).where(eqChange(input.changeId));
      await db.insert(changeHistory).values({ changeId: input.changeId, userId: ctx.user.id, action: input.status, note: `Code change ${input.status.toLowerCase()} by authenticated reviewer.` });
      await addActivity(ctx.user.id, `${input.status} proposed code change`, "change", row[0].task.projectId);
      return { success: true };
    }),
  }),
  audits: router({
    list: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => getAuditsForUser(ctx.user.id, input?.projectId)),
    run: protectedProcedure.input(z.object({ projectId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const project = await requireProject(ctx.user.id, input.projectId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const scanText = `${project.name} ${project.source} ${project.description ?? ""} ${project.sourceContent ?? ""}`;
      const checks = [
        { hit: /api[_-]?key|secret|private[_-]?key/i.test(scanText), title: "Potential hardcoded secret", detail: "A secret-like token was found in the supplied project metadata. Review the source before proceeding.", severity: "Critical" as const },
        { hit: /eval\(|innerhtml|dangerouslysetinnerhtml/i.test(scanText), title: "Unsafe code execution or HTML sink", detail: "A high-risk execution or HTML sink pattern was detected in the supplied project metadata.", severity: "High" as const },
        { hit: /cors|access-control-allow-origin:\s*\*/i.test(scanText), title: "Broad cross-origin policy", detail: "A permissive CORS pattern was detected in the supplied project metadata.", severity: "Medium" as const },
      ];
      const result = await db.insert(audits).values({ projectId: project.id, userId: ctx.user.id, status: "Complete", summary: "Rule-based scan completed against the supplied project metadata. Full source scan requires project content." });
      const auditId = Number(result[0].insertId);
      for (const check of checks.filter((item) => item.hit)) await db.insert((await import("./db")).auditFindings).values({ auditId, title: check.title, detail: check.detail, severity: check.severity, location: project.source });
      await addActivity(ctx.user.id, `Completed security audit for ${project.name}`, "audit", project.id);
      return { auditId, findings: checks.filter((item) => item.hit).length, notVerified: true };
    }),
  }),
  runners: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: runners.id, name: runners.name, status: runners.status, createdAt: runners.createdAt, lastSeenAt: runners.lastSeenAt }).from(runners).where(eq(runners.userId, ctx.user.id)).orderBy(desc(runners.createdAt));
    }),
    register: protectedProcedure.input(z.object({ name: z.string().min(2).max(160) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const token = `uea_${randomBytes(24).toString("hex")}`;
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const result = await db.insert(runners).values({ userId: ctx.user.id, name: input.name, tokenHash, status: "Active" });
      return { id: Number(result[0].insertId), name: input.name, token, warning: "Store this token securely. It will not be shown again." };
    }),
    revoke: protectedProcedure.input(z.object({ runnerId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      await db.update(runners).set({ status: "Revoked" }).where(and(eq(runners.id, input.runnerId), eq(runners.userId, ctx.user.id)));
      return { success: true };
    }),
    callback: publicProcedure.input(z.object({ token: z.string().min(10), requestId: z.number().int().positive(), status: z.enum(["Running", "Passed", "Failed", "Not Verified"]), output: z.string().max(60000).optional() })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const tokenHash = createHash("sha256").update(input.token).digest("hex");
      const runner = (await db.select().from(runners).where(and(eq(runners.tokenHash, tokenHash), eq(runners.status, "Active"))).limit(1))[0];
      if (!runner) throw new TRPCError({ code: "UNAUTHORIZED", message: "Runner token is invalid or revoked." });
      const request = (await db.select().from(executionRequests).where(and(eq(executionRequests.id, input.requestId), eq(executionRequests.runnerId, runner.id))).limit(1))[0];
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Execution request not found." });
      await db.update(runners).set({ lastSeenAt: new Date() }).where(eq(runners.id, runner.id));
      await db.update(executionRequests).set({ status: input.status, output: input.output ?? null }).where(eq(executionRequests.id, request.id));
      if (request.scriptRunId) await db.update(scriptRuns).set({ status: input.status, output: input.output ?? null, finishedAt: input.status === "Running" ? undefined : new Date() }).where(and(eq(scriptRuns.id, request.scriptRunId), eq(scriptRuns.userId, request.userId)));
      if (request.testRunId) await db.update(testRuns).set({ status: input.status, output: input.output ?? null }).where(eq(testRuns.id, request.testRunId));
      return { success: true };
    }),
  }),
  scripts: router({
    list: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => getScriptsForUser(ctx.user.id, input?.projectId)),
    runs: protectedProcedure.input(z.object({ scriptId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => getScriptRunsForUser(ctx.user.id, input?.scriptId)),
    create: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), name: z.string().min(2).max(180), shell: z.enum(["PowerShell", "Shell"]), content: z.string().min(1).max(20000) })).mutation(async ({ ctx, input }) => {
      await requireProject(ctx.user.id, input.projectId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const result = await db.insert(scripts).values({ ...input, userId: ctx.user.id });
      await addActivity(ctx.user.id, `Saved ${input.shell} script ${input.name}`, "automation", input.projectId);
      return { id: Number(result[0].insertId) };
    }),
    run: protectedProcedure.input(z.object({ scriptId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const script = (await db.select().from(scripts).where(andScriptOwner(ctx.user.id, input.scriptId)).limit(1))[0];
      if (!script) throw new TRPCError({ code: "NOT_FOUND", message: "Script not found or access denied." });
      const runner = await getActiveRunner(ctx.user.id);
      if (!runner) { const output = `NOT VERIFIED\nNo authorized runner is registered. Register a runner before executing ${script.shell} code.`; const result = await db.insert(scriptRuns).values({ scriptId: script.id, userId: ctx.user.id, status: "Not Verified", output, finishedAt: new Date() }); await addActivity(ctx.user.id, `Blocked ${script.name}; no authorized runner is registered`, "automation", script.projectId); return { id: Number(result[0].insertId), status: "Not Verified", output }; }
      const runResult = await db.insert(scriptRuns).values({ scriptId: script.id, userId: ctx.user.id, status: "Running", output: `Execution requested from runner ${runner.name}.` });
      const request = await db.insert(executionRequests).values({ runnerId: runner.id, userId: ctx.user.id, kind: "Script", scriptId: script.id, scriptRunId: Number(runResult[0].insertId), status: "Requested" });
      await addActivity(ctx.user.id, `Requested ${script.name} on runner ${runner.name}`, "automation", script.projectId);
      return { id: Number(runResult[0].insertId), requestId: Number(request[0].insertId), status: "Requested", output: `Execution requested from runner ${runner.name}.` };
    }),
  }),
  tests: router({
    list: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => getTestRunsForUser(ctx.user.id, input?.projectId)),
    run: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), suiteName: z.string().min(2).max(180) })).mutation(async ({ ctx, input }) => {
      await requireProject(ctx.user.id, input.projectId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const runner = await getActiveRunner(ctx.user.id);
      if (!runner) { const output = "NOT VERIFIED\nNo authorized runner is registered for this test suite."; const result = await db.insert(testRuns).values({ ...input, userId: ctx.user.id, status: "Not Verified", output }); await addActivity(ctx.user.id, `Blocked ${input.suiteName}; no authorized runner is registered`, "testing", input.projectId); return { id: Number(result[0].insertId), status: "Not Verified", output }; }
      const testResult = await db.insert(testRuns).values({ ...input, userId: ctx.user.id, status: "Running", output: `Test execution requested from runner ${runner.name}.` });
      const request = await db.insert(executionRequests).values({ runnerId: runner.id, userId: ctx.user.id, kind: "Test", testRunId: Number(testResult[0].insertId), status: "Requested" });
      await addActivity(ctx.user.id, `Requested ${input.suiteName} on runner ${runner.name}`, "testing", input.projectId);
      return { id: Number(testResult[0].insertId), requestId: Number(request[0].insertId), status: "Requested", output: `Test execution requested from runner ${runner.name}.` };
    }),
  }),
  reports: router({
    list: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => getReportsForUser(ctx.user.id, input?.projectId)),
    generate: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), type: z.enum(["Inspection", "Audit", "Testing"]) })).mutation(async ({ ctx, input }) => {
      const project = await requireProject(ctx.user.id, input.projectId);
      const data = await getDashboardData(ctx.user.id);
      const markdown = `# ${input.type} Report — ${project.name}\n\nGenerated: ${new Date().toISOString()}\n\n## Project\n- Source: ${project.source}\n- Languages: ${project.languages ?? "Not detected"}\n- Frameworks: ${project.frameworks ?? "Not detected"}\n- Dependencies: ${project.dependencies ?? "Not detected"}\n\n## Verification\nThis report contains recorded platform data only. Any operation not executed by an authorized runner is marked **NOT VERIFIED**.\n\n## Recent activity\n${data.activity.map((item) => `- ${item.message}`).join("\n") || "- No activity recorded."}\n`;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const result = await db.insert(reports).values({ projectId: project.id, userId: ctx.user.id, type: input.type, title: `${input.type} Report — ${project.name}`, markdown });
      return { id: Number(result[0].insertId), title: `${input.type} Report — ${project.name}`, markdown };
    }),
  }),
  approvals: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select({ id: executionRequests.id, kind: executionRequests.kind, status: executionRequests.status, createdAt: executionRequests.createdAt, updatedAt: executionRequests.updatedAt, runnerId: executionRequests.runnerId }).from(executionRequests).where(eq(executionRequests.userId, ctx.user.id)).orderBy(desc(executionRequests.updatedAt));
    }),
  }),
  builder: router({
    localModelStatus: publicProcedure.query(() => inspectLocalOllama()),
    list: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(buildProposals).where(input?.projectId ? and(eq(buildProposals.userId, ctx.user.id), eq(buildProposals.projectId, input.projectId)) : eq(buildProposals.userId, ctx.user.id)).orderBy(desc(buildProposals.createdAt));
    }),
    generate: protectedProcedure.input(z.object({ prompt: z.string().min(8).max(30000), projectId: z.number().int().positive().optional(), projectContext: z.object({ name: z.string().max(260).optional(), source: z.string().max(500).optional(), languages: z.array(z.string().max(100)).max(30).optional(), frameworks: z.array(z.string().max(100)).max(30).optional(), dependencies: z.array(z.string().max(120)).max(100).optional(), evidence: z.string().max(60000).optional() }).optional(), generationMode: z.enum(["free", "local", "model"]).default("free"), context: z.object({ targetId: z.enum(["windows-powershell", "linux-bash", "macos-zsh", "python", "node", "web", "api", "android-managed"]), projectType: z.string().min(2).max(120), runtime: z.string().max(120).optional(), permissionLevel: z.enum(["standard", "administrator", "owner-confirmed"]), targetConfirmed: z.boolean() }).optional() })).mutation(async ({ ctx, input }) => {
      const project = input.projectId ? await requireProject(ctx.user.id, input.projectId) : undefined;
      const selectedProjectContext = input.projectContext ?? projectContextFromRecord(project);
      const context: UniversalGenerationContext = input.context ?? { targetId: "windows-powershell", projectType: "General software", permissionLevel: "standard", targetConfirmed: false };
      const contract = buildUniversalGenerationContract(context);
      const eligibility = evaluateGenerationEligibility(input.generationMode, input.prompt, context);
      if (!eligibility.allowed) throw new TRPCError({ code: eligibility.risk === "blocked" ? "FORBIDDEN" : "BAD_REQUEST", message: eligibility.reason });
      if (input.generationMode !== "model") {
        const tier = getExecutionTier(input.prompt, context);
        let proposal: BuildProposal;
        let generation: NonNullable<BuildProposal["generation"]>;
        if (tier === "direct-native") {
          const direct = createFreeFirstArtifactPlan(input.prompt, context);
          proposal = {
            ...direct,
            diffs: [],
            operations: ["Perform the requested reviewed native action", "Return only visual or terminal evidence from this exact action"],
            fileActions: [],
          };
          generation = { provider: "direct-native", ready: true };
        } else {
          const localModel = await inspectLocalOllama();
          if (!localModel.ready) {
            proposal = createModelUnavailableProposal(input.prompt, localModel);
            generation = { provider: "model-unavailable", model: localModel.model, ready: false };
          } else {
            try {
              proposal = await requestLocalOllamaProposal(input.prompt, contract, selectedProjectContext);
              proposal = repairUnsafeSourceCommands(proposal, context.targetId === "linux-bash" || context.targetId === "macos-zsh" ? "Unix" : "Windows");
              generation = { provider: "local-ollama", model: localModel.model, ready: true };
            } catch {
              proposal = createModelUnavailableProposal(input.prompt, { reachable: true, model: localModel.model, reason: "the local model returned an invalid or incomplete engineering proposal." });
              generation = { provider: "model-unavailable", model: localModel.model, ready: false };
            }
          }
        }
        proposal = withUniversalTaskState(proposal, input.prompt, context, selectedProjectContext, generation);
        if (ENV.isLocalDemo) return { id: 0, status: "Proposed", ...proposal, localDemo: true };
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
        const result = await db.insert(buildProposals).values({ userId: ctx.user.id, projectId: input.projectId, prompt: input.prompt, analysis: proposal.analysis, plan: JSON.stringify(proposal.plan), files: JSON.stringify(proposal.files), diffs: JSON.stringify(proposal.diffs), operations: JSON.stringify(proposal.operations), fileActions: JSON.stringify(proposal.fileActions), verification: JSON.stringify(proposal.verification), commands: JSON.stringify(proposal.commands), risks: JSON.stringify(proposal.risks), status: "Proposed" });
        await addActivity(ctx.user.id, generation.provider === "local-ollama" ? "Generated a model-backed engineering proposal with local Ollama" : generation.provider === "direct-native" ? "Prepared a reviewed direct native action" : "Marked engineering work pending because the local model is unavailable", "builder", input.projectId);
        return { id: Number(result[0].insertId), status: "Proposed", ...proposal };
      }
      const promptForModel = `${contract}\n\n${input.prompt.length <= 18000 ? input.prompt : `${input.prompt.slice(0, 12000)}\n\n[Middle of brief compacted for model context]\n\n${input.prompt.slice(-5000)}`}`;
      const response = await invokeLLM({
        messages: [{ role: "system", content: "You are Universal Engineering Agent Builder, a general-purpose prompt-to-software engineer. Convert any natural-language request into a concrete, production-minded engineering proposal for websites, web apps, mobile apps, desktop tools, APIs, automations, scripts, data systems, or other lawful software. Infer sensible technology choices when the user does not specify them and explain those choices plainly. The proposal must be implementable, not merely conceptual. For websites and apps, prioritize a polished responsive user experience, coherent visual system, accessible interactions, meaningful empty/loading/error states, realistic content structure without fabricated testimonials or reviews, and production-ready project setup. Before returning JSON, self-review the plan for missing files, broken imports, incomplete flows, weak visual quality, and missing verification; correct those gaps. Return only JSON matching the schema. Generate complete file contents whenever a file is proposed. For self-run requests, never provide commands that assume a proposed script already exists: include the full script content and an exact safe save/create command or clearly label the file as not yet created. For source files containing TypeScript, JavaScript, JSON, template literals, backslashes, dollar signs, quotes, or emojis, never use node -e, fs.writeFileSync with inline source, or a giant PowerShell here-string as the primary delivery method; deliver the complete file as a separate copyable/downloadable artifact and use a safe file-save workflow. Commands must be copy/paste-ready, must not use placeholder paths as if they were real, and must include verification and rollback steps. Never claim files were written, commands were executed, tests passed, or self-modification occurred; this is a proposal until explicitly approved and sent to an authorized runner. For defensive folder protection requests, propose least-privilege ACLs, encryption-at-rest, password or OS credential integration, backup/recovery steps, and verification commands; never claim local access or that protection was applied. Refuse destructive, credential-exfiltrating, unauthorized bypass, or password-cracking actions. For any generated server, state the exact PORT source (environment variable with a safe local default), the start command, the expected localhost URL including the numeric port, and a concrete health-check command such as Invoke-WebRequest or curl. Distinguish clearly between local server expected, runner execution requested, health check passed, and production deployment; never say a server is live, running, deployed, or verified unless an authorized execution result or health check recorded that fact. " + (project ? `Project context: ${project.name}; source: ${project.source}; detected languages: ${project.languages ?? "unknown"}; frameworks: ${project.frameworks ?? "unknown"}.` : "No project context was selected.") }, { role: "user", content: promptForModel }],
        response_format: { type: "json_schema", json_schema: { name: "engineering_build_proposal", strict: true, schema: { type: "object", properties: { analysis: { type: "string" }, plan: { type: "array", items: { type: "string" } }, files: { type: "array", items: { type: "object", properties: { path: { type: "string" }, purpose: { type: "string" }, content: { type: "string" } }, required: ["path", "purpose", "content"], additionalProperties: false } }, diffs: { type: "array", items: { type: "object", properties: { path: { type: "string" }, diff: { type: "string" } }, required: ["path", "diff"], additionalProperties: false } }, operations: { type: "array", items: { type: "string" } }, fileActions: { type: "array", items: { type: "object", properties: { action: { type: "string", enum: ["Create", "Update", "Delete"] }, path: { type: "string" }, reason: { type: "string" } }, required: ["action", "path", "reason"], additionalProperties: false } }, verification: { type: "array", items: { type: "string" } }, commands: { type: "array", items: { type: "string" } }, risks: { type: "array", items: { type: "string" } } }, required: ["analysis", "plan", "files", "diffs", "operations", "fileActions", "verification", "commands", "risks"], additionalProperties: false } } }
      });
      let proposal: BuildProposal;
      try {
        proposal = parseBuildProposal(response.choices?.[0]?.message?.content);
      } catch {
        const retry = await invokeLLM({
          messages: [
            { role: "system", content: "Return only compact valid JSON for the requested engineering proposal. Do not use markdown fences. Include every required key: analysis, plan, files, diffs, operations, fileActions, verification, commands, risks. If the request is large, keep explanations concise but keep complete file contents." },
            { role: "user", content: promptForModel },
          ],
          response_format: { type: "json_object" },
        });
        try {
          proposal = parseBuildProposal(retry.choices?.[0]?.message?.content);
        } catch {
          const mvpRetry = await invokeLLM({
            messages: [
              { role: "system", content: "Create a compact MVP engineering proposal as valid JSON only. Do not use markdown. Scope the request to the smallest useful vertical slice. Include no more than 5 files, keep each file concise but complete, and include these exact keys: analysis, plan, files, diffs, operations, fileActions, verification, commands, risks. Put future features in plan or risks instead of generating them now." },
              { role: "user", content: promptForModel },
            ],
            response_format: { type: "json_object" },
          });
          try {
            proposal = parseBuildProposal(mvpRetry.choices?.[0]?.message?.content);
          } catch {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The model response could not be validated. No incomplete scaffold was generated; retry with the local coding model or provide a narrower first implementation stage." });
          }
        }
      }
      if (input.prompt.includes("self-run")) {
        const targetOs = /Target operating system is Windows PowerShell/i.test(input.prompt) ? "Windows" : /Target operating system is Unix shell/i.test(input.prompt) ? "Unix" : "Windows";
        proposal = repairUnsafeSourceCommands(proposal, targetOs);
        const selfRunIssues = validateSelfRunProposal(proposal, targetOs);
        if (selfRunIssues.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: `Self-run proposal needs correction: ${selfRunIssues.join(" ")}` });
      }
      proposal = withUniversalTaskState(proposal, input.prompt, context, selectedProjectContext, { provider: "hosted-model", ready: true });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const result = await db.insert(buildProposals).values({ userId: ctx.user.id, projectId: input.projectId, prompt: input.prompt, analysis: proposal.analysis, plan: JSON.stringify(proposal.plan), files: JSON.stringify(proposal.files), diffs: JSON.stringify(proposal.diffs), operations: JSON.stringify(proposal.operations), fileActions: JSON.stringify(proposal.fileActions), verification: JSON.stringify(proposal.verification), commands: JSON.stringify(proposal.commands), risks: JSON.stringify(proposal.risks), status: "Proposed" });
      await addActivity(ctx.user.id, `Generated a code proposal from an engineering prompt`, "builder", input.projectId);
      return { id: Number(result[0].insertId), status: "Proposed", ...proposal };
    }),
    diagnose: protectedProcedure.input(z.object({ originalRequirement: z.string().min(8).max(30000), terminalEvidence: z.array(z.string().min(1).max(60000)).min(1).max(30), projectContext: z.object({ name: z.string().max(260).optional(), source: z.string().max(500).optional(), languages: z.array(z.string().max(100)).max(30).optional(), frameworks: z.array(z.string().max(100)).max(30).optional(), dependencies: z.array(z.string().max(120)).max(100).optional(), evidence: z.string().max(60000).optional() }).optional(), context: z.object({ targetId: z.enum(["windows-powershell", "linux-bash", "macos-zsh", "python", "node", "web", "api", "android-managed"]), projectType: z.string().min(2).max(120), runtime: z.string().max(120).optional(), permissionLevel: z.enum(["standard", "administrator", "owner-confirmed"]), targetConfirmed: z.boolean() }), priorCommands: z.array(z.string().max(10000)).max(80), priorVerification: z.array(z.string().max(4000)).max(80) })).mutation(async ({ input }) => {
      const localModel = await inspectLocalOllama();
      const diagnosticPrompt = [
        `ORIGINAL REQUIREMENT:\n${input.originalRequirement}`,
        `PREVIOUS COMMANDS:\n${input.priorCommands.join("\n") || "None"}`,
        `REMAINING VERIFICATION:\n${input.priorVerification.join("\n") || "None"}`,
        `CHRONOLOGICAL TERMINAL EVIDENCE:\n${input.terminalEvidence.map((entry, index) => `--- OUTPUT ${index + 1} ---\n${entry}`).join("\n")}`,
        "Diagnose the actual latest state. Do not repeat a command that already succeeded. If a source/configuration repair is needed, return corrected complete files. If evidence proves only one next check is needed, return only that exact command. Preserve the original requirement; do not solve an error by removing requested functionality. Never declare verified completion without concrete evidence.",
      ].join("\n\n");
      let proposal: BuildProposal;
      let generation: NonNullable<BuildProposal["generation"]>;
      if (!localModel.ready) {
        proposal = createModelUnavailableProposal(input.originalRequirement, localModel);
        generation = { provider: "model-unavailable", model: localModel.model, ready: false };
      } else {
        try {
          proposal = await requestLocalOllamaProposal(diagnosticPrompt, buildUniversalGenerationContract(input.context), input.projectContext);
          proposal = repairUnsafeSourceCommands(proposal, input.context.targetId === "linux-bash" || input.context.targetId === "macos-zsh" ? "Unix" : "Windows");
          generation = { provider: "local-ollama", model: localModel.model, ready: true };
        } catch {
          proposal = createModelUnavailableProposal(input.originalRequirement, { reachable: true, model: localModel.model, reason: "the local model could not return a valid diagnosis." });
          generation = { provider: "model-unavailable", model: localModel.model, ready: false };
        }
      }
      proposal = withUniversalTaskState(proposal, input.originalRequirement, input.context, input.projectContext, generation);
      let taskState = proposal.taskState!;
      for (const evidence of input.terminalEvidence) taskState = appendTerminalEvidence(taskState, evidence);
      taskState = recordTaskRepair(taskState, { observedAt: Date.now(), summary: proposal.analysis, nextCommands: proposal.commands, outcome: "needs-verification" });
      proposal.taskState = taskState;
      return proposal;
    }),
    review: protectedProcedure.input(z.object({ proposalId: z.number().int().positive(), status: z.enum(["Applied", "Rejected"]) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is unavailable." });
      const proposal = (await db.select().from(buildProposals).where(and(eq(buildProposals.id, input.proposalId), eq(buildProposals.userId, ctx.user.id))).limit(1))[0];
      if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Build proposal not found or access denied." });
      await db.update(buildProposals).set({ status: input.status }).where(eq(buildProposals.id, input.proposalId));
      await addActivity(ctx.user.id, `${input.status} build proposal #${input.proposalId}; runner execution remains separately required`, "builder", proposal.projectId ?? undefined);
      return { success: true, status: input.status, requiresRunner: input.status === "Applied" };
    }),
  }),
  assistant: router({
    history: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional() }).optional()).query(({ ctx, input }) => getAssistantMessagesForUser(ctx.user.id, input?.projectId)),
    clear: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional() }).optional()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: true, deleted: 0 };
      const condition = input?.projectId ? and(eq(assistantMessages.userId, ctx.user.id), eq(assistantMessages.projectId, input.projectId)) : eq(assistantMessages.userId, ctx.user.id);
      const rows = await db.select({ id: assistantMessages.id }).from(assistantMessages).where(condition);
      if (rows.length > 0) await db.delete(assistantMessages).where(condition);
      return { success: true, deleted: rows.length };
    }),
    chat: protectedProcedure.input(z.object({ projectId: z.number().int().positive().optional(), messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(20) })).mutation(async ({ ctx, input }) => {
      const project = input.projectId ? await requireProject(ctx.user.id, input.projectId) : undefined;
      const answer = ENV.isLocalDemo && !ENV.forgeApiKey
        ? "Local demo mode is active. Use the Builder panel to create a free starter package or a local Ollama package. No online model, runner, external OAuth, or database is required for those self-run outputs."
        : textContent((await invokeLLM({ messages: [{ role: "system", content: `You are the Universal Engineering Agent assistant. Be precise, security-conscious, and honest. Never claim an operation was executed unless the platform recorded it. If data is unavailable, say NOT VERIFIED. ${project ? `Current project: ${project.name}; source: ${project.source}; technologies: ${project.languages ?? "unknown"}, ${project.frameworks ?? "unknown"}.` : "No project is selected."}` }, ...input.messages] })).choices?.[0]?.message?.content);
      const db = ENV.isLocalDemo ? null : await getDb();
      if (db) {
        await db.insert(assistantMessages).values({ projectId: input.projectId, userId: ctx.user.id, role: "user", content: input.messages[input.messages.length - 1].content });
        await db.insert(assistantMessages).values({ projectId: input.projectId, userId: ctx.user.id, role: "assistant", content: answer });
      }
      return { answer };
    }),
  }),
});

function eqProject(id: number) { return eq(projects.id, id); }
function eqTask(id: number) { return eq(tasks.id, id); }
function eqChange(id: number) { return eq(codeChanges.id, id); }
function eqTaskJoin(id: number) { return eq(codeChanges.id, id); }
function andTask(userId: number, taskId: number) { return and(eq(tasks.userId, userId), eq(tasks.id, taskId)); }
function andChangeOwner(userId: number, changeId: number) { return and(eq(tasks.userId, userId), eq(codeChanges.id, changeId)); }
function andScriptOwner(userId: number, scriptId: number) { return and(eq(scripts.userId, userId), eq(scripts.id, scriptId)); }

export type AppRouter = typeof appRouter;
