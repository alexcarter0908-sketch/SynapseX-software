export type EngineeringTaskStatus = "planned" | "awaiting-local-execution" | "repairing" | "pending-external" | "verified" | "blocked";

export type EngineeringProjectContext = {
  name?: string;
  source?: string;
  languages?: string[];
  frameworks?: string[];
  dependencies?: string[];
  evidence?: string;
};

export type EngineeringTaskInterpretation = {
  summary: string;
  requestedOutcome: string;
  target: string;
  runtime?: string;
  existingProject: boolean;
};

export type EngineeringRepairAttempt = {
  observedAt: number;
  summary: string;
  nextCommands: string[];
  outcome: "error" | "needs-verification" | "complete";
};

export type EngineeringTaskState = {
  version: 1;
  taskId: string;
  originalRequirement: string;
  interpretation: EngineeringTaskInterpretation;
  projectContext?: EngineeringProjectContext;
  status: EngineeringTaskStatus;
  implementationPlan: string[];
  files: Array<{ path: string; purpose: string }>;
  commands: string[];
  verification: string[];
  externalPrerequisites: string[];
  terminalEvidence: string[];
  repairs: EngineeringRepairAttempt[];
  completionEvidence: string[];
  updatedAt: number;
};

export type TaskStateSeed = {
  taskId: string;
  originalRequirement: string;
  analysis: string;
  target: string;
  runtime?: string;
  projectContext?: EngineeringProjectContext;
  plan: string[];
  files: Array<{ path: string; purpose: string }>;
  commands: string[];
  verification: string[];
  externalPrerequisites?: string[];
  status?: EngineeringTaskStatus;
  now?: number;
};

export function createEngineeringTaskState(seed: TaskStateSeed): EngineeringTaskState {
  const now = seed.now ?? Date.now();
  const status = seed.status ?? (seed.externalPrerequisites?.length ? "pending-external" : seed.commands.length || seed.files.length ? "awaiting-local-execution" : "planned");
  return {
    version: 1,
    taskId: seed.taskId,
    originalRequirement: seed.originalRequirement.trim(),
    interpretation: {
      summary: seed.analysis.trim(),
      requestedOutcome: seed.verification[0] ?? "Verify the requested result against the original requirement.",
      target: seed.target,
      runtime: seed.runtime,
      existingProject: Boolean(seed.projectContext?.name || seed.projectContext?.source || seed.projectContext?.evidence),
    },
    projectContext: seed.projectContext,
    status,
    implementationPlan: [...seed.plan],
    files: seed.files.map((file) => ({ path: file.path, purpose: file.purpose })),
    commands: [...seed.commands],
    verification: [...seed.verification],
    externalPrerequisites: [...(seed.externalPrerequisites ?? [])],
    terminalEvidence: [],
    repairs: [],
    completionEvidence: [],
    updatedAt: now,
  };
}

export function appendTerminalEvidence(task: EngineeringTaskState, output: string, now = Date.now()): EngineeringTaskState {
  const evidence = output.trim();
  if (!evidence) return task;
  return { ...task, terminalEvidence: [...task.terminalEvidence, evidence], status: task.status === "pending-external" ? "pending-external" : "repairing", updatedAt: now };
}

export function recordTaskRepair(task: EngineeringTaskState, repair: EngineeringRepairAttempt, now = Date.now()): EngineeringTaskState {
  const verified = repair.outcome === "complete" && task.verification.length === 0;
  return {
    ...task,
    repairs: [...task.repairs, repair],
    status: verified ? "verified" : repair.outcome === "error" ? "repairing" : "awaiting-local-execution",
    completionEvidence: verified ? [...task.completionEvidence, repair.summary] : task.completionEvidence,
    updatedAt: now,
  };
}

export function markTaskVerified(task: EngineeringTaskState, evidence: string, now = Date.now()): EngineeringTaskState {
  const clean = evidence.trim();
  return { ...task, status: "verified", completionEvidence: clean ? [...task.completionEvidence, clean] : task.completionEvidence, updatedAt: now };
}
