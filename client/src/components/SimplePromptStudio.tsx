import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { buildProposalZip } from "@/lib/proposalZip";
import { analyzeTerminalOutput, appendTerminalOutput, describeCommand, type TerminalAssessment } from "@/lib/commandWorkflow";
import { summarizeProjectContext, type BrowserProjectContext, type ProjectContextFile } from "@/lib/projectContext";
import { isLocalDemo } from "@/lib/localDemo";
import { isPasswordRemovalRequest, type GenerationMode, type UniversalTargetId } from "@shared/universalContract";
import { appendTerminalEvidence, type EngineeringTaskState } from "@shared/engineeringTask";
import { Code2, Copy, Download, FolderOpen, History, Loader2, Save, SearchCheck, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type SavedProposal = {
  id: number;
  status: string;
  analysis: string;
  plan?: string[];
  files: Array<{ path?: string; purpose?: string; content?: string }>;
  commands: string[];
  verification: string[];
  risks: string[];
  prompt: string;
  createdAt: number;
  terminalLog?: string[];
  taskState?: EngineeringTaskState;
  generation?: { provider: string; model?: string; ready: boolean };
};

type WritableFileHandle = { createWritable: () => Promise<{ write: (content: string) => Promise<void>; close: () => Promise<void> }> };
type ProjectEntryHandle = { kind: "file" | "directory"; name: string; getFile?: () => Promise<{ size: number; text: () => Promise<string> }>; values?: () => AsyncIterable<ProjectEntryHandle> };
type WritableDirectoryHandle = { name: string; getDirectoryHandle: (name: string, options: { create: boolean }) => Promise<WritableDirectoryHandle>; getFileHandle: (name: string, options: { create: boolean }) => Promise<WritableFileHandle>; values?: () => AsyncIterable<ProjectEntryHandle> };
type ReadableDirectoryHandle = { name: string; values?: () => AsyncIterable<ProjectEntryHandle> };
type LocalWorkspaceAuthorization = { id: number; label: string; rootPath: string; status: "Active"; scopes: string[] };

const HISTORY_KEY = "synapsex-simple-prompt-history-v1";
const LOCAL_WORKSPACE_KEY = "synapsex-local-workspace-authorizations-v1";
const ignoredInspectionFolders = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "vendor", ".venv", "__pycache__"]);
const inspectableFile = /(?:^|\/)(?:package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|requirements\.txt|pyproject\.toml|dockerfile|compose\.ya?ml|vite\.config\.[^/]+|next\.config\.[^/]+|tsconfig\.json|[^/]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|php|rb|sql|html|css|scss|json|md))$/i;

async function readProjectFolder(directory: ReadableDirectoryHandle, prefix = "", files: ProjectContextFile[] = []): Promise<ProjectContextFile[]> {
  if (!directory.values) throw new Error("This browser cannot read the selected folder. Use recent Chrome or Edge.");
  for await (const entry of directory.values()) {
    if (files.length >= 120) break;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      if (!ignoredInspectionFolders.has(entry.name) && entry.values) await readProjectFolder(entry, path, files);
      continue;
    }
    if (!inspectableFile.test(path) || !entry.getFile) continue;
    const file = await entry.getFile();
    if (file.size > 120_000) continue;
    files.push({ path, content: await file.text() });
  }
  return files;
}

export function inferTarget(prompt: string): UniversalTargetId {
  const value = prompt.toLowerCase();
  if (/\b(android|phone|mobile device)\b/.test(value)) return "android-managed";
  if (/\b(linux|bash|ubuntu|debian|centos)\b/.test(value)) return "linux-bash";
  if (/\b(macos|mac os|zsh)\b/.test(value)) return "macos-zsh";
  if (/\b(next\.js|nextjs|website|marketing website|landing page|portfolio site|frontend|html|css|tailwind|framer motion|app router)\b/.test(value)) return "web";
  if (/\b(fastapi|rest api|backend api|api service)\b/.test(value)) return "api";
  if (/\b(python|\.py|sqlite)\b/.test(value)) return "python";
  if (/\b(node|express|javascript service)\b/.test(value)) return "node";
  if (/\b(web app|react|vite)\b/.test(value)) return "web";
  return "windows-powershell";
}

export function inferRuntime(prompt: string) {
  const value = prompt.toLowerCase();
  if (/\b(next\.js|nextjs|app router)\b/.test(value)) return "Next.js + TypeScript";
  if (/\b(fastapi|python)\b/.test(value)) return "Python 3.11+";
  if (/\b(react|vite)\b/.test(value)) return "React + Vite";
  if (/\b(node|express)\b/.test(value)) return "Node.js 20+";
  if (/\b(linux|bash)\b/.test(value)) return "Bash";
  if (/\b(macos|zsh)\b/.test(value)) return "Zsh";
  return undefined;
}

