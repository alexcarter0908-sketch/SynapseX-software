import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { buildProposalZip, safeArchivePath } from "@/lib/proposalZip";
import { analyzeTerminalOutput, appendTerminalOutput, describeCommand, type TerminalAssessment } from "@/lib/commandWorkflow";
import { summarizeProjectContext, type BrowserProjectContext, type ProjectContextFile } from "@/lib/projectContext";
import { getUniversalTarget, isPasswordRemovalRequest, universalTargets, validateTargetRuntimeCompatibility, type GenerationMode, type UniversalTargetId } from "@shared/universalContract";
import { appendTerminalEvidence, type EngineeringTaskState } from "@shared/engineeringTask";
import { looksLikeTerminalTranscript } from "@/lib/terminalTranscript";
import { Bot, Copy, Download, Loader2, SearchCheck, Send, Settings2, Terminal, Trash2, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type SavedProposal = {
  id: number;
  targetId?: UniversalTargetId;
  runtime?: string;
  status: string;
  analysis: string;
  plan?: string[];
  files: Array<{ path?: string; purpose?: string; content?: string }>;
  commands: string[];
  commandNotes?: string[];
  verification: string[];
  risks: string[];
  prompt: string;
  createdAt: number;
  terminalLog?: string[];
  taskState?: EngineeringTaskState;
  generation?: { provider: string; model?: string; ready: boolean };
};

export type TargetSelection = UniversalTargetId | "recommend";

export function resolveTargetSelection(selection: TargetSelection, prompt: string): UniversalTargetId {
  return selection === "recommend" ? inferTarget(prompt) : selection;
}

export function restoreProposalSelection(proposal: Pick<SavedProposal, "targetId" | "runtime">) {
  return { targetSelection: proposal.targetId ?? "recommend" as TargetSelection, runtime: proposal.runtime ?? "" };
}

type WritableFileHandle = { createWritable: () => Promise<{ write: (content: string) => Promise<void>; close: () => Promise<void> }> };
type ProjectEntryHandle = { kind: "file" | "directory"; name: string; getFile?: () => Promise<{ size: number; text: () => Promise<string> }>; values?: () => AsyncIterable<ProjectEntryHandle> };
type WritableDirectoryHandle = { name: string; getDirectoryHandle: (name: string, options: { create: boolean }) => Promise<WritableDirectoryHandle>; getFileHandle: (name: string, options: { create: boolean }) => Promise<WritableFileHandle>; values?: () => AsyncIterable<ProjectEntryHandle> };
type ReadableDirectoryHandle = { name: string; values?: () => AsyncIterable<ProjectEntryHandle> };

const HISTORY_KEY = "synapsex-simple-prompt-history-v1";
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
  return "local";
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

export default function SimplePromptStudio() {
  const [prompt, setPrompt] = useState("");
  const [targetSelection, setTargetSelection] = useState<TargetSelection>("recommend");
  const [runtimeOverride, setRuntimeOverride] = useState("");
  const [activeProposal, setActiveProposal] = useState<SavedProposal>();
  const [history, setHistory] = useState<SavedProposal[]>(loadHistory);
  const [error, setError] = useState("");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalAssessment, setTerminalAssessment] = useState<TerminalAssessment>();
  const [terminalLog, setTerminalLog] = useState<string[]>([]);
  const [projectContext, setProjectContext] = useState<BrowserProjectContext>();
  const [projectContextStatus, setProjectContextStatus] = useState("");
  const [composerText, setComposerText] = useState("");
  const [forceTerminalMode, setForceTerminalMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatLog, setChatLog] = useState<Array<{ id: number; role: "user" | "assistant"; content: string; createdAt: number }>>([]);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const localModelStatus = trpc.builder.localModelStatus.useQuery(undefined, { refetchInterval: 15_000 });
  const chat = trpc.assistant.chat.useMutation({
    onSuccess: (result) => {
      setChatLog((current) => [...current, { id: Date.now(), role: "assistant", content: result.answer, createdAt: Date.now() }]);
      window.setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    },
    onError: (mutationError) => setChatLog((current) => [...current, { id: Date.now(), role: "assistant", content: mutationError.message || "Reply nahi aa saka. Dobara try karein.", createdAt: Date.now() }]),
  });

  useEffect(() => {
    try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20))); } catch { /* Local history is optional. */ }
  }, [history]);

  const targetId = useMemo(() => resolveTargetSelection(targetSelection, prompt), [prompt, targetSelection]);
  const selectedTarget = useMemo(() => getUniversalTarget(targetId), [targetId]);
  // Ollama has been removed from this setup — always prefer the free cloud model (Groq or
  // whatever BUILT_IN_FORGE_API_URL/KEY points at) once it's configured, instead of trying the
  // local engine at all.
  const generationMode = useMemo(() => (localModelStatus.data?.cloudReady ? "model" : inferGenerationMode(prompt)), [prompt, localModelStatus.data?.cloudReady]);
  const build = trpc.builder.generate.useMutation({
    onSuccess: (result) => {
      // The local model sometimes invents a "file" that is really just an existing system path
      // (e.g. pointing at powershell.exe) with no real content, or slips in an empty command
      // string. Those aren't things the user can save/copy usefully, so drop them here instead
      // of showing a confusing empty card or a ZIP download that fails.
      const rawFiles = normalizeList<{ path?: string; purpose?: string; content?: string }>(result.files);
      const files = rawFiles.filter((file) => safeArchivePath(file.path) && (file.content ?? "").trim().length > 0);
      const commands = normalizeList<string>(result.commands).map((command) => command.trim()).filter(Boolean);
      const commandNotes = normalizeList<string>(result.commandNotes);
      const proposal: SavedProposal = {
        id: result.id,
        targetId,
        runtime: runtimeOverride.trim() || (targetSelection !== "recommend" ? selectedTarget.defaultRuntime : inferRuntime(prompt)),
        status: result.status,
        analysis: result.analysis,
        plan: normalizeList<string>(result.plan),
        files,
        commands,
        commandNotes: commandNotes.length > 0 ? commandNotes : undefined,
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
      setComposerText("");
      window.setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
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
          commandNotes: normalizeList<string>(result.commandNotes).length > 0 ? normalizeList<string>(result.commandNotes) : undefined,
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
      window.setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    },
    onError: (mutationError) => setError(mutationError.message || "Terminal output ka model diagnosis nahi ho saka. Complete output dobara paste karein."),
  });

  // Each generate() call previously only sent the latest message to the local model, with zero
  // memory of earlier turns — so facts already established (the actual username, the actual goal)
  // were lost on every follow-up, and the model kept re-asking or using placeholders like
  // <username>. Build a short recap of the recent conversation and prepend it so the model has
  // the facts it needs, while the chat bubble itself still only shows the user's original text.
  const recentConversationRecap = () => {
    const entries = [
      ...history.map((h) => ({
        createdAt: h.createdAt,
        text: `User asked: ${h.prompt}\nAssistant said: ${h.analysis}${h.commands.length ? `\nCommands given: ${h.commands.join(" | ")}` : ""}${(h.terminalLog?.length ?? 0) > 0 ? `\nTerminal output user pasted after that: ${h.terminalLog![h.terminalLog!.length - 1].slice(0, 400)}` : ""}`,
      })),
      ...chatLog.map((m) => ({ createdAt: m.createdAt, text: `${m.role === "user" ? "User" : "Assistant"} said: ${m.content}` })),
    ].sort((a, b) => a.createdAt - b.createdAt).slice(-6);
    if (!entries.length) return "";
    return `CONVERSATION SO FAR (context only — use any facts already established here, such as the real username or the real goal; do not repeat this back, and do not treat it as a new request):\n${entries.map((entry) => entry.text).join("\n\n")}\n\nNEW REQUEST (this is what the user wants now, informed by the above):\n`;
  };

  const submitGeneration = (clean: string, userConfirmed = false) => {
    const runtime = runtimeOverride.trim() || (targetSelection !== "recommend" ? selectedTarget.defaultRuntime : inferRuntime(clean));
    const runtimeCheck = validateTargetRuntimeCompatibility(targetId, runtime);
    if (!runtimeCheck.valid) { setError(runtimeCheck.reason); return; }
    // The backend re-checks high-impact requests (e.g. removing a Windows sign-in password)
    // by scanning the prompt text itself for an explicit confirmation phrase. Clicking
    // "Yes, continue" in the dialog only confirms in the UI, so append that phrase to the
    // prompt we actually send once the user has confirmed, or the server will reject it again.
    const withConfirmation = userConfirmed ? `${clean}\n\n(I confirm this is my own local Windows account and I want to proceed.)` : clean;
    const promptToSend = `${recentConversationRecap()}${withConfirmation}`;
    const context = {
      targetId,
      projectType: "Universal software request",
      runtime,
      permissionLevel: "standard" as const,
      targetConfirmed: userConfirmed || targetSelection !== "recommend" || /\b(i confirm|authorized target|meri company|my company|owned device|mera device|authorized|mera|meri|apna|apne)\b/i.test(clean),
    };
    build.mutate({ prompt: promptToSend, generationMode, context, projectContext });
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
  const analyzeOutput = (overrideValue?: string) => {
    const current = (overrideValue ?? terminalOutput).trim();
    if (!current) { setTerminalAssessment(analyzeTerminalOutput("", activeProposal?.verification ?? [], activeProposal?.commands ?? [])); return; }
    if (!activeProposal) return;
    const nextLog = appendTerminalOutput(activeProposal.terminalLog ?? terminalLog, current);
    const updatedProposal = { ...activeProposal, terminalLog: nextLog, taskState: activeProposal.taskState ? appendTerminalEvidence(activeProposal.taskState, current) : undefined };
    const assessment = analyzeTerminalOutput(nextLog.join("\n\n--- NEXT TERMINAL OUTPUT ---\n\n"), updatedProposal.verification, updatedProposal.commands);
    setTerminalLog(nextLog);
    setTerminalAssessment(assessment);
    setActiveProposal(updatedProposal);
    setHistory((currentHistory) => [updatedProposal, ...currentHistory.filter((item) => item.createdAt !== updatedProposal.createdAt)].slice(0, 20));
    if (activeProposal.generation?.provider === "local-ollama" || activeProposal.generation?.provider === "hosted-model") {
      diagnose.mutate({
        originalRequirement: activeProposal.prompt,
        terminalEvidence: nextLog,
        projectContext: activeProposal.taskState?.projectContext,
        context: {
          targetId: activeProposal.targetId ?? inferTarget(activeProposal.prompt),
          projectType: "Universal software request",
          runtime: runtimeOverride.trim() || activeProposal.runtime || inferRuntime(activeProposal.prompt),
          permissionLevel: "standard",
          targetConfirmed: /\b(i confirm|authorized target|meri company|my company|owned device|mera device|authorized|mera|meri|apna|apne)\b/i.test(activeProposal.prompt),
        },
        priorCommands: activeProposal.commands,
        priorVerification: activeProposal.verification,
      });
    }
    setComposerText("");
    setForceTerminalMode(false);
  };

  // Single composer for the whole conversation: auto-detects whether the pasted text is a
  // new build request, PowerShell/terminal output, or a plain conversational message.
  //
  // A hardcoded list of "casual phrases" is fragile — any greeting spelled slightly differently
  // ("kia hal hy" vs "kaise ho") falls through to the heavy engineering-proposal pipeline and
  // produces a confusing "Task status: planned" card instead of a normal reply. Instead, default
  // to a plain chat reply unless the message actually contains an action/task word or is long
  // enough to plausibly be a real brief — that's a much smaller, more robust surface to get wrong.
  const casualMessage = /^\s*(hi|hii+|hello+|hey+|salam|assalam(u|o)?[\s'’]?alaikum|kaise ho|kya haal|kia hal|good\s?(morning|night|evening)|thanks?|thank\s?you|shukriya|ok+|okay|yes|no|haan|nahi|bye|kya kar rahe ho|kia kar rahe ho)\s*[.!?]*\s*$/i;
  const taskActionWord = /\b(karo|kro|kr do|kar do|karna|karne|chahiye|banao|bana do|banawao|install|uninstall|remove|delete|hatao|hata do|fix|check|scan|script|command|cmd|powershell|bash|download|setup|create|update|configure|run|chalao|generate|code|program|website|app|automate|backup|enable|disable|change|badlo|dikhao|batao|find|search|open kro|khol do|likho|likh do)\b/i;
  const handleSend = () => {
    const clean = composerText.trim();
    if (!clean) return;
    const treatAsTerminal = activeProposal && (forceTerminalMode || looksLikeTerminalTranscript(clean));
    if (treatAsTerminal) {
      setTerminalOutput(clean);
      analyzeOutput(clean);
      return;
    }
    const wordCount = clean.split(/\s+/).filter(Boolean).length;
    const looksLikeTask = taskActionWord.test(clean) || wordCount >= 10;
    if (clean.length < 4 || casualMessage.test(clean) || !looksLikeTask) {
      const userTurn = { id: Date.now(), role: "user" as const, content: clean, createdAt: Date.now() };
      setChatLog((current) => [...current, userTurn]);
      chat.mutate({ messages: [...chatLog, userTurn].slice(-20).map(({ role, content }) => ({ role, content })) });
      setComposerText("");
      window.setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
      return;
    }
    setPrompt(clean);
    if (requiresHighImpactConfirmation(clean)) {
      setPendingPrompt(clean);
      setConfirmationOpen(true);
      return;
    }
    submitGeneration(clean);
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
    <main className="flex h-[85vh] min-h-[520px] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#101719] text-slate-100">
      <header className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="size-5 shrink-0 text-cyan-300" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">SynapseX Assistant</p>
            <p className={`text-[11px] leading-4 ${localModelStatus.data?.cloudReady ? "text-emerald-300" : "text-amber-200"}`}>
              {localModelStatus.isLoading ? "Coding engine check ho raha hai..." : localModelStatus.data?.cloudReady ? `Ready · Cloud (${localModelStatus.data.cloudModel})` : "Cloud model pending: BUILT_IN_FORGE_API_URL / BUILT_IN_FORGE_API_KEY .env.local mein set karein"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setSettingsOpen((open) => !open)} className={`h-8 text-slate-300 hover:text-white ${settingsOpen ? "bg-slate-800 text-white" : ""}`}>
            <Settings2 className="mr-1.5 size-3.5" /> Settings
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setHistory([]); setActiveProposal(undefined); setTerminalAssessment(undefined); setTerminalLog([]); }} disabled={!history.length} className="h-8 text-slate-400 hover:text-white">
            <Trash2 className="mr-1.5 size-3.5" /> New chat
          </Button>
        </div>
      </header>

      <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <AlertDialogContent className="border-amber-400/30 bg-[#101719] text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-100">Confirm security reduction</AlertDialogTitle>
            <AlertDialogDescription className="leading-6 text-slate-300">Removing a Windows sign-in password or reducing wake sign-in protection lowers device protection. Confirm this is your own local Windows account and that you explicitly want to continue. Microsoft and work accounts must be managed through Windows Settings or the organization.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setPendingPrompt(""); setError("High-impact request cancel ho gayi. Koi implementation generate nahi hui."); }} className="border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white">No, cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const confirmed = pendingPrompt; setPendingPrompt(""); setConfirmationOpen(false); if (confirmed) submitGeneration(confirmed, true); }} className="bg-amber-400 text-slate-950 hover:bg-amber-300">Yes, continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {settingsOpen && (
        <div className="shrink-0 border-b border-slate-800 bg-slate-950/60 px-4 py-3">
          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            <div className="min-w-0">
              <label htmlFor="synapsex-target" className="text-xs font-medium text-cyan-100">Target environment</label>
              <select id="synapsex-target" value={targetSelection} onChange={(event) => setTargetSelection(event.target.value as TargetSelection)} className="mt-1 h-9 w-full min-w-0 rounded-md border border-slate-700 bg-[#0b1214] px-3 text-xs text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30">
                <option value="recommend">Recommend from my prompt</option>
                {universalTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
              </select>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">{selectedTarget.platform} · {selectedTarget.shell} · default {selectedTarget.defaultRuntime}</p>
            </div>
            <div className="min-w-0">
              <label htmlFor="synapsex-runtime" className="text-xs font-medium text-cyan-100">Runtime / version (optional)</label>
              <input id="synapsex-runtime" value={runtimeOverride} onChange={(event) => setRuntimeOverride(event.target.value)} placeholder={selectedTarget.defaultRuntime} className="mt-1 h-9 w-full min-w-0 rounded-md border border-slate-700 bg-[#0b1214] px-3 text-xs text-white outline-none placeholder:text-slate-500 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30" />
            </div>
            <div className="min-w-0">
              <label className="text-xs font-medium text-cyan-100">Existing project (optional)</label>
              <Button type="button" size="sm" variant="outline" onClick={inspectExistingProject} className="mt-1 h-9 w-full border-slate-700 text-xs text-slate-200">
                <SearchCheck className="mr-1.5 size-3.5" /> {projectContext ? "Change inspected project" : "Inspect existing project"}
              </Button>
            </div>
          </div>
          {projectContextStatus && <p className="mt-2 text-[11px] text-cyan-100">Project context attached: {projectContextStatus}</p>}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        {!history.length && !activeProposal && !chatLog.length ? (
          <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
            <Bot className="size-10 text-cyan-400/40" />
            <p className="mt-4 text-sm text-slate-300">Roman Urdu, Hindi, ya English — kisi bhi language mein apna coding kaam likhein. SynapseX code, files aur commands generate karega; command run karke jo output aaye woh yahi neeche paste kar dena, main agla step batata rahunga.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {[...history.map((item) => ({ kind: "proposal" as const, createdAt: item.createdAt, item })), ...chatLog.map((message) => ({ kind: "chat" as const, createdAt: message.createdAt, message }))]
              .sort((a, b) => a.createdAt - b.createdAt)
              .map((entry) => {
                if (entry.kind === "chat") {
                  const message = entry.message;
                  return message.role === "user" ? (
                    <div key={`chat-${message.id}`} className="flex justify-end gap-2">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-cyan-500/15 px-4 py-2.5 text-sm leading-6 text-cyan-50">{message.content}</div>
                      <User className="mt-1 size-6 shrink-0 rounded-full bg-slate-800 p-1 text-slate-300" />
                    </div>
                  ) : (
                    <div key={`chat-${message.id}`} className="flex justify-start gap-2">
                      <Bot className="mt-1 size-6 shrink-0 rounded-full bg-cyan-400/20 p-1 text-cyan-200" />
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-slate-800 bg-[#0b1214] px-4 py-2.5 text-sm leading-6 text-slate-200">{message.content}</div>
                    </div>
                  );
                }
                const item = entry.item;
                const isActive = activeProposal?.createdAt === item.createdAt;
                const assessment = isActive ? terminalAssessment : undefined;
                return (
                  <div key={item.createdAt} className="space-y-3">
                  {/* User prompt bubble */}
                  <div className="flex justify-end gap-2">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-cyan-500/15 px-4 py-2.5 text-sm leading-6 text-cyan-50">
                      {item.prompt}
                    </div>
                    <User className="mt-1 size-6 shrink-0 rounded-full bg-slate-800 p-1 text-slate-300" />
                  </div>

                  {/* Assistant response bubble */}
                  <div className="flex justify-start gap-2">
                    <Bot className="mt-1 size-6 shrink-0 rounded-full bg-cyan-400/20 p-1 text-cyan-200" />
                    <div className="min-w-0 max-w-[92%] space-y-3 rounded-2xl rounded-tl-sm border border-slate-800 bg-[#0b1214] px-4 py-3">
                      <p className="text-sm leading-6 text-slate-200">{item.analysis}</p>
                      {item.taskState && <p className="text-xs text-cyan-100">Task status: <strong>{item.taskState.status}</strong> · terminal evidence: {item.taskState.terminalEvidence.length} · repairs: {item.taskState.repairs.length}</p>}

                      {item.plan?.length ? (
                        <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
                          <p className="text-xs font-semibold text-cyan-100">Engineering workflow</p>
                          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5 text-slate-200">{item.plan.map((step, index) => <li key={index}>{step}</li>)}</ol>
                        </div>
                      ) : null}

                      {item.commands.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-100">Implementation commands</p>
                            <Button type="button" size="sm" variant="outline" onClick={() => copy(item.commands.join("\n"))} className="h-7 border-slate-700 text-[11px] text-slate-200"><Copy className="mr-1 size-3" /> Copy all</Button>
                          </div>
                          <div className="mt-2 space-y-2">{item.commands.map((command, index) => {
                            const modelNote = item.commandNotes?.[index]?.trim();
                            const guidance = describeCommand(command);
                            return (
                              <article key={`${command}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold text-cyan-200">Step {index + 1}{!modelNote ? ` · ${guidance.purpose}` : ""}</p>
                                    {modelNote ? (
                                      <p className="mt-0.5 text-[11px] leading-4 text-slate-300">{modelNote}</p>
                                    ) : (
                                      <p className="mt-0.5 text-[11px] leading-4 text-slate-300">Expected: {guidance.expected}</p>
                                    )}
                                  </div>
                                  <Button type="button" size="sm" variant="outline" onClick={() => copy(command)} className="h-7 shrink-0 border-slate-700 text-[11px] text-slate-200"><Copy className="mr-1 size-3" /> Copy</Button>
                                </div>
                                <pre className="mt-2 overflow-x-auto rounded-md border border-slate-800 bg-black/40 p-2.5 font-mono text-[11px] leading-5 text-slate-200">{command}</pre>
                              </article>
                            );
                          })}</div>
                        </div>
                      )}

                      {item.files.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-100">Complete files</p>
                          <div className="mt-2 space-y-1.5">{item.files.map((file, index) => (
                            <details key={`${file.path}-${index}`} open className="rounded-lg border border-slate-800 bg-slate-900/50">
                              <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2"><span><span className="font-mono text-[11px] text-cyan-200">{file.path}</span><span className="ml-2 text-[11px] text-slate-500">{file.purpose}</span></span><Button type="button" size="sm" variant="ghost" onClick={(event) => { event.preventDefault(); copy(file.content ?? ""); }} className="h-6 text-[11px] text-slate-300"><Copy className="mr-1 size-3" /> Copy</Button></summary>
                              <pre className="max-h-72 overflow-auto border-t border-slate-800 p-2.5 font-mono text-[11px] leading-5 text-slate-200">{file.content}</pre>
                            </details>
                          ))}</div>
                        </div>
                      )}

                      {item.verification.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-100">Verify before calling it complete</p>
                          <ol className="mt-1 list-decimal space-y-1 pl-5 text-[11px] leading-4 text-slate-300">{item.verification.map((step, index) => <li key={index}>{step}</li>)}</ol>
                        </div>
                      )}

                      {item.risks.length > 0 && (
                        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-2.5 text-[11px] leading-4 text-amber-100">
                          <p className="font-semibold">Safety / review note</p>
                          {item.risks.map((risk, index) => <p key={index} className="mt-1">{risk}</p>)}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 border-t border-slate-800 pt-2">
                        <p className="text-[10px] text-slate-500">{new Date(item.createdAt).toLocaleString()} · {item.terminalLog?.length ?? 0} terminal step(s)</p>
                        {item.files.length > 0 && /\b(zip|package|archive|compress|bundle|download)\b/i.test(item.prompt) && (
                          <Button type="button" size="sm" variant="outline" onClick={() => download(item)} className="h-7 border-slate-700 text-[11px] text-slate-200"><Download className="mr-1 size-3" /> Download ZIP</Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Prior terminal pastes for this session, shown as chat turns */}
                  {(item.terminalLog ?? []).slice(0, -1).reverse().map((log, index) => (
                    <div key={`log-${item.createdAt}-${index}`} className="flex justify-end gap-2">
                      <div className="flex max-w-[85%] items-start gap-2 rounded-2xl rounded-tr-sm bg-slate-800/60 px-4 py-2.5 text-xs leading-5 text-slate-300">
                        <Terminal className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono">{log.length > 600 ? `${log.slice(0, 600)}…` : log}</pre>
                      </div>
                      <User className="mt-1 size-6 shrink-0 rounded-full bg-slate-800 p-1 text-slate-300" />
                    </div>
                  ))}

                  {/* Latest terminal paste + assistant diagnosis, only for the active session */}
                  {isActive && (item.terminalLog?.length ?? 0) > 0 && (
                    <div className="flex justify-end gap-2">
                      <div className="flex max-w-[85%] items-start gap-2 rounded-2xl rounded-tr-sm bg-slate-800/60 px-4 py-2.5 text-xs leading-5 text-slate-300">
                        <Terminal className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono">{(item.terminalLog![item.terminalLog!.length - 1] ?? "").slice(0, 800)}</pre>
                      </div>
                      <User className="mt-1 size-6 shrink-0 rounded-full bg-slate-800 p-1 text-slate-300" />
                    </div>
                  )}

                  {isActive && diagnose.isPending && (
                    <div className="flex justify-start gap-2">
                      <Bot className="mt-1 size-6 shrink-0 rounded-full bg-cyan-400/20 p-1 text-cyan-200" />
                      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-slate-800 bg-[#0b1214] px-4 py-2.5 text-xs text-cyan-100"><Loader2 className="size-3.5 animate-spin" /> Output analyze ho raha hai...</div>
                    </div>
                  )}

                  {isActive && assessment && (
                    <div className="flex justify-start gap-2">
                      <Bot className="mt-1 size-6 shrink-0 rounded-full bg-cyan-400/20 p-1 text-cyan-200" />
                      <div className={`max-w-[92%] space-y-2 rounded-2xl rounded-tl-sm border p-3 text-sm ${assessment.state === "complete" ? "border-emerald-400/30 bg-emerald-400/10" : assessment.state === "error" ? "border-rose-400/30 bg-rose-400/10" : "border-amber-400/30 bg-amber-400/10"}`}>
                        <p className="font-semibold text-white">{assessment.title}</p>
                        <p className="leading-6 text-slate-200">{assessment.explanation}</p>
                        {assessment.nextCommands.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cyan-100">Next safe command</p>
                            {assessment.nextCommands.map((command, index) => (
                              <div key={`${command}-${index}`} className="mt-1.5">
                                <div className="flex justify-end"><Button type="button" size="sm" variant="outline" onClick={() => copy(command)} className="h-6 border-slate-700 text-[11px] text-slate-200"><Copy className="mr-1 size-3" /> Copy</Button></div>
                                <pre className="overflow-x-auto rounded-md border border-slate-800 bg-black/30 p-2.5 font-mono text-[11px] leading-5 text-slate-200">{command}</pre>
                              </div>
                            ))}
                          </div>
                        )}
                        {assessment.remaining.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cyan-100">Completion / remaining work</p>
                            <ul className="mt-1 list-disc space-y-1 pl-5 text-[11px] leading-4 text-slate-200">{assessment.remaining.map((remain, index) => <li key={index}>{remain}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {build.isPending && (
              <div className="flex justify-start gap-2">
                <Bot className="mt-1 size-6 shrink-0 rounded-full bg-cyan-400/20 p-1 text-cyan-200" />
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-slate-800 bg-[#0b1214] px-4 py-2.5 text-xs text-cyan-100"><Loader2 className="size-3.5 animate-spin" /> Code / commands generate ho rahe hain...</div>
              </div>
            )}
            {chat.isPending && (
              <div className="flex justify-start gap-2">
                <Bot className="mt-1 size-6 shrink-0 rounded-full bg-cyan-400/20 p-1 text-cyan-200" />
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-slate-800 bg-[#0b1214] px-4 py-2.5 text-xs text-cyan-100"><Loader2 className="size-3.5 animate-spin" /> Type ho raha hai...</div>
              </div>
            )}
            <div ref={feedEndRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-slate-800 bg-[#0b1214] px-3 py-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {error && <p className="mb-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
          {activeProposal && (
            <button type="button" onClick={() => setForceTerminalMode((value) => !value)} className={`mb-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${forceTerminalMode ? "border-cyan-300 bg-cyan-400/15 text-cyan-100" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}>
              <Terminal className="size-3" /> Yeh terminal output hai
            </button>
          )}
          <div className="flex min-w-0 items-end gap-2">
            <Textarea
              value={composerText}
              onChange={(event) => setComposerText(event.target.value)}
              onKeyDown={(event) => { if (event.ctrlKey && event.key === "Enter") { event.preventDefault(); handleSend(); } }}
              placeholder={activeProposal ? "Agla message likhein — naya kaam, ya command chalane ke baad us ka output yahan paste karein..." : "Roman Urdu, Hindi, ya English mein likhein: misal — 'mujhe PowerShell mein backup script chahiye'"}
              className="min-h-[52px] max-h-52 w-full min-w-0 flex-1 resize-y border-slate-700 bg-[#101719] p-3 text-sm leading-6 text-white placeholder:text-slate-500"
            />
            <Button type="button" onClick={handleSend} disabled={build.isPending || diagnose.isPending || chat.isPending || !composerText.trim()} className="h-[52px] shrink-0 bg-cyan-400 px-4 text-slate-950 hover:bg-cyan-300">
              {build.isPending || diagnose.isPending || chat.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500">Ctrl+Enter se bhejein. Terminal-jaisa output khud detect ho jata hai; galat detect ho to upar wala toggle use karein.</p>
        </div>
      </div>
    </main>
  );
}