export function inferGenerationMode(prompt: string): GenerationMode {
  void prompt;
  return "free";
}

export function requiresHighImpactConfirmation(prompt: string) {
  const value = prompt.toLowerCase();
  const passwordRemoval = isPasswordRemovalRequest(value);
  const wakeProtectionReduction = /\b(disable|remove|turn off|off|hatao|hatana|na maange)\b/.test(value)
    && /\b(sleep|wake|lock screen|sign[ -]?in|password)\b/.test(value);
  return passwordRemoval || wakeProtectionReduction;
}

function normalizeList<T>(value: T[] | string | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  try { return value ? JSON.parse(value) as T[] : []; } catch { return []; }
}

function loadHistory(): SavedProposal[] {
  try {
    const value = window.localStorage.getItem(HISTORY_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadLocalWorkspaces(): LocalWorkspaceAuthorization[] {
  try {
    const value = window.localStorage.getItem(LOCAL_WORKSPACE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is LocalWorkspaceAuthorization =>
      typeof item?.id === "number" && typeof item?.label === "string" && typeof item?.rootPath === "string" && item?.status === "Active"
    ) : [];
  } catch {
    return [];
  }
}

export default function SimplePromptStudio() {
  const localDemo = isLocalDemo();
  const [prompt, setPrompt] = useState("");
  const [activeProposal, setActiveProposal] = useState<SavedProposal>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<SavedProposal[]>(loadHistory);
  const [error, setError] = useState("");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalAssessment, setTerminalAssessment] = useState<TerminalAssessment>();
  const [terminalLog, setTerminalLog] = useState<string[]>([]);
  const [workspace, setWorkspace] = useState<WritableDirectoryHandle>();
  const [workspaceSaved, setWorkspaceSaved] = useState(false);
  const [workspaceStatus, setWorkspaceStatus] = useState("");
  const [projectContext, setProjectContext] = useState<BrowserProjectContext>();
  const [projectContextStatus, setProjectContextStatus] = useState("");
  const [developmentSessionId, setDevelopmentSessionId] = useState<number>();
  const [developmentSessionStatus, setDevelopmentSessionStatus] = useState("No persistent session yet");
  const [authorizedWorkspaceId, setAuthorizedWorkspaceId] = useState<number>();
  const [workspaceLabel, setWorkspaceLabel] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [localWorkspaces, setLocalWorkspaces] = useState<LocalWorkspaceAuthorization[]>(loadLocalWorkspaces);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("free");
  const responseEmptyStateGuidance = generationMode === "free"
    ? "No-model mode mein supported project, script, test aur security-baseline requests deterministic plans, files aur PowerShell handoff ke saath prepare hoti hain. Ollama install ya model download required nahi."
    : generationMode === "local"
      ? "Local model / Ollama mode aap ne khud select kiya hai. Model ready hone par SynapseX isi mode mein advanced implementation aur repair guidance use karega."
      : "Hosted-model mode selected hai. Provider configure hone ke baad SynapseX advanced custom implementation aur repair guidance use karega.";
  const terminalOutputGuidance = generationMode === "free"
    ? "Command run karne ke baad poora output yahan paste karein. SynapseX deterministic evidence classification, safe next commands aur verification/remaining-work status dega; No-model mode mein local model required nahi."
    : "Command run karne ke baad poora output yahan paste karein. SynapseX evidence classify karega aur selected model mode available hone par original requirement, project context aur complete timeline ke saath root-cause diagnosis/repair bhi karega.";
  const responseRef = useRef<HTMLElement>(null);
  const localModelStatus = trpc.builder.localModelStatus.useQuery(undefined, { enabled: generationMode === "local", refetchInterval: 15_000 });
  const authorizedWorkspaces = trpc.development.workspaces.useQuery(undefined, { enabled: !localDemo });
  const authorizeWorkspace = trpc.development.authorizeWorkspace.useMutation({
    onSuccess: (workspaceAuthorization) => {
      setAuthorizedWorkspaceId(workspaceAuthorization.id);
      setWorkspaceLabel("");
      setWorkspacePath("");
      setDevelopmentSessionStatus("Authorized workspace saved. New session activity remains inside its declared scope.");
      void authorizedWorkspaces.refetch();
    },
    onError: (workspaceError) => setError(workspaceError.message),
  });
  const persistDevelopmentSession = trpc.development.createSession.useMutation({
    onSuccess: (session) => {
      setDevelopmentSessionId(session.id);
      setDevelopmentSessionStatus(`${session.status} · original requirement and task state saved`);
    },
    onError: (sessionError) => setDevelopmentSessionStatus(`Local session only · ${sessionError.message}`),
  });
  const ingestPersistentOutput = trpc.development.ingestTerminalOutput.useMutation({
    onSuccess: (result) => setDevelopmentSessionStatus(`${result.status} · ${result.summary}`),
    onError: (sessionError) => setDevelopmentSessionStatus(`Output retained locally · ${sessionError.message}`),
  });
  const recordCommandHandoff = trpc.development.recordHandoff.useMutation({
    onSuccess: (result) => setDevelopmentSessionStatus(`${result.status} · PowerShell handoff logged`),
    onError: (sessionError) => setDevelopmentSessionStatus(`Command copied · ${sessionError.message}`),
  });

  useEffect(() => {
    try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20))); } catch { /* Local history is optional. */ }
  }, [history]);

  useEffect(() => {
    if (!localDemo) return;
    try { window.localStorage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify(localWorkspaces)); } catch { /* Local demo persistence is optional. */ }
  }, [localDemo, localWorkspaces]);

  const visibleWorkspaces = localDemo ? localWorkspaces : (authorizedWorkspaces.data ?? []);
  const saveWorkspaceAuthorization = () => {
    const label = workspaceLabel.trim();
    const rootPath = workspacePath.trim();
    if (!label || !rootPath) return;
    if (localDemo) {
      const id = Date.now();
      setLocalWorkspaces((current) => [...current.filter((item) => item.rootPath.toLowerCase() !== rootPath.toLowerCase()), { id, label, rootPath, status: "Active", scopes: ["create", "modify", "test", "report"] }]);
      setAuthorizedWorkspaceId(id);
      setWorkspaceLabel("");
      setWorkspacePath("");
      setDevelopmentSessionStatus("Local project root selected. New projects, folders, files, scripts and tests may be prepared inside this root.");
      return;
    }
    authorizeWorkspace.mutate({ label, rootPath, scopes: ["create", "modify", "test", "report"] });
  };

  const targetId = useMemo(() => inferTarget(prompt), [prompt]);
  const build = trpc.builder.generate.useMutation({
    onSuccess: (result) => {
      const proposal: SavedProposal = {
        id: result.id,
        status: result.status,
        analysis: result.analysis,
        plan: normalizeList<string>(result.plan),
        files: normalizeList<{ path?: string; purpose?: string; content?: string }>(result.files),
        commands: normalizeList<string>(result.commands),
        verification: normalizeList<string>(result.verification),
        risks: normalizeList<string>(result.risks),
        prompt: prompt.trim(),
        createdAt: Date.now(),
        terminalLog: [],
        taskState: result.taskState,
        generation: result.generation,
      };
      setActiveProposal(proposal);
      setHistory((current) => [proposal, ...current.filter((item) => item.createdAt !== proposal.createdAt)].slice(0, 20));
      setError("");
      setTerminalOutput("");
      setTerminalLog([]);
      setTerminalAssessment(undefined);
      setWorkspace(undefined);
      setWorkspaceSaved(false);
      setWorkspaceStatus("");
      setDevelopmentSessionId(undefined);
      if (localDemo) {
        setDevelopmentSessionId(Date.now());
        setDevelopmentSessionStatus(authorizedWorkspaceId ? "Local session started inside the selected project root. Commands and pasted output stay in browser history for this demo." : "Local plan session started. Select a project root before applying generated files locally.");
      } else {
        setDevelopmentSessionStatus("Saving durable engineering session...");
        persistDevelopmentSession.mutate({
          originalRequirement: prompt.trim(),
          taskState: JSON.stringify(result.taskState ?? { originalRequirement: prompt.trim(), generatedAt: Date.now(), state: result.status }),
          workspaceAuthorizationId: authorizedWorkspaceId,
        });
      }
      window.setTimeout(() => responseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    },
    onError: (mutationError) => setError(mutationError.message || "Response generate nahi ho saki. Prompt dobara try karein."),
  });
  const diagnose = trpc.builder.diagnose.useMutation({
    onSuccess: (result) => {
      setActiveProposal((current) => {
        if (!current) return current;
        const updated: SavedProposal = {
          ...current,
          analysis: result.analysis,
          plan: normalizeList<string>(result.plan),
          files: normalizeList<{ path?: string; purpose?: string; content?: string }>(result.files),
          commands: normalizeList<string>(result.commands),
          verification: normalizeList<string>(result.verification),
          risks: normalizeList<string>(result.risks),
          taskState: result.taskState,
          generation: result.generation,
        };
        setHistory((currentHistory) => [updated, ...currentHistory.filter((item) => item.createdAt !== updated.createdAt)].slice(0, 20));
        return updated;
      });
      setTerminalAssessment({
        state: result.generation?.provider === "model-unavailable" ? "needs-verification" : "needs-verification",
        title: result.generation?.provider === "model-unavailable" ? "Engineering repair pending local model" : "Model diagnosis prepared the next repair step",
        explanation: result.analysis,
        nextCommands: normalizeList<string>(result.commands),
        remaining: normalizeList<string>(result.verification),
      });
    },
    onError: (mutationError) => setError(mutationError.message || "Terminal output ka model diagnosis nahi ho saka. Complete output dobara paste karein."),
  });

  const submitGeneration = (clean: string, userConfirmed = false) => {
    const context = {
      targetId,
      projectType: "Universal software request",
      runtime: inferRuntime(clean),
      permissionLevel: "standard" as const,
      targetConfirmed: userConfirmed || /\b(i confirm|authorized target|meri company|my company|owned device|mera device|authorized|mera|meri|apna|apne)\b/i.test(clean),
    };
    build.mutate({ prompt: clean, generationMode, context, projectContext });
  };

  const generate = () => {
    const clean = prompt.trim();
    if (clean.length < 4) { setError("Apna goal detail mein likhein — kya banana ya kis problem ko solve karna hai."); return; }
    if (requiresHighImpactConfirmation(clean)) {
      setPendingPrompt(clean);
      setConfirmationOpen(true);
      return;
    }
    submitGeneration(clean);
  };

  const copy = async (text: string) => { await navigator.clipboard?.writeText(text); };
  const analyzeOutput = () => {
    const current = terminalOutput.trim();
    if (!current) {
      setTerminalAssessment(analyzeTerminalOutput("", activeProposal?.verification ?? [], activeProposal?.commands ?? [], { originalRequirement: activeProposal?.prompt, workspaceName: workspace?.name }));
      return;
    }
    if (!activeProposal) return;
    const nextLog = appendTerminalOutput(activeProposal.terminalLog ?? terminalLog, current);
    const updatedProposal = { ...activeProposal, terminalLog: nextLog, taskState: activeProposal.taskState ? appendTerminalEvidence(activeProposal.taskState, current) : undefined };
    const assessment = analyzeTerminalOutput(
      nextLog.join("\n\n--- NEXT TERMINAL OUTPUT ---\n\n"),
      updatedProposal.verification,
      updatedProposal.commands,
      { originalRequirement: updatedProposal.prompt, workspaceName: workspace?.name },
    );
    setTerminalLog(nextLog);
    setTerminalAssessment(assessment);
    setActiveProposal(updatedProposal);
    setHistory((currentHistory) => [updatedProposal, ...currentHistory.filter((item) => item.createdAt !== updatedProposal.createdAt)].slice(0, 20));
    if (developmentSessionId) {
      if (localDemo) setDevelopmentSessionStatus(`${assessment.state === "complete" ? "Verified" : assessment.state === "error" ? "Repairing" : "Pending verification"} · output analyzed in local browser session`);
      else ingestPersistentOutput.mutate({ sessionId: developmentSessionId, output: current });
    }
    if (activeProposal.generation?.provider === "local-ollama") {
      diagnose.mutate({
        originalRequirement: activeProposal.prompt,
        terminalEvidence: nextLog,
        projectContext: activeProposal.taskState?.projectContext,
        context: {
          targetId: inferTarget(activeProposal.prompt),
          projectType: "Universal software request",
          runtime: inferRuntime(activeProposal.prompt),
          permissionLevel: "standard",
          targetConfirmed: /\b(i confirm|authorized target|meri company|my company|owned device|mera device|authorized|mera|meri|apna|apne)\b/i.test(activeProposal.prompt),
        },
        priorCommands: activeProposal.commands,
        priorVerification: activeProposal.verification,
      });
    }
  };

  const chooseWorkspace = async () => {
    const picker = (window as Window & { showDirectoryPicker?: (options?: { mode?: "readwrite" }) => Promise<WritableDirectoryHandle> }).showDirectoryPicker;
    if (!picker) { setError("Is browser mein direct folder save support available nahi. Chrome/Edge use karein ya optional Download ZIP choose karein."); return; }
    try {
      const selected = await picker({ mode: "readwrite" });
      setWorkspace(selected);
      setWorkspaceSaved(false);
      setWorkspaceStatus(`Selected folder: ${selected.name}. Ab visible files save karein, phir isi folder mein PowerShell khol kar commands run karein.`);
      setError("");
    } catch {
      setWorkspaceStatus("Folder selection cancel ho gayi. Commands run karne se pehle dedicated implementation folder select karein.");
    }
  };

  const inspectExistingProject = async () => {
    const picker = (window as Window & { showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<WritableDirectoryHandle> }).showDirectoryPicker;
    if (!picker) { setError("Existing project inspect karne ke liye recent Chrome/Edge use karein, ya project files/output text paste karein."); return; }
    try {
      const selected = await picker({ mode: "read" });
      const files = await readProjectFolder(selected);
      if (!files.length) { setError("Selected folder mein readable source/config files nahi milin. Correct project root select karein, node_modules nahi."); return; }
      const context = summarizeProjectContext(selected.name, files);
      setProjectContext(context);
      setProjectContextStatus(`${context.filesRead} source/config file(s) inspected · ${context.languages.join(", ") || "language unknown"} · ${context.frameworks.join(", ") || "framework unknown"}`);
      setError("");
    } catch (inspectionError) {
      setError(inspectionError instanceof Error ? inspectionError.message : "Project folder inspection complete nahi ho saki.");
    }
  };

  const saveFilesToWorkspace = async () => {
    if (!workspace || !activeProposal) { setError("Pehle dedicated implementation folder select karein."); return; }
    const completeFiles = activeProposal.files.filter((file) => file.path && typeof file.content === "string");
    if (!completeFiles.length) { setWorkspaceStatus("Is direct native action mein save karne ke liye project files nahi hain. Reviewed command run karke visual verification karein."); return; }
    try {
      for (const file of completeFiles) {
        const pieces = file.path!.replaceAll("\\", "/").split("/").filter(Boolean);
        const leaf = pieces.pop();
        if (!leaf || pieces.some((part) => part === "." || part === "..")) throw new Error("Unsafe generated file path rejected.");
        let directory = workspace;
        for (const part of pieces) directory = await directory.getDirectoryHandle(part, { create: true });
        const handle = await directory.getFileHandle(leaf, { create: true });
        const writable = await handle.createWritable();
        await writable.write(file.content ?? "");
        await writable.close();
      }
      setWorkspaceSaved(true);
      setWorkspaceStatus(`${completeFiles.length} implementation file(s) saved in ${workspace.name}. Ab isi folder mein PowerShell open karein aur Step 1 se commands run karein.`);
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Visible files selected folder mein save nahi ho sakin.");
    }
  };
  const download = (proposal: SavedProposal) => {
    try {
      const blob = new Blob([buildProposalZip(proposal)], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
      anchor.download = `synapsex-package-${proposal.createdAt}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
      setError("");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "ZIP package create nahi ho saka.");
    }
  };

  return (
    <main className="min-h-screen w-full min-w-0 overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1113] text-slate-100 shadow-2xl shadow-black/30">
      <header className="flex min-w-0 items-center justify-between border-b border-slate-800 bg-[#101719] px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200"><Code2 className="size-4" /></div>
          <div className="min-w-0"><p className="truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">SynapseX Engineering Agent</p><h1 className="truncate text-base font-semibold tracking-tight text-white md:text-lg">Command conversation</h1></div>
        </div>
        <div className="flex shrink-0 items-center gap-2"><span className="hidden text-[10px] uppercase tracking-[0.16em] text-emerald-300 sm:inline">{localDemo ? "Local session" : "Connected session"}</span><Button type="button" size="sm" variant="outline" onClick={() => setHistoryOpen((open) => !open)} className="border-slate-700 bg-slate-950 text-slate-200 hover:border-cyan-400/50 hover:bg-cyan-400/10"><History className="mr-1.5 size-3.5" />History {history.length ? `(${history.length})` : ""}</Button></div>
      </header>

      <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <AlertDialogContent className="border-amber-400/30 bg-[#101719] text-slate-100">
          <AlertDialogHeader><AlertDialogTitle className="text-amber-100">Confirm security reduction</AlertDialogTitle><AlertDialogDescription className="leading-6 text-slate-300">Removing a Windows sign-in password or reducing wake sign-in protection lowers device protection. Confirm this is your own local Windows account and that you explicitly want to continue. Microsoft and work accounts must be managed through Windows Settings or the organization.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel onClick={() => { setPendingPrompt(""); setError("High-impact request cancel ho gayi. Koi implementation generate nahi hui."); }} className="border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white">No, cancel</AlertDialogCancel><AlertDialogAction onClick={() => { const confirmed = pendingPrompt; setPendingPrompt(""); setConfirmationOpen(false); if (confirmed) submitGeneration(confirmed, true); }} className="bg-amber-400 text-slate-950 hover:bg-amber-300">Yes, continue</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {historyOpen && <section className="border-b border-slate-800 bg-slate-950/80 px-4 py-3 md:px-6"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Conversation history</p><Button type="button" size="sm" variant="ghost" onClick={() => setHistory([])} disabled={!history.length} className="text-slate-400 hover:text-white"><Trash2 className="mr-1 size-3.5" />Clear</Button></div><div className="mt-3 grid gap-2 md:grid-cols-2">{history.length ? history.map((item) => <button key={`${item.createdAt}-${item.id}`} type="button" onClick={() => { setActiveProposal(item); setTerminalLog(item.terminalLog ?? []); setTerminalOutput(""); setTerminalAssessment(item.terminalLog?.length ? analyzeTerminalOutput(item.terminalLog.join("\n\n--- NEXT TERMINAL OUTPUT ---\n\n"), item.verification, item.commands, { originalRequirement: item.prompt, workspaceName: workspace?.name }) : undefined); setWorkspace(undefined); setWorkspaceSaved(false); setWorkspaceStatus(item.files.length ? "History loaded. Select a folder to save visible files before running commands." : ""); setPrompt(item.prompt); setHistoryOpen(false); }} className="rounded-xl border border-slate-800 bg-[#101719] px-3 py-3 text-left transition hover:border-cyan-400/40"><p className="truncate text-xs text-slate-200">{item.prompt}</p><p className="mt-1 text-[10px] text-slate-500">{new Date(item.createdAt).toLocaleString()} · {item.files.length} file(s) · {item.commands.length} command(s) · {item.terminalLog?.length ?? 0} output(s)</p></button>) : <p className="text-xs text-slate-500">Abhi koi conversation save nahi hui.</p>}</div></section>}

      <div className="grid min-h-[calc(100vh-66px)] min-w-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section ref={responseRef} className="flex min-h-0 min-w-0 flex-col scroll-mt-4">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-6 md:px-8 lg:px-12">
            {!activeProposal ? <div className="flex min-h-[52vh] flex-col justify-center"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">One thread. Every engineering step.</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white md:text-5xl">Prompt se verified software tak.</h2><p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">Aap ka original prompt, SynapseX ka plan, generated files, PowerShell handoff, terminal output aur repair guidance isi conversation mein chronological order ke saath nazar aayegi.</p><div className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300">01</p><p className="mt-2 text-xs leading-5 text-slate-300">Prompt bhejein</p></div><div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300">02</p><p className="mt-2 text-xs leading-5 text-slate-300">Commands run karein</p></div><div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300">03</p><p className="mt-2 text-xs leading-5 text-slate-300">Output paste karke next step lein</p></div></div></div></div> : <>
              <article className="ml-auto max-w-3xl rounded-2xl rounded-tr-md border border-cyan-300/20 bg-cyan-300/10 p-4 md:p-5"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">You · original prompt</p><span className="text-[10px] text-slate-500">{new Date(activeProposal.createdAt).toLocaleTimeString()}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-100">{activeProposal.prompt}</p></article>
              <article className="max-w-4xl rounded-2xl rounded-tl-md border border-slate-800 bg-[#101719] p-4 md:p-5"><div className="flex items-center gap-2"><div className="flex size-7 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-200"><Code2 className="size-3.5" /></div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">SynapseX · engineering response</p></div><p className="mt-3 text-sm leading-7 text-slate-200">{activeProposal.analysis}</p>{activeProposal.taskState && <p className="mt-3 text-xs text-cyan-100">Task: <strong>{activeProposal.taskState.status}</strong> · {activeProposal.taskState.terminalEvidence.length} terminal output(s) · {activeProposal.taskState.repairs.length} repair(s)</p>}</article>
              <article className="max-w-4xl rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 md:p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">Plan · what happens next</p>{activeProposal.plan?.length ? <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-200">{activeProposal.plan.map((step, index) => <li key={index}>{step}</li>)}</ol> : <p className="mt-3 text-sm text-slate-400">Plan details response mein available nahi hain; commands aur verification neeche follow karein.</p>}</article>
              {activeProposal.files.length > 0 && <article className="max-w-4xl rounded-2xl border border-violet-400/20 bg-violet-400/5 p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200">Files · implementation package</p><p className="mt-1 text-xs text-slate-400">Reviewed files ko dedicated folder mein save karein.</p></div><Button type="button" size="sm" onClick={saveFilesToWorkspace} disabled={!workspace} className="bg-violet-300 text-slate-950 hover:bg-violet-200"><Save className="mr-1.5 size-3.5" />Save visible files</Button></div><div className="mt-3 space-y-2">{activeProposal.files.map((file, index) => <details key={`${file.path}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950/50"><summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5"><span className="min-w-0 truncate font-mono text-xs text-violet-100">{file.path}<span className="ml-2 font-sans text-slate-500">{file.purpose}</span></span><Button type="button" size="sm" variant="ghost" onClick={(event) => { event.preventDefault(); copy(file.content ?? ""); }} className="h-7 shrink-0 text-slate-300"><Copy className="mr-1 size-3" />Copy</Button></summary><pre className="max-h-72 overflow-auto border-t border-slate-800 p-3 font-mono text-xs leading-5 text-slate-200">{file.content}</pre></details>)}</div></article>}
              {activeProposal.commands.length > 0 && <article className="max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/50 p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">Commands · one step at a time</p><p className="mt-1 text-xs text-slate-400">Har command run karne ke baad us ka complete output isi chat mein paste karein.</p></div><Button type="button" size="sm" variant="outline" disabled={activeProposal.files.length > 0 && !workspaceSaved} onClick={() => copy(activeProposal.commands.join("\n"))} className="border-slate-700 text-slate-200"><Copy className="mr-1.5 size-3.5" />Copy all</Button></div>{activeProposal.files.length > 0 && !workspaceSaved && <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">Pehle Select workspace → Save visible files complete karein.</p>}<div className="mt-3 space-y-3">{activeProposal.commands.map((command, index) => { const guidance = describeCommand(command); return <div key={`${command}-${index}`} className="rounded-xl border border-slate-800 bg-[#0b1113] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-cyan-200">Step {index + 1} · {guidance.purpose}</p><p className="mt-1 text-xs leading-5 text-slate-400">Expected: {guidance.expected}</p><p className="mt-1 text-xs leading-5 text-amber-100/80">Check: {guidance.safety}</p></div><Button type="button" size="sm" variant="outline" disabled={activeProposal.files.length > 0 && !workspaceSaved} onClick={() => { copy(command); if (developmentSessionId) { if (localDemo) setDevelopmentSessionStatus(`Command copied for local execution · ${guidance.purpose}`); else recordCommandHandoff.mutate({ sessionId: developmentSessionId, command, purpose: guidance.purpose, expectedResult: guidance.expected }); } }} className="shrink-0 border-slate-700 text-slate-200"><Copy className="mr-1.5 size-3.5" />Copy</Button></div><pre className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-black/40 p-3 font-mono text-xs leading-6 text-slate-200">{command}</pre></div>; })}</div></article>}
              {activeProposal.verification.length > 0 && <article className="max-w-4xl rounded-2xl border border-slate-800 bg-slate-900/50 p-4 md:p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Verification · before complete</p><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-300">{activeProposal.verification.map((step, index) => <li key={index}>{step}</li>)}</ol></article>}
              {(activeProposal.terminalLog ?? []).map((output, index) => <article key={`${output}-${index}`} className="ml-auto max-w-4xl rounded-2xl rounded-tr-md border border-emerald-300/20 bg-emerald-300/5 p-4 md:p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">You · terminal output {index + 1}</p><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-300">{output}</pre></article>)}
              {terminalAssessment && <article className={`max-w-4xl rounded-2xl rounded-tl-md border p-4 md:p-5 ${terminalAssessment.state === "complete" ? "border-emerald-400/30 bg-emerald-400/10" : terminalAssessment.state === "error" ? "border-rose-400/30 bg-rose-400/10" : "border-amber-400/30 bg-amber-400/10"}`}><div className="flex items-center gap-2"><Code2 className="size-4 text-cyan-200" /><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">SynapseX · output analysis</p></div><p className="mt-3 text-base font-semibold text-white">{terminalAssessment.title}</p><p className="mt-2 text-sm leading-7 text-slate-200">{terminalAssessment.explanation}</p>{terminalAssessment.nextCommands.length > 0 && <div className="mt-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">Next safe command</p>{terminalAssessment.nextCommands.map((command, index) => <div key={`${command}-${index}`} className="mt-2 rounded-xl border border-cyan-300/20 bg-black/30 p-3"><div className="flex justify-end"><Button type="button" size="sm" variant="outline" onClick={() => copy(command)} className="h-7 border-slate-700 text-slate-200"><Copy className="mr-1 size-3" />Copy</Button></div><pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-slate-200">{command}</pre></div>)}</div>}{terminalAssessment.remaining.length > 0 && <div className="mt-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">Remaining work</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-200">{terminalAssessment.remaining.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</article>}
              {activeProposal.risks.length > 0 && <article className="max-w-4xl rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-amber-100"><p className="font-semibold">Safety / review note</p>{activeProposal.risks.map((risk, index) => <p key={index} className="mt-1">{risk}</p>)}</article>}
            </>}
          </div>

          <div className="border-t border-slate-800 bg-[#101719] px-4 py-4 md:px-8 lg:px-12"><div className="mx-auto max-w-4xl">{activeProposal && <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">Continue this engineering conversation</p>}<div className="rounded-2xl border border-slate-700 bg-[#0b1113] p-2 shadow-lg shadow-black/20"><Textarea id="synapsex-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.ctrlKey && event.key === "Enter") generate(); }} placeholder="Apna software goal ya next instruction yahan likhein..." className="min-h-24 resize-none border-0 bg-transparent p-3 text-sm leading-7 text-white shadow-none focus-visible:ring-0 placeholder:text-slate-600" /><div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-2 pt-2"><p className="text-[10px] text-slate-500">Ctrl + Enter se send · No-model deterministic mode available</p><Button type="button" onClick={generate} disabled={build.isPending} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">{build.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}{build.isPending ? "Generating..." : activeProposal ? "Send new instruction" : "Start conversation"}</Button></div></div>{error && <p className="mt-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">{error}</p>}</div></div>
        </section>

        <aside className="border-t border-slate-800 bg-[#101719] px-4 py-4 lg:border-l lg:border-t-0 lg:px-5"><div className="sticky top-4 space-y-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Session context</p><p className="mt-2 text-sm font-medium text-white">{developmentSessionId ? `Session #${developmentSessionId}` : "New local session"}</p><p className="mt-1 text-xs leading-5 text-slate-500">{developmentSessionStatus}</p></div><div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-emerald-100">Generation mode</p><span className="text-[10px] uppercase tracking-[0.12em] text-emerald-200">{generationMode === "free" ? "No-model" : generationMode === "local" ? "Ollama" : "Hosted"}</span></div><select id="generation-mode" value={generationMode} onChange={(event) => setGenerationMode(event.target.value as GenerationMode)} className="mt-3 h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100"><option value="free">No-model — deterministic</option><option value="local">Local model / Ollama</option><option value="model">Hosted model</option></select><p className="mt-2 text-xs leading-5 text-slate-400">{generationMode === "free" ? "Ollama install ya model download required nahi." : generationMode === "local" ? (localModelStatus.isLoading ? "Local model status check ho raha hai..." : localModelStatus.data?.ready ? `Local model ready: ${localModelStatus.data.model}` : `Local model optional hai: ${localModelStatus.data?.reason ?? "status unavailable"}`) : "Hosted provider configuration ke baad available hoga."}</p></div><div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-200">Project workspace</p><span className="text-[10px] text-slate-500">{visibleWorkspaces.length} saved</span></div><p className="mt-2 text-xs leading-5 text-slate-500">Selected root aur browser save folder alag ho sakte hain. Commands se pehle folder save complete karein.</p><div className="mt-3 space-y-2"><input value={workspaceLabel} onChange={(event) => setWorkspaceLabel(event.target.value)} placeholder="Project label" className="h-9 w-full rounded-md border border-slate-700 bg-[#0b1113] px-3 text-xs text-slate-100 placeholder:text-slate-600" /><input value={workspacePath} onChange={(event) => setWorkspacePath(event.target.value)} placeholder="C:\\Users\\hp\\Documents\\MyProject" className="h-9 w-full rounded-md border border-slate-700 bg-[#0b1113] px-3 font-mono text-xs text-slate-100 placeholder:text-slate-600" /><Button type="button" size="sm" disabled={!workspaceLabel.trim() || !workspacePath.trim() || authorizeWorkspace.isPending} onClick={saveWorkspaceAuthorization} className="w-full bg-emerald-300 text-slate-950 hover:bg-emerald-200">{authorizeWorkspace.isPending ? "Saving..." : localDemo ? "Save local root" : "Save project root"}</Button></div><label className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500" htmlFor="authorized-workspace">Active root</label><select id="authorized-workspace" value={authorizedWorkspaceId ?? ""} onChange={(event) => setAuthorizedWorkspaceId(event.target.value ? Number(event.target.value) : undefined)} className="mt-1 h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-[11px] text-slate-100"><option value="">Plan and handoff only</option>{visibleWorkspaces.filter((item) => item.status === "Active").map((item) => <option key={item.id} value={item.id}>{item.label} · {item.rootPath}</option>)}</select></div>{activeProposal?.files.length ? <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-violet-100">Browser save</p>{workspaceSaved && <span className="text-[10px] text-emerald-200">Saved</span>}</div><Button type="button" size="sm" variant="outline" onClick={chooseWorkspace} className="mt-3 w-full border-violet-400/30 text-violet-100"><FolderOpen className="mr-1.5 size-3.5" />{workspace ? "Change folder" : "Select folder"}</Button>{workspaceStatus && <p className="mt-2 text-xs leading-5 text-violet-100">{workspaceStatus}</p>}</div> : null}<div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3"><p className="text-xs font-semibold text-cyan-100">How the loop works</p><p className="mt-2 text-xs leading-5 text-slate-400">Prompt bhejein → files/commands review karein → ek command run karein → complete output paste karein → Analyze output → next safe step.</p></div></div></aside>
      </div>
    </main>
  );

}
