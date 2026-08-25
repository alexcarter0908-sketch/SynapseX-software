export const universalTargets = [
  { id: "windows-powershell", label: "Windows PowerShell", platform: "Windows", shell: "PowerShell", defaultRuntime: "PowerShell 7", adminGuidance: "Run as Administrator only when the generated preflight explicitly says it is required." },
  { id: "linux-bash", label: "Linux Bash", platform: "Linux", shell: "Bash", defaultRuntime: "Bash", adminGuidance: "Use sudo only for the specific reviewed command that needs it." },
  { id: "macos-zsh", label: "macOS Zsh", platform: "macOS", shell: "Zsh", defaultRuntime: "Zsh", adminGuidance: "Use sudo only for the specific reviewed command that needs it." },
  { id: "python", label: "Python", platform: "Cross-platform", shell: "Python", defaultRuntime: "Python 3.11+", adminGuidance: "Use a project virtual environment; administrator access is not a default requirement." },
  { id: "node", label: "Node.js", platform: "Cross-platform", shell: "Node.js", defaultRuntime: "Node.js 20+", adminGuidance: "Use a project-local package installation; administrator access is not a default requirement." },
  { id: "web", label: "Website or web application", platform: "Cross-platform", shell: "Project files", defaultRuntime: "Node.js 20+", adminGuidance: "Use a project-local package installation; do not deploy without separate review." },
  { id: "api", label: "API or backend service", platform: "Cross-platform", shell: "Project files", defaultRuntime: "Python 3.11+ or Node.js 20+", adminGuidance: "Keep the first version local; deployment and credentials require separate review." },
  { id: "android-managed", label: "Authorized Android managed device", platform: "Android", shell: "Android tooling", defaultRuntime: "Android SDK / approved device-management tooling", adminGuidance: "Only use a device you own or administratively manage; do not root, bypass, or alter device security controls." },
] as const;

export type UniversalTargetId = (typeof universalTargets)[number]["id"];
export type PermissionLevel = "standard" | "administrator" | "owner-confirmed";
export type GenerationMode = "free" | "local" | "model";

export type UniversalGenerationContext = {
  targetId: UniversalTargetId;
  projectType: string;
  runtime?: string;
  permissionLevel: PermissionLevel;
  targetConfirmed: boolean;
};

export type CommandRisk = "low" | "review" | "critical" | "blocked";
export type ExecutionTier = "direct-native" | "deterministic-project" | "local-model" | "guarded-security";

const nativeWindowsApps = [
  { aliases: ["notepad", "notepad.exe"], executable: "notepad.exe", label: "Notepad", verification: "Confirm a Notepad window opened on this Windows PC." },
  { aliases: ["calculator", "calc", "calculator app"], executable: "calc.exe", label: "Calculator", verification: "Confirm a Calculator window opened on this Windows PC." },
  { aliases: ["paint", "mspaint"], executable: "mspaint.exe", label: "Paint", verification: "Confirm a Paint window opened on this Windows PC." },
  { aliases: ["file explorer", "explorer", "windows explorer"], executable: "explorer.exe", label: "File Explorer", verification: "Confirm a File Explorer window opened on this Windows PC." },
] as const;

function requestedNativeWindowsApp(prompt: string) {
  const normalized = prompt.toLowerCase().replace(/[.,!?]+$/g, "").trim();
  const action = /^(?:open|launch|start|kholo|khol do|open karo|start karo)\s+/;
  if (!action.test(normalized)) return undefined;
  const requested = normalized.replace(action, "").replace(/\s+(?:please|pls|kar do|kro)$/g, "").trim();
  return nativeWindowsApps.find((app) => app.aliases.includes(requested as never));
}

function isSynapseXOceanDeepShowcase(request: string) {
  return /\bsynapsex\b/.test(request)
    && /\b(?:ocean deep|ecosystem|one synapse|five products|creatoros|engineering agent)\b/.test(request)
    && /\b(?:website|showcase|marketing site|portfolio)\b/.test(request);
}

export function getExecutionTier(prompt: string, context: UniversalGenerationContext): ExecutionTier {
  const profile = chooseStarterProfile(prompt, context);
  if (profile === "windows-native-command") return "direct-native";
  if (["windows-signin-protection", "windows-local-password-removal", "security-protection-layer"].includes(profile)) return "guarded-security";
  if (profile === "generic") return "local-model";
  return "deterministic-project";
}

export function isPasswordRemovalRequest(prompt: string) {
  const value = prompt.toLowerCase();
  const credential = "(?:windows\\s+)?(?:sign[ -]?in\\s+)?(?:password|pswrd|passwrd|passcode|pin)";
  const removal = "(?:remove|delete|clear|hatao|hatana)";
  return new RegExp(`\\b${removal}\\s+(?:(?:my|the|mera|apna)\\s+)?${credential}\\b|\\b${credential}\\s+${removal}\\b|\\bpassword\\s+remove\\s+(?:karna|kar\\s+do|kro)\\b`, "i").test(value);
}

function hasExplicitLocalPasswordRemovalConfirmation(prompt: string) {
  const value = prompt.toLowerCase();
  return /\b(i confirm|my own local windows account|my own local account|mera apna local windows account|mera apna local account|haan.*local account)\b/.test(value);
}

export function evaluateGenerationEligibility(mode: GenerationMode, prompt: string, context: UniversalGenerationContext) {
  const risk = classifyCommandRisk(prompt);
  if (risk === "blocked") return { allowed: false, risk, reason: "This request contains an unsafe bypass, credential, or harmful-security pattern. SynapseX supports only lawful, authorized defensive work." } as const;
  if (isPasswordRemovalRequest(prompt) && !hasExplicitLocalPasswordRemovalConfirmation(prompt)) {
    return { allowed: false, risk: "review" as const, reason: "Removing a Windows sign-in password lowers device protection. Confirm that this is your own local Windows account and that you explicitly want the password removed; Microsoft and work accounts must be managed through Windows Settings or the organization." } as const;
  }
  if (mode === "model" && risk === "critical" && (!context.targetConfirmed || context.permissionLevel !== "owner-confirmed")) {
    return { allowed: false, risk, reason: "High-impact security or device changes require an owner-authorized target confirmation. Use the free-first preflight package first." } as const;
  }
  return { allowed: true, risk, reason: "Generation contract accepted." } as const;
}

export function getUniversalTarget(targetId: UniversalTargetId) {
  return universalTargets.find((target) => target.id === targetId) ?? universalTargets[0];
}

export function classifyCommandRisk(prompt: string): CommandRisk {
  const value = prompt.toLowerCase();
  const deviceRooting = /\b(?:root|rooting)\s+(?:(?:my|the|an?)\s+)?(?:phone|android|android phone|device|tablet)\b|\b(?:phone|android|android phone|device|tablet)\s+(?:root|rooting)\b/.test(value);
  if (deviceRooting || /\b(jailbreak|bypass|unlock|keylog|steal|exfiltrat|ransomware|credential dump|password crack|disable (?:antivirus|defender|edr))\b/.test(value)) return "blocked";
  const explicitlySafeBackup = /\b(backup|back up|archive|zip)\b/.test(value)
    && /\b(do not|don't|without|never|no|na kare)\b/.test(value)
    && /\b(delete|overwrite|scheduled task|registry|administrator|admin)\b/.test(value);
  if (explicitlySafeBackup) return "low";
  if (/\b(format|wipe|erase|encrypt|bitlocker|filevault|partition|registry|firewall|device policy|permission|acl|usb|removable drive|phone security)\b/.test(value)) return "critical";
  if (/\b(install|uninstall|delete|deploy|publish|database|service|network)\b/.test(value)) return "review";
  return "low";
}

export function buildUniversalGenerationContract(context: UniversalGenerationContext) {
  const target = getUniversalTarget(context.targetId);
  const runtime = context.runtime?.trim() || target.defaultRuntime;
  const confirmation = context.targetConfirmed
    ? "The user has confirmed the intended target. Still show a preflight check before any write or configuration command."
    : "The intended target has not been confirmed. Generate discovery and read-only preflight steps first; do not generate a write, encryption, permission, device-policy, or destructive command yet.";
  return [
    "Universal self-run generation contract:",
    `Target: ${target.label} (${target.platform}).`,
    `Required shell or runtime: ${runtime}.`,
    `Requested project type: ${context.projectType.trim() || "General software"}.`,
    `Permission level: ${context.permissionLevel}. ${target.adminGuidance}`,
    confirmation,
    "Return complete downloadable file artifacts, then exact save commands, install/preflight commands, run commands, expected outputs, verification commands, and rollback instructions.",
    "Self-run is the primary path. Do not require an authorized runner and never claim a command has executed.",
    "Use only the declared platform syntax. If dependencies are required, list free/open-source installation steps separately and do not claim they are installed.",
    "For a high-impact security or device action, show the action summary, affected target, backup/recovery requirement, and a separate explicit confirmation step.",
  ].join("\n");
}

type StarterArtifact = { path: string; purpose: string; content: string };

function createSynapseXShowcaseArtifacts(): { files: StarterArtifact[]; commands: string[]; verification: string[] } {
  const products = `export type Product = { slug: string; name: string; tagline: string; status: string; stack: string[]; highlights: string[]; detail: string[]; stats: [string, string][] };

export const products: Product[] = [
  { slug: 'creatoros', name: 'CreatorOS', tagline: 'AI Content Operating System', status: 'Active', stack: ['FastAPI', 'PostgreSQL', 'Next.js', 'TypeScript'], highlights: ['Chat-based command center for scripts, images, video, audio, SEO copy, and documents.', 'Provider fallback chains reduce single-provider job blocking.', 'Knowledge Base, brand voice, and script-to-render content pipelines.'], detail: ['Brand-aware content workflows keep project context together.', 'Publishing targets can be reviewed before distribution.', 'Performance workflows stay connected to creative planning.'], stats: [['Content modes', 'Scripts · images · video · audio'], ['Knowledge layer', 'RAG + brand voice'], ['Publishing targets', 'YouTube · Facebook · Instagram'], ['Workflow', 'Idea → render']] },
  { slug: 'coding-agent', name: 'SynapseX CreatorOS Coding', tagline: 'Universal AI Coding Assistant', status: 'In Development', stack: ['Node.js', 'Vite', 'React', 'tRPC', 'Drizzle', 'TypeScript'], highlights: ['Accepts development tasks across web apps, APIs, scripts, automation, mobile, debugging, and infrastructure.', 'Interprets a full prompt before planning work.', 'Uses workspace review gates, snapshots, diffs, and rollback before irreversible actions.'], detail: ['Structured plans make commands, files, verification, and recovery visible.', 'Sandbox boundaries keep arbitrary code away from the application server.', 'Review remains explicit before destructive or live actions.'], stats: [['Input', 'Natural-language engineering briefs'], ['Review', 'Diffs + snapshots'], ['Execution', 'Isolated boundary'], ['Safety', 'Approval gates']] },
  { slug: 'crm', name: 'Synapse-X-CreatorOS CRM', tagline: 'Real-Estate Operations CRM', status: 'Active', stack: ['Node.js', 'Vite', 'React', 'tRPC', 'Drizzle', 'PostgreSQL'], highlights: ['One workspace from lead capture through qualification, Customer 360, inventory, portal, and commissions.', 'Explainable property-to-buyer matching and reviewed follow-up suggestions.', 'Scoped client portal, role-safe access, and audit trails.'], detail: ['Sales operations stay traceable across multiple roles.', 'Client visibility is scoped to authorized project context.', 'Follow-up suggestions remain reviewable instead of autonomous commitments.'], stats: [['Roles', '6 operational roles'], ['Flow', 'Lead → delivery'], ['Portal', 'Scoped client visibility'], ['Audit', 'Recorded actions']] },
  { slug: 'abot', name: 'Synapse-X ABot', tagline: 'Autonomous Meta Ad Campaign Engine', status: 'In Development', stack: ['FastAPI', 'Groq LLM', 'Meta Marketing API'], highlights: ['Understands Roman Urdu, Urdu, and English campaign instructions.', 'Creates campaigns paused by default and requires review above configured budget thresholds.', 'Includes Special-Ad-Category checks, budget guard logic, and lead-to-WhatsApp follow-up flow.'], detail: ['Human approval remains before a campaign goes live.', 'Compliance and budget conditions are visible instead of hidden.', 'Campaign intent is translated into a structured reviewable plan.'], stats: [['Languages', 'Roman Urdu · Urdu · English'], ['Launch default', 'Paused'], ['Review gate', 'Budget threshold'], ['Domain', 'Housing compliance']] },
  { slug: 'engineering-agent', name: 'Universal Engineering Agent', tagline: 'Local Software Engineering Assistant', status: 'Active', stack: ['Python CLI', 'Optional local LLM planning'], highlights: ['PowerShell-first commands inspect, audit, test, plan, and change within a workspace.', 'Read-only by default; changes require exact-match specification, approval, and backup.', 'Workspace boundaries prevent scanning outside the owned installation directory.'], detail: ['Engineering actions start from environment evidence.', 'Change plans distinguish proposed work from applied work.', 'Local model planning stays optional and reviewable.'], stats: [['CLI commands', 'inspect · audit · test · plan · change'], ['Default', 'Read-only'], ['Change gate', 'Exact spec + approval'], ['Boundary', 'Workspace only']] },
];

export function productBySlug(slug: string) { return products.find((product) => product.slug === slug); }
`;
  return {
    files: [
      { path: 'package.json', purpose: 'Next.js project manifest with the requested Tailwind and Framer Motion stack', content: `{"name":"synapsex-ecosystem-showcase","private":true,"version":"1.0.0","scripts":{"dev":"next dev","build":"next build","start":"next start"},"dependencies":{"framer-motion":"^11.11.17","next":"^14.2.15","react":"^18.3.1","react-dom":"^18.3.1"},"devDependencies":{"@types/node":"^22.7.5","@types/react":"^18.3.11","@types/react-dom":"^18.3.0","autoprefixer":"^10.4.20","postcss":"^8.4.47","tailwindcss":"^3.4.14","typescript":"^5.6.3"}}\n` },
      { path: 'tsconfig.json', purpose: 'TypeScript configuration for Next.js App Router', content: `{"compilerOptions":{"target":"es5","lib":["dom","dom.iterable","esnext"],"allowJs":false,"skipLibCheck":true,"strict":true,"noEmit":true,"esModuleInterop":true,"module":"esnext","moduleResolution":"bundler","resolveJsonModule":true,"isolatedModules":true,"jsx":"preserve","incremental":true,"plugins":[{"name":"next"}]},"include":["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts"],"exclude":["node_modules"]}\n` },
      { path: 'next-env.d.ts', purpose: 'Next.js TypeScript environment declarations', content: `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n\n// This file is generated by Next.js and should not be edited.\n` },
      { path: 'postcss.config.js', purpose: 'Tailwind CSS build configuration', content: `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };\n` },
      { path: 'tailwind.config.ts', purpose: 'Tailwind content scanning configuration', content: `import type { Config } from 'tailwindcss';\nexport default { content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'], theme: { extend: {} }, plugins: [] } satisfies Config;\n` },
      { path: 'lib/products.ts', purpose: 'Factual product data for the shared ecosystem pages', content: products },
      { path: 'components/NeuralBackground.tsx', purpose: 'Low-opacity animated neural network canvas with reduced-motion support', content: `'use client';\nimport { useEffect, useRef } from 'react';\nexport function NeuralBackground() { const ref = useRef<HTMLCanvasElement>(null); useEffect(() => { const canvas = ref.current; if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return; const ctx = canvas.getContext('2d'); if (!ctx) return; let frame = 0; const nodes = Array.from({ length: 78 }, () => ({ x: Math.random(), y: Math.random(), dx: (Math.random() - .5) * .00025, dy: (Math.random() - .5) * .00025, r: 1 + Math.random() * 1.8 })); const render = () => { const dpr = devicePixelRatio || 1; const w = innerWidth, h = innerHeight; if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; ctx.setTransform(dpr,0,0,dpr,0,0); } ctx.clearRect(0,0,w,h); for (const n of nodes) { n.x = (n.x + n.dx + 1) % 1; n.y = (n.y + n.dy + 1) % 1; } for (let i=0;i<nodes.length;i++) for (let j=i+1;j<nodes.length;j++) { const a=nodes[i], b=nodes[j], x=(a.x-b.x)*w, y=(a.y-b.y)*h, dist=Math.hypot(x,y); if (dist < 135) { ctx.strokeStyle = 'rgba(54,204,243,' + ((1-dist/135)*.10) + ')'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(a.x*w,a.y*h); ctx.lineTo(b.x*w,b.y*h); ctx.stroke(); } } for (const n of nodes) { const pulse = .4 + .3*Math.sin(frame*.015+n.x*8); ctx.fillStyle='rgba(147,232,251,'+pulse+')'; ctx.beginPath(); ctx.arc(n.x*w,n.y*h,n.r,0,Math.PI*2); ctx.fill(); } frame++; requestAnimationFrame(render); }; const id=requestAnimationFrame(render); return () => cancelAnimationFrame(id); }, []); return <canvas ref={ref} aria-hidden className="neural-canvas" />; }\n` },
      { path: 'components/Reveal.tsx', purpose: 'Reusable Framer Motion scroll reveal wrapper', content: `'use client';\nimport { motion } from 'framer-motion';\nimport type { ReactNode } from 'react';\nexport function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) { return <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .18 }} transition={{ duration: .55, delay }}>{children}</motion.div>; }\n` },
      { path: 'components/EcosystemOrbit.tsx', purpose: 'Interactive central-core and five-product orbital ecosystem diagram', content: `'use client';\nimport Link from 'next/link';\nimport { products } from '../lib/products';\nexport function EcosystemOrbit() { return <div className="orbit-wrap" id="ecosystem"><div className="orbit-ring ring-a"/><div className="orbit-ring ring-b"/><div className="core-node"><span>SynapseX</span><small>Core</small></div>{products.map((p,i)=><Link href={'/products/'+p.slug} key={p.slug} className={'orbit-node node-'+i}><i className="status-dot"/><span>{p.name.replace('SynapseX CreatorOS ', '')}</span></Link>)}<svg className="orbit-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>{[18,36,54,72,90].map((y)=><path key={y} d={'M50 50 L'+(y===18?50:y===36?84:y===54?72:y===72?28:16)+' '+(y===18?12:y===36?31:y===54?78:y===72?78:31)} />)}</svg></div>; }\n` },
      { path: 'components/ProductCard.tsx', purpose: 'Accessible product card with status pulse, mouse spotlight, and tilt interaction', content: `'use client';\nimport Link from 'next/link';\nimport type { Product } from '../lib/products';\nexport function ProductCard({ product }: { product: Product }) { return <article className="product-card" onMouseMove={(event)=>{ const r=event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty('--mouse-x', (event.clientX-r.left)+'px'); event.currentTarget.style.setProperty('--mouse-y', (event.clientY-r.top)+'px'); }}><div className="card-head"><p className="status"><i className="status-dot"/>{product.status}</p><span className="card-index">0{product.slug === 'creatoros' ? '1' : product.slug === 'coding-agent' ? '2' : product.slug === 'crm' ? '3' : product.slug === 'abot' ? '4' : '5'}</span></div><h3>{product.name}</h3><p className="tagline">{product.tagline}</p><ul>{product.highlights.map((item)=><li key={item}>{item}</li>)}</ul><div className="chips">{product.stack.map((item)=><span key={item}>{item}</span>)}</div><Link href={'/products/'+product.slug} className="text-link">View Product <b>→</b></Link></article>; }\n` },
      { path: 'app/layout.tsx', purpose: 'Shared App Router shell with responsive navigation and neural background', content: `import type { Metadata } from 'next';\nimport Link from 'next/link';\nimport './globals.css';\nimport { NeuralBackground } from '../components/NeuralBackground';\nimport { products } from '../lib/products';\nexport const metadata: Metadata = { title: 'SynapseX — One Synapse. Every System Connected.', description: 'A connected ecosystem of AI-built products.' };\nexport default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><NeuralBackground/><aside className="sidebar"><Link href="/" className="brand"><span className="brand-mark">X</span><span>SynapseX</span></Link><nav><Link href="/">Ecosystem</Link>{products.map((p)=><Link key={p.slug} href={'/products/'+p.slug}>{p.name}</Link>)}</nav><p className="side-note">One Synapse.<br/>Every System Connected.</p></aside><main className="site-main">{children}</main></body></html>; }\n` },
      { path: 'app/page.tsx', purpose: 'Homepage with hero, animated ecosystem, factual product grid, and connection philosophy', content: `import { products } from '../lib/products';\nimport { EcosystemOrbit } from '../components/EcosystemOrbit';\nimport { ProductCard } from '../components/ProductCard';\nimport { Reveal } from '../components/Reveal';\nexport default function Home() { return <><section className="hero"><Reveal><p className="eyebrow">SYNAPSEX / CONNECTED INTELLIGENCE</p><h1>One Synapse.<br/><span>Every System Connected.</span></h1><p className="hero-copy">Five AI-built products. One connected intelligence layer — content, code, sales, ads, and engineering, wired together.</p><a href="#ecosystem" className="primary-cta">Explore the Ecosystem <b>↓</b></a><div className="stats"><div><strong>5</strong><span>Products connected</span></div><div><strong>2</strong><span>Roman Urdu + English</span></div><div><strong>100%</strong><span>AI-orchestrated workflows</span></div></div></Reveal></section><section className="section orbit-section"><Reveal><p className="eyebrow">CONNECTED SYSTEM MAP</p><h2>One core. Five specialized systems.</h2><p className="section-copy">Each product solves a distinct problem while following the same pattern: explicit approval, observable workflow state, and review before irreversible actions.</p></Reveal><EcosystemOrbit/></section><section className="section"><Reveal><p className="eyebrow">PRODUCT LAYER</p><h2>Specialized products. Shared engineering philosophy.</h2></Reveal><div className="product-grid">{products.map((product,index)=><Reveal key={product.slug} delay={index*.08}><ProductCard product={product}/></Reveal>)}</div></section><section className="section connection"><Reveal><p className="eyebrow">HOW IT CONNECTS</p><h2>Designed as one operating philosophy.</h2><p>SynapseX products keep important decisions visible. Content pipelines, code changes, client communication, campaign budgets, and engineering actions all use reviewable state, explicit approval where risk increases, and audit-friendly workflows.</p></Reveal></section><footer><span className="brand-mark">X</span><p>Built entirely with AI-assisted engineering.</p><p>© SynapseX</p></footer></>; }\n` },
      { path: 'app/products/[slug]/page.tsx', purpose: 'Dynamic product detail route with factual capability cards and terminal demo', content: `import { notFound } from 'next/navigation';\nimport Link from 'next/link';\nimport { productBySlug } from '../../../lib/products';\nimport { Reveal } from '../../../components/Reveal';\nexport function generateStaticParams() { return ['creatoros','coding-agent','crm','abot','engineering-agent'].map((slug)=>({slug})); }\nexport default function ProductPage({ params }: { params: { slug: string } }) { const product = productBySlug(params.slug); if (!product) notFound(); const terminal = product.slug === 'engineering-agent' ? 'uea inspect .\\workspace' : product.slug === 'coding-agent' ? 'synapsex plan "Create a reviewed feature"' : 'synapsex status --review'; return <><section className="product-hero"><Reveal><Link href="/" className="back">← Back to ecosystem</Link><p className="status"><i className="status-dot"/>{product.status}</p><h1>{product.name}</h1><p className="hero-copy">{product.tagline}</p><div className="chips large">{product.stack.map((item)=><span key={item}>{item}</span>)}</div></Reveal></section><section className="section"><div className="metric-grid">{product.stats.map(([label,value])=><Reveal key={label}><article className="metric"><p>{label}</p><strong>{value}</strong></article></Reveal>)}</div></section><section className="section feature-grid">{[...product.highlights,...product.detail].map((feature,index)=><Reveal key={feature} delay={index*.06}><article className="feature"><span>0{index+1}</span><p>{feature}</p></article></Reveal>)}</section>{(product.slug === 'coding-agent' || product.slug === 'engineering-agent') && <section className="section"><Reveal><p className="eyebrow">TERMINAL DEMO</p><div className="terminal"><div><i/><i/><i/><span>reviewed local command</span></div><code><b>$</b> {terminal}<em>▋</em></code></div></Reveal></section>}<section className="section connection"><Reveal><h2>Built to stay reviewable.</h2><p>This product is presented using only structural feature facts from the supplied brief. It does not claim fabricated revenue, users, or performance numbers.</p></Reveal></section></>; }\n` },
      { path: 'app/globals.css', purpose: 'Ocean Deep visual system, responsive layout, animation, hover, and reduced-motion behavior', content: `@tailwind base;@tailwind components;@tailwind utilities;:root{--bg:#050f1e;--surface:#0a1526;--panel:#0d1e39;--elevated:#0f2440;--active:#112c4f;--border:#16294a;--text:#eaf1fb;--muted:#7d93b8;--cyan:#36ccf3;--cyan-soft:#93e8fb;--blue:#2a9bf6;--violet:#9b7bf0;--pink:#e879b9}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,sans-serif}.neural-canvas{position:fixed;inset:0;z-index:-1;opacity:.8;pointer-events:none}.sidebar{position:fixed;inset:0 auto 0 0;width:270px;padding:30px 20px;border-right:1px solid var(--border);background:rgba(5,15,30,.78);backdrop-filter:blur(18px);z-index:10}.brand{display:flex;align-items:center;gap:10px;color:var(--text);text-decoration:none;font-weight:800;font-size:1.15rem}.brand-mark{display:inline-grid;place-items:center;width:34px;height:34px;border:1px solid rgba(54,204,243,.65);border-radius:11px;color:var(--cyan);font-weight:900;box-shadow:0 0 24px rgba(54,204,243,.24)}nav{display:grid;gap:5px;margin-top:42px}nav a{padding:10px 11px;border-radius:10px;text-decoration:none;color:var(--muted);font-size:.82rem;line-height:1.35;transition:transform .2s,color .2s,background .2s}nav a:hover{background:var(--active);color:var(--cyan-soft);transform:translateX(3px)}.side-note{position:absolute;bottom:28px;color:var(--muted);font-size:.78rem;line-height:1.6}.site-main{margin-left:270px;min-height:100vh}.hero,.section,.product-hero{max-width:1280px;margin:auto;padding:clamp(72px,10vw,140px) clamp(26px,7vw,100px)}.hero{min-height:94vh;display:grid;align-content:center}.eyebrow{margin:0 0 18px;color:var(--cyan);font-size:.74rem;font-weight:800;letter-spacing:.16em}.hero h1,.product-hero h1{margin:0;max-width:900px;font-size:clamp(3.6rem,8vw,8rem);line-height:.9;letter-spacing:-.075em}.hero h1 span{background:linear-gradient(105deg,var(--cyan),var(--violet),var(--pink),var(--cyan));background-size:250% auto;background-clip:text;color:transparent;animation:gradient 9s linear infinite}.hero-copy,.section-copy{max-width:670px;margin:28px 0;color:var(--muted);font-size:clamp(1rem,1.7vw,1.2rem);line-height:1.75}.primary-cta,.text-link{display:inline-flex;gap:12px;align-items:center;text-decoration:none;color:#00121b;background:var(--cyan);border-radius:12px;padding:14px 18px;font-weight:800}.stats{display:flex;flex-wrap:wrap;gap:12px;margin-top:58px}.stats div,.metric{padding:15px 18px;border:1px solid var(--border);border-radius:16px;background:rgba(13,30,57,.76)}.stats strong{display:block;color:var(--cyan-soft);font-size:1.5rem}.stats span,.metric p{color:var(--muted);font-size:.76rem}.section{border-top:1px solid rgba(22,41,74,.55)}h2{margin:0;font-size:clamp(2.1rem,4vw,4rem);letter-spacing:-.055em}.orbit-section{overflow:hidden}.orbit-wrap{position:relative;width:min(780px,100%);aspect-ratio:1;margin:54px auto 0}.orbit-ring{position:absolute;inset:15%;border:1px solid rgba(54,204,243,.22);border-radius:50%}.ring-b{inset:31%;border-color:rgba(155,123,240,.24)}.core-node,.orbit-node{position:absolute;display:grid;place-items:center;border:1px solid rgba(54,204,243,.58);border-radius:50%;background:rgba(13,30,57,.86);text-decoration:none;color:var(--text);box-shadow:0 0 35px rgba(54,204,243,.2);z-index:2}.core-node{inset:39%;font-weight:850}.core-node small{color:var(--cyan);font-size:.62rem;text-transform:uppercase;letter-spacing:.15em}.orbit-node{width:126px;height:126px;padding:15px;text-align:center;font-size:.75rem;font-weight:700;transition:transform .25s,box-shadow .25s}.orbit-node:hover{transform:scale(1.07);box-shadow:0 0 44px rgba(155,123,240,.45)}.node-0{left:43%;top:2%}.node-1{right:3%;top:22%}.node-2{right:15%;bottom:4%}.node-3{left:15%;bottom:4%}.node-4{left:3%;top:22%}.orbit-lines{position:absolute;inset:0;width:100%;height:100%;z-index:1}.orbit-lines path{fill:none;stroke:var(--cyan);stroke-width:.35;stroke-dasharray:2 4;animation:signal 2.8s linear infinite}.product-grid,.feature-grid,.metric-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:42px}.product-card,.feature,.metric{position:relative;overflow:hidden;border:1px solid var(--border);border-radius:18px;background:linear-gradient(135deg,rgba(13,30,57,.94),rgba(10,21,38,.86));padding:25px;transition:transform .25s,box-shadow .25s,border-color .25s}.product-card:before{content:'';position:absolute;inset:0;background:radial-gradient(340px circle at var(--mouse-x,50%) var(--mouse-y,50%),rgba(54,204,243,.12),transparent 45%);pointer-events:none}.product-card:hover{transform:translateY(-4px);border-color:rgba(54,204,243,.55);box-shadow:0 0 0 1px rgba(54,204,243,.15),0 8px 30px -8px rgba(54,204,243,.25)}.card-head{display:flex;justify-content:space-between}.status{display:flex;align-items:center;gap:7px;color:var(--cyan-soft);font-size:.72rem;text-transform:uppercase;letter-spacing:.1em}.status-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--cyan);box-shadow:0 0 12px var(--cyan);animation:blink 2s ease-in-out infinite}.card-index,.feature span{color:var(--violet);font-family:ui-monospace,monospace}.product-card h3{font-size:1.25rem;margin:28px 0 8px}.tagline{color:var(--cyan-soft);margin:0}.product-card ul{padding-left:18px;color:var(--muted);font-size:.86rem;line-height:1.65}.chips{display:flex;flex-wrap:wrap;gap:7px;margin:20px 0}.chips span{padding:5px 8px;border:1px solid var(--border);border-radius:7px;color:var(--muted);font-size:.7rem}.large span{font-size:.82rem}.text-link{padding:0;background:transparent;color:var(--cyan);font-size:.82rem}.connection{max-width:920px}.connection p{color:var(--muted);line-height:1.8;font-size:1.05rem}.product-hero{padding-bottom:45px}.back{display:inline-block;margin-bottom:36px;color:var(--cyan);text-decoration:none}.metric strong{display:block;margin-top:12px;font-size:1.1rem;line-height:1.4}.feature p{margin:18px 0 0;color:var(--muted);line-height:1.7}.terminal{overflow:hidden;border:1px solid var(--border);border-radius:16px;background:#06101d;box-shadow:0 18px 70px rgba(0,0,0,.35)}.terminal>div{padding:11px 14px;background:#0c1c33}.terminal i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:var(--pink)}.terminal i:nth-child(2){background:var(--cyan)}.terminal i:nth-child(3){background:var(--violet)}.terminal span{margin-left:10px;color:var(--muted);font-size:.72rem}.terminal code{display:block;padding:25px;color:var(--cyan-soft)}.terminal b{color:var(--cyan)}.terminal em{font-style:normal;animation:blink 1s steps(2) infinite}footer{display:flex;gap:18px;align-items:center;padding:38px clamp(26px,7vw,100px);border-top:1px solid var(--border);color:var(--muted);font-size:.82rem}@keyframes gradient{to{background-position:250% center}}@keyframes signal{to{stroke-dashoffset:-12}}@keyframes blink{50%{opacity:.25}}@media(max-width:900px){.sidebar{position:sticky;top:0;width:100%;height:auto;display:flex;align-items:center;gap:18px;padding:13px 18px}.sidebar nav{display:flex;gap:2px;margin:0;overflow:auto}.sidebar nav a{white-space:nowrap;padding:7px}.side-note{display:none}.site-main{margin:0}.product-grid,.feature-grid,.metric-grid{grid-template-columns:1fr}.orbit-node{width:88px;height:88px;font-size:.59rem}.core-node{font-size:.72rem}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.001ms!important;transition-duration:.001ms!important;scroll-behavior:auto!important}.neural-canvas{display:none}}\n` },
      { path: 'README.md', purpose: 'Project setup, factual-content boundary, and local verification guide', content: `# SynapseX Ocean Deep ecosystem showcase\n\nThis is a local Next.js App Router showcase website generated from the supplied SynapseX product brief. Product claims are structural capabilities from that brief; no testimonials, revenue, user counts, or fabricated performance metrics are included.\n\n## Run locally\n\n1. Run \`npm install\`.\n2. Run \`npm run dev -- --port 3012\`.\n3. Open \`http://127.0.0.1:3012\`.\n4. Visit every product route and confirm responsive navigation.\n\n## Verify\n\n- Homepage: neural background, central core, five linked product nodes, product cards, and reduced-motion behavior.\n- Product routes: \`/products/creatoros\`, \`/products/coding-agent\`, \`/products/crm\`, \`/products/abot\`, and \`/products/engineering-agent\`.\n- Run \`npm run build\` before deployment.\n\nStop the development server with Ctrl+C.\n` },
    ],
    commands: ['node --version', 'npm install', 'npm run dev -- --port 3012'],
    verification: ['Open http://127.0.0.1:3012 and confirm the Ocean Deep homepage, neural canvas, central core, and five product cards appear.', 'Open each /products/<slug> route and confirm the factual product content and terminal demo pages render.', 'Use a reduced-motion browser setting and confirm background/motion effects do not animate.', 'Run npm run build and confirm the production build succeeds before deployment.', 'Stop the local server with Ctrl+C when finished.'],
  };
}

function knownWindowsDiagnostic(request: string) {
  const value = request.toLowerCase();
  if (/param.*not recognized/.test(value)) return { title: "Generated PowerShell parameter-order error", cause: "A param block appears after an executable statement, so PowerShell treats param as an unknown command and stops before the requested action.", next: "Do not run Apply. Generate or extract the corrected package, then confirm the affected script begins with param(...)." };
  if (/ollama.*not recognized/.test(value)) return { title: "Ollama prerequisite unavailable", cause: "The Ollama command is not installed or not available in the current Windows PATH.", next: "Install/verify Ollama only for a local-model package. Do not run a local-model script from an older backup or sign-in package folder." };
  if (/powershell\.exe.*access is denied|program 'powershell\.exe' failed to run/.test(value)) return { title: "Nested PowerShell launch denied", cause: "The current Windows policy or session rejected launching powershell.exe from inside PowerShell.", next: "Use the current elevated window and invoke a reviewed script directly with &: & .\\scripts\\ScriptName.ps1." };
  if (/prior wake values were unavailable/.test(value)) return { title: "Previous wake setting unavailable", cause: "The saved rollback state does not contain trustworthy AC/DC values, so the rollback correctly refused to guess and made no change.", next: "Collect the current read-only power evidence before selecting a reviewed wake-setting change." };
  if (/password required\s+no/.test(value)) return { title: "Local account password is not required", cause: "Windows reports that the selected local account does not require a password. Sleep/wake sign-in policy is separate from account-password state.", next: "Test sign-out/restart separately from sleep/wake and review the relevant package guide." };
  return { title: "Windows package diagnostic", cause: "The pasted error needs read-only environment evidence before another apply action is attempted.", next: "Run the included diagnostic collector from the newly extracted package folder, then paste its JSON and the complete error into SynapseX." };
}

function windowsDiagnosticCollectorScript() {
  return `param([string]$OutputPath = (Join-Path (Get-Location) 'synapsex-diagnostics.json'))
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$scripts = @(Get-ChildItem -LiteralPath (Join-Path $root 'scripts') -Filter '*.ps1' -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
$localAccount = Get-LocalUser -Name $env:USERNAME -ErrorAction SilentlyContinue
$powerQuery = (& powercfg /QUERY SCHEME_CURRENT SUB_NONE CONSOLELOCK 2>&1 | Out-String)
[ordered]@{
  CollectedAt = (Get-Date).ToString('o')
  CurrentFolder = $root
  PowerShellVersion = $PSVersionTable.PSVersion.ToString()
  PackageRootHasReadme = Test-Path -LiteralPath (Join-Path $root 'README.md')
  PackageRootHasRunGuide = Test-Path -LiteralPath (Join-Path $root 'RUN-ME-FIRST.ps1')
  Scripts = $scripts
  CurrentUser = if ($localAccount) { [ordered]@{ Name = $localAccount.Name; Enabled = $localAccount.Enabled; PrincipalSource = $localAccount.PrincipalSource.ToString() } } else { 'Microsoft/work account or unavailable' }
  WakePowerQuery = $powerQuery
  Note = 'Read-only diagnostic report. It does not expose, save, or transmit password values.'
} | ConvertTo-Json -Depth 6 | Tee-Object -FilePath $OutputPath
Write-Host "Diagnostic report saved to $OutputPath" -ForegroundColor Green
`;
}

function windowsTroubleshootingGuide() {
  return `# SynapseX Windows package troubleshooting

## First diagnostic step

From the newly extracted generated package folder, run:

\`\`\`powershell
& .\\scripts\\Collect-SynapseXDiagnostics.ps1
\`\`\`

Paste its JSON and the complete error into SynapseX before repeating an Apply command.

| Observed message or condition | Meaning | Safe next step |
|---|---|---|
| param is not recognized | Generated PowerShell syntax is invalid; no requested change ran. | Do not use Apply. Obtain a corrected package and confirm the first line is param(...). |
| Ollama is not recognized | Local-model dependency is unavailable. | Install/verify Ollama only for a local-model package; never run it from an older package folder. |
| powershell.exe Access is denied | Nested shell launch was denied. | Run reviewed scripts directly in the current elevated window using &. |
| Script not found or wrong files | You are in an old or wrong extraction folder. | Extract newest synapsex-package ZIP into a new timestamped folder and run RUN-ME-FIRST.ps1. |
| Previous wake values unavailable | Safe rollback cannot infer an unknown old setting. | Do not guess. Collect current power evidence first. |
| Account password differs from wake behavior | Account password and sleep/wake policy are separate. | Test sign-out/restart separately from sleep/wake. |

Never paste a password, PIN, recovery code, or secret into SynapseX or a script argument.
`;
}

function windowsZipExtractionCommands() {
  return [
    "# AFTER clicking Download ZIP, paste this block into a new Administrator PowerShell window:",
    '$packageZip = Get-ChildItem "$env:USERPROFILE\\Downloads" -Filter "synapsex-package-*.zip" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1',
    'if (-not $packageZip) { throw "No SynapseX generated ZIP was found in Downloads." }',
    '$packageFolder = "$env:USERPROFILE\\Documents\\SynapseX-Generated-$(Get-Date -Format yyyyMMdd-HHmmss)"',
    'Expand-Archive -LiteralPath $packageZip.FullName -DestinationPath $packageFolder -Force',
    'Set-Location $packageFolder',
    'Get-ChildItem .\\scripts\\*.ps1 -ErrorAction SilentlyContinue',
    'Get-ChildItem .\\scripts\\*.ps1 -ErrorAction SilentlyContinue | Unblock-File',
    '& .\\RUN-ME-FIRST.ps1',
  ];
}

function windowsZipRunGuide(profile: ReturnType<typeof chooseStarterProfile>, starterCommands: string[]) {
  const commands = starterCommands.length ? starterCommands.join("\n") : "Run the read-only preflight, then review README.md before taking any action.";
  const signInSpecific = profile === "windows-signin-protection"
    ? "\n## Windows sign-in protection sequence\n\n1. Preview only: `& .\\scripts\\Install-RequireSignInAfterWake.ps1`\n2. Apply only after the preview is correct: `& .\\scripts\\Install-RequireSignInAfterWake.ps1 -Apply`\n3. Verify: `& .\\scripts\\Verify-RequireSignInAfterWake.ps1`\n4. For a local account without a password only: `& .\\scripts\\Set-LocalAccountPassword.ps1`\n5. Read `docs/IMPLEMENTATION-NOTES.md` before using the rollback script.\n"
    : profile === "windows-local-password-removal"
      ? "\n## Local-account password removal sequence\n\n1. Preview only: `& .\\scripts\\Preview-RemoveLocalAccountPassword.ps1`\n2. Apply only after the preview is correct: `& .\\scripts\\Remove-LocalAccountPassword.ps1 -Apply`\n3. Type both confirmations yourself when asked.\n4. Verify: `& .\\scripts\\Verify-LocalAccountPasswordRemoval.ps1`\n5. To restore sign-in protection, use `& .\\scripts\\Restore-LocalAccountPassword.ps1` and enter a new password securely.\n"
      : "";
  return `# SynapseX Windows generated ZIP: extract and run\n\n## Before running\n\n- Use only a Windows device you own or are authorized to administer.\n- Do not run this package from an older backup or protection folder.\n- The response that created this ZIP contains the same extraction block below.\n\n## Extract the downloaded ZIP\n\nOpen **Administrator PowerShell** and run:\n\n\`\`\`powershell\n${windowsZipExtractionCommands().join("\n")}\n\`\`\`\n\n## Package-specific commands\n\nAfter extraction, the generated-package commands are:\n\n\`\`\`powershell\n${commands}\n\`\`\`${signInSpecific}\n## Verify and rollback\n\nDo not call the work complete until the package verification command succeeds. Read the included README and rollback documents before reducing any protection.\n`;
}

function windowsRunFirstScript(profile: ReturnType<typeof chooseStarterProfile>, starterCommands: string[]) {
  const primary = profile === "windows-signin-protection"
    ? "Write-Host 'Preview: & .\\scripts\\Install-RequireSignInAfterWake.ps1' -ForegroundColor Cyan\nWrite-Host 'Apply only after preview: & .\\scripts\\Install-RequireSignInAfterWake.ps1 -Apply' -ForegroundColor Yellow\nWrite-Host 'Verify: & .\\scripts\\Verify-RequireSignInAfterWake.ps1' -ForegroundColor Green"
    : profile === "windows-local-password-removal"
      ? "Write-Host 'Preview: & .\\scripts\\Preview-RemoveLocalAccountPassword.ps1' -ForegroundColor Cyan\nWrite-Host 'Apply only after preview: & .\\scripts\\Remove-LocalAccountPassword.ps1 -Apply' -ForegroundColor Yellow\nWrite-Host 'Verify: & .\\scripts\\Verify-LocalAccountPasswordRemoval.ps1' -ForegroundColor Green\nWrite-Host 'Restore protection later: & .\\scripts\\Restore-LocalAccountPassword.ps1' -ForegroundColor Green"
      : `Write-Host 'Read package-specific commands in docs\\WINDOWS-ZIP-RUN-GUIDE.md' -ForegroundColor Cyan\nWrite-Host ${JSON.stringify(starterCommands.join(" ; ") || "Run the read-only preflight first.")}`;
  return `$ErrorActionPreference = 'Stop'\n$root = Split-Path -Parent $PSCommandPath\nSet-Location $root\nWrite-Host 'SynapseX generated package is ready.' -ForegroundColor Green\nGet-ChildItem .\\scripts\\*.ps1 -ErrorAction SilentlyContinue | Select-Object Name, Length\n${primary}\nWrite-Host 'If a command errors, run: & .\\scripts\\Collect-SynapseXDiagnostics.ps1' -ForegroundColor Cyan\nWrite-Host 'Do not use -Apply until you have reviewed the preview and package guide.' -ForegroundColor Yellow\n`;
}

export function chooseStarterProfile(prompt: string, context: UniversalGenerationContext) {
  const request = `${prompt} ${context.projectType} ${context.runtime ?? ""}`.toLowerCase();
  const asksForSignIn = /\b(password|pswrd|passwrd|passcode|sign[ -]?in|login|lock screen|pin)\b|पासवर्ड|पिन|साइन[ -]?इन/.test(request);
  const mentionsWakeOrBoot = /\b(sleep|wake|shutdown|boot|laptop|windows|neend|jagne|jag|on karne|band karne)\b|स्लीप|जाग|शटडाउन|बूट|लैपटॉप|विंडोज/.test(request);
  if (context.targetId === "windows-powershell" && requestedNativeWindowsApp(prompt)) return "windows-native-command" as const;
  if (/param.*not recognized|ollama.*not recognized|powershell\.exe.*access is denied|program 'powershell\.exe' failed to run|prior wake values were unavailable|password required\s+no/.test(request)) return "windows-diagnostic" as const;
  if (isSynapseXOceanDeepShowcase(request)) return "nextjs-synapsex-showcase" as const;
  if (/\b(next\.js|nextjs|marketing website|portfolio site|app router|tailwind|framer motion)\b/.test(request)) return "nextjs-website" as const;
  if (/\b(react|vite react|react app)\b/.test(request)) return "react" as const;
  if (/\b(website|landing page|html|frontend|web app)\b/.test(request)) return "website" as const;
  if (/\b(fastapi|python api|python backend|rest api)\b/.test(request)) return "fastapi" as const;
  if (/\b(sqlite|local database|database app|database application)\b/.test(request)) return "local-database" as const;
  if (/\b(node\.js|nodejs|node service|express service|javascript service)\b/.test(request)) return "node" as const;
  if (isPasswordRemovalRequest(request) && hasExplicitLocalPasswordRemovalConfirmation(request)) return "windows-local-password-removal" as const;
  if (asksForSignIn && mentionsWakeOrBoot) return "windows-signin-protection" as const;
  if (/\b(self[- ]?improv|improve yourself|fix yourself|own code|synapsex (?:code|workspace|project)|rebuild yourself)\b/.test(request)) return "self-improvement" as const;
  if (/\b(command center|laptop (?:design|structure)|phone (?:design|structure)|mobile device design|vehicle automation|car automation|iot system|hardware system)\b/.test(request)) return "systems-design" as const;
  const defensiveProtectionSignal = /\b(security[-\s]+baseline|defensive\s+security|defensive(?:\s+\w+){0,2}?\s+protection[-\s]+layer|usb[-\s]+security|device[-\s]+protection|hardening|endpoint[-\s]+security|protection[-\s]+layer|windows[-\s]+firewall|microsoft[-\s]+defender)\b/.test(request);
  const defensiveImplementationSignal = /\b(implement|implementation|install|apply|enable|enforce)\b/.test(request)
    || (/\b(create|build|package)\b/.test(request) && /\b(protection[-\s]+layer|firewall|defender)\b/.test(request));
  if (defensiveProtectionSignal && defensiveImplementationSignal) return "security-protection-layer" as const;
  if (defensiveProtectionSignal) return "security-baseline" as const;
  if ((context.targetId === "windows-powershell" || /\b(powershell|\.ps1)\b/.test(request)) && /\b(backup|back up|archive|zip)\b/.test(request)) return "powershell-backup" as const;
  if (/\b(powershell|\.ps1|windows command)\b/.test(request)) return "powershell" as const;
  return "generic" as const;
}

function windowsBackupPaths(request: string) {
  const compactPaths = (request.match(/[A-Za-z]:\\(?:[^\s\\/:*?"<>|]+\\)*[^\s\\/:*?"<>|]+/g) ?? [])
    .map((path) => path.replace(/[.,;]+$/, ""));
  const phraseBoundedPaths = (request.match(/[A-Za-z]:\\[^\r\n:]+?(?=(?:\s+(?:hoga|hogi|will|aur|and|backup|source|destination|folder)|[.,;]|$))/gi) ?? [])
    .map((match) => match.trim().replace(/[.,;]+$/, ""));
  const matches = [...compactPaths, ...phraseBoundedPaths].filter((path, index, all) => all.indexOf(path) === index);
  return {
    sourcePath: matches[0] ?? "C:\\Path\\To\\SourceProject",
    backupPath: matches[1] ?? "C:\\Path\\To\\BackupFolder",
  };
}

function requestedPort(request: string, fallback: number) {
  const match = request.match(/\bport\s+(\d{2,5})\b/i);
  const value = match ? Number(match[1]) : fallback;
  return Number.isInteger(value) && value >= 1024 && value <= 65535 ? value : fallback;
}

function createStarterArtifacts(profile: ReturnType<typeof chooseStarterProfile>, request: string): { files: StarterArtifact[]; commands: string[]; verification: string[] } {
  const requestComment = request.replace(/\s+/g, " ").trim().slice(0, 240);
  if (profile === "nextjs-synapsex-showcase") return createSynapseXShowcaseArtifacts();
  if (profile === "nextjs-website") return {
    files: [
      { path: "package.json", purpose: "Next.js project manifest", content: `{"name":"synapsex-nextjs-project","private":true,"scripts":{"dev":"next dev","build":"next build","start":"next start"},"dependencies":{"next":"^14.2.15","react":"^18.3.1","react-dom":"^18.3.1"},"devDependencies":{"typescript":"^5.6.3","@types/node":"^22.7.5","@types/react":"^18.3.11","@types/react-dom":"^18.3.0"}}\n` },
      { path: "app/layout.tsx", purpose: "Next.js App Router layout", content: `export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }\n` },
      { path: "app/page.tsx", purpose: "Next.js homepage", content: `export default function Home() { return <main><h1>SynapseX Next.js website</h1><p>${requestComment.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p></main>; }\n` },
      { path: "app/globals.css", purpose: "Base responsive website styles", content: `:root{font-family:system-ui,sans-serif;background:#07111f;color:#eaf5ff}body{margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:720px;padding:48px}h1{font-size:clamp(2rem,7vw,5rem)}\n` },
      { path: "README.md", purpose: "Next.js local setup and verification guide", content: `# Next.js website\n\nRun npm install, then npm run dev -- --port 3012. Open http://127.0.0.1:3012 and run npm run build before deployment.\n` },
    ],
    commands: ["node --version", "npm install", "npm run dev -- --port 3012"],
    verification: ["Open http://127.0.0.1:3012 and confirm the requested website renders.", "Run npm run build before deploying anywhere.", "Stop the local server with Ctrl+C when finished."],
  };
  if (profile === "windows-native-command") {
    const app = requestedNativeWindowsApp(request);
    if (!app) return { files: [], commands: [], verification: [] };
    return {
      files: [],
      commands: [`Start-Process -FilePath '${app.executable}'`],
      verification: [app.verification, "If no window appears, paste the complete PowerShell output into SynapseX before retrying."],
    };
  }
  if (profile === "website") return {
    files: [
      { path: "index.html", purpose: "Accessible static website entry page", content: `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SynapseX starter website</title><link rel="stylesheet" href="styles.css"></head><body><main class="shell"><p class="eyebrow">SYNAPSEX STARTER</p><h1>Build your idea with clarity.</h1><p id="request">${requestComment}</p><button id="action" type="button">Start here</button></main><script src="app.js"></script></body></html>` },
      { path: "styles.css", purpose: "Responsive starter styling", content: `:root{font-family:Inter,system-ui,sans-serif;color:#eaf5ff;background:#07111f}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center}.shell{width:min(720px,calc(100% - 40px));padding:56px;border:1px solid #1e3a5f;border-radius:24px;background:linear-gradient(145deg,#0b1b32,#07111f)}.eyebrow{color:#53d7ff;font-size:.78rem;letter-spacing:.14em}h1{font-size:clamp(2.2rem,6vw,4.7rem);line-height:.98;margin:.4rem 0 1.3rem}button{padding:.85rem 1.1rem;border:0;border-radius:.65rem;background:#53d7ff;color:#03111f;font-weight:700;cursor:pointer}` },
      { path: "app.js", purpose: "Safe browser interaction starter", content: `document.querySelector('#action')?.addEventListener('click', () => { document.querySelector('#action').textContent = 'Starter verified'; });` },
    ],
    commands: ["python --version", "python -m http.server 8080", "# Open http://localhost:8080 in your browser"],
    verification: ["Open http://localhost:8080", "Click Start here and confirm it changes to Starter verified", "Stop the local server with Ctrl+C when finished"],
  };
  if (profile === "fastapi") return {
    files: [
      { path: "requirements.txt", purpose: "Pinned starter dependencies", content: "fastapi==0.115.0\nuvicorn[standard]==0.30.6\n" },
      { path: "app/main.py", purpose: "FastAPI application entry point", content: `from fastapi import FastAPI\n\napp = FastAPI(title="SynapseX Starter API")\n\n@app.get("/health")\ndef health() -> dict[str, str]:\n    return {"status": "ok"}\n\n@app.get("/")\ndef root() -> dict[str, str]:\n    return {"message": "SynapseX FastAPI starter is running", "request": "${requestComment.replace(/"/g, "'")}"}\n` },
    ],
    commands: ["python -m venv .venv", "# Activate .venv (Windows: .\\.venv\\Scripts\\Activate.ps1; Linux/macOS: source .venv/bin/activate)", "python -m pip install -r requirements.txt", `python -m uvicorn app.main:app --reload --port ${requestedPort(request, 8000)}`],
    verification: [`Open http://127.0.0.1:${requestedPort(request, 8000)}/health`, "Confirm the response contains status: ok", `Open http://127.0.0.1:${requestedPort(request, 8000)}/docs to inspect local API documentation`],
  };
  if (profile === "node") return {
    files: [
      { path: "package.json", purpose: "Node.js service package manifest", content: `{"name":"synapsex-node-starter","private":true,"type":"module","scripts":{"start":"node src/server.mjs"}}\n` },
      { path: "src/server.mjs", purpose: "Dependency-free Node.js local service", content: `import { createServer } from 'node:http';\n\nconst port = Number(process.env.PORT ?? 3000);\nconst requestSummary = ${JSON.stringify(requestComment)};\nconst server = createServer((request, response) => {\n  if (request.url === '/health') {\n    response.writeHead(200, { 'content-type': 'application/json' });\n    response.end(JSON.stringify({ status: 'ok' }));\n    return;\n  }\n  response.writeHead(200, { 'content-type': 'application/json' });\n  response.end(JSON.stringify({ message: 'SynapseX Node starter is running', request: requestSummary }));\n});\nserver.listen(port, () => console.log(\`SynapseX starter listening on http://127.0.0.1:\${port}\`));\n` },
    ],
    commands: ["node --version", "npm install", "npm start"],
    verification: ["Open http://127.0.0.1:3000/health", "Confirm the response contains status: ok", "Stop the local service with Ctrl+C when finished"],
  };
  if (profile === "react") return {
    files: [
      { path: "package.json", purpose: "React and Vite package manifest", content: `{"name":"synapsex-react-starter","private":true,"version":"0.0.1","type":"module","scripts":{"dev":"vite","build":"vite build","preview":"vite preview"},"dependencies":{"@vitejs/plugin-react":"latest","vite":"latest","react":"latest","react-dom":"latest"},"devDependencies":{}}\n` },
      { path: "index.html", purpose: "React application HTML entry point", content: `<div id="root"></div><script type="module" src="/src/main.jsx"></script>\n` },
      { path: "src/main.jsx", purpose: "React application entry point", content: `import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport './styles.css';\n\nfunction App() {\n  return <main><p>SynapseX React starter</p><h1>Build from a verified foundation.</h1><p>${requestComment.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p></main>;\n}\n\ncreateRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);\n` },
      { path: "src/styles.css", purpose: "Responsive starter styling", content: `:root{font-family:Inter,system-ui,sans-serif;color:#eaf5ff;background:#07111f}body{margin:0;min-height:100vh;display:grid;place-items:center}main{width:min(720px,calc(100% - 40px));padding:56px;border:1px solid #1e3a5f;border-radius:24px;background:#0b1b32}p:first-child{color:#53d7ff;letter-spacing:.14em;font-size:.78rem}h1{font-size:clamp(2.2rem,6vw,4.7rem);line-height:.98}` },
    ],
    commands: ["node --version", "npm install", "npm run dev", "# Open the localhost URL printed by Vite"],
    verification: ["Open the local Vite URL printed in the terminal", "Confirm the SynapseX React starter heading appears", "Run npm run build before deploying anywhere"],
  };
  if (profile === "local-database") return {
    files: [
      { path: "app.py", purpose: "Dependency-free Python and SQLite local database starter", content: `from pathlib import Path\nimport sqlite3\n\nDB_PATH = Path('data/app.db')\nDB_PATH.parent.mkdir(parents=True, exist_ok=True)\n\nwith sqlite3.connect(DB_PATH) as connection:\n    connection.execute('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)')\n    connection.execute('INSERT INTO notes (body) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM notes)', (${JSON.stringify(requestComment)},))\n    rows = connection.execute('SELECT id, body FROM notes ORDER BY id').fetchall()\n\nprint({'database': str(DB_PATH), 'notes': rows})\n` },
      { path: "README.md", purpose: "Local data ownership and rollback notes", content: `# Local SQLite starter\n\nThis starter stores data only in \`data/app.db\` beside the project. Back up that file before schema or data changes. To reset the demo database, stop the app and delete \`data/app.db\`.\n\nRequest: ${requestComment}\n` },
    ],
    commands: ["python --version", "python app.py"],
    verification: ["Confirm data/app.db was created locally", "Run python app.py a second time and confirm the note is not duplicated", "Back up data/app.db before adding any destructive data change"],
  };
  if (profile === "self-improvement") return {
    files: [
      { path: "scripts/Inspect-SynapseXWorkspace.ps1", purpose: "Read-only SynapseX workspace inspection and validation script", content: [
        "param([Parameter(Mandatory = $true)][string]$WorkspacePath)",
        "$ErrorActionPreference = 'Stop'",
        "$workspace = (Resolve-Path -LiteralPath $WorkspacePath).Path",
        "$packagePath = Join-Path $workspace 'package.json'",
        "if (-not (Test-Path -LiteralPath $packagePath)) { throw \"package.json was not found. Confirm the authorized SynapseX root: $workspace\" }",
        "Set-Location -LiteralPath $workspace",
        "Write-Host \"Inspecting authorized SynapseX workspace: $workspace\"",
        "Write-Host '--- Git status (read-only) ---'",
        "git status --short",
        "Write-Host '--- Project scripts ---'",
        "(Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json).scripts | Format-List",
        "Write-Host '--- Source inventory (read-only) ---'",
        "Get-ChildItem -LiteralPath $workspace -Recurse -File -Include *.ts,*.tsx,*.css,*.md | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\.git\\' } | Select-Object -First 200 FullName, Length",
        "Write-Host '--- Validation ---'",
        "pnpm test",
        "pnpm check",
        "pnpm build",
        "Write-Host 'Inspection complete. Review output before creating or applying a change proposal.'",
      ].join("\n") },
      { path: "docs/SELF-IMPROVEMENT-WORKFLOW.md", purpose: "Reviewed self-improvement workflow", content: `# SynapseX self-improvement workflow\n\n## Request\n${requestComment}\n\n1. Run \`scripts/Inspect-SynapseXWorkspace.ps1\` against the exact local SynapseX root you own or are authorized to change.\n2. Copy the relevant validation output and the defect or goal into SynapseX.\n3. Ask for a reviewed change proposal with affected files, complete replacement or patch content, tests, expected output, and rollback steps.\n4. Review the proposal and create a backup or Git commit before applying anything.\n5. Apply files manually or through an explicitly authorized local workflow, then run the stated tests again.\n\nThis package deliberately does not edit SynapseX automatically. A diagnosis, proposal, applied local change, and verified build are separate states.\n` },
    ],
    commands: ["$workspace = 'C:\\Path\\To\\Authorized\\SynapseX-software' # Replace only after confirming the exact project root", "powershell -ExecutionPolicy Bypass -File .\\scripts\\Inspect-SynapseXWorkspace.ps1 -WorkspacePath $workspace"],
    verification: ["Confirm git status lists only expected local changes", "Confirm pnpm test, pnpm check, and pnpm build output before proposing edits", "Review every generated patch and create a backup or Git commit before applying it", "Re-run validation after an authorized manual change"],
  };
  if (profile === "systems-design") return {
    files: [
      { path: "docs/SOLUTION-DESIGN.md", purpose: "Authorized system design and implementation boundary", content: `# Solution design\n\n## Request\n${requestComment}\n\n## Design workflow\n\n1. Define the user outcome, operating environment, and authorized owner.\n2. Identify interfaces: user experience, software services, device or hardware boundaries, telemetry, and external integrations.\n3. Separate simulation/prototype work from any real-world or production control.\n4. Specify threat model, access control, audit trail, backup/recovery, and failure-safe behavior before implementation.\n5. Deliver each implementation module with its own tests, local verification, rollback, and deployment review.\n\n## Implementation boundary\n\nThis starter is an engineering design package. It does not claim to manufacture hardware, operate a vehicle, control a device, access an external system, or deploy production infrastructure. Those steps require an authorized target, vendor documentation, hardware validation, and safety review.\n` },
      { path: "docs/SAFETY-VALIDATION.md", purpose: "Safety and validation gate for system and automation work", content: `# Safety and validation gate\n\n- Confirm owner authorization and intended operating environment.\n- Keep initial work in a local simulator, test bench, or non-production environment.\n- Define an emergency stop, manual override, logging, and rollback plan before connecting real devices or physical systems.\n- Never bypass manufacturer controls, safety controls, or access controls.\n- Verify each interface independently before end-to-end integration.\n\nRequest: ${requestComment}\n` },
    ],
    commands: ["# Review docs/SOLUTION-DESIGN.md before creating any production, hardware, or device-control code.", "# Start implementation with a simulator or test bench; do not connect an unreviewed package to a real physical system."],
    verification: ["Confirm the authorized owner, operating environment, and safety boundary", "Review the threat model, rollback plan, manual override, and audit trail", "Validate a simulator or test-bench prototype before any real-system connection", "Obtain the appropriate engineering and safety review before production use"],
  };
  if (profile === "security-baseline") return {
    files: [
      { path: "scripts/Get-AuthorizedSecurityBaseline.ps1", purpose: "Read-only Windows defensive baseline report", content: `$ErrorActionPreference = 'Stop'\n# Read-only baseline for an authorized Windows device. This script changes no settings.\n$report = [ordered]@{\n  ComputerName = $env:COMPUTERNAME\n  Timestamp = (Get-Date).ToString('o')\n  FirewallProfiles = Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction\n  DefenderStatus = if (Get-Command Get-MpComputerStatus -ErrorAction SilentlyContinue) { Get-MpComputerStatus | Select-Object AMServiceEnabled, AntivirusEnabled, RealTimeProtectionEnabled, AntivirusSignatureLastUpdated } else { 'Microsoft Defender cmdlets unavailable' }\n  BitLocker = if (Get-Command Get-BitLockerVolume -ErrorAction SilentlyContinue) { Get-BitLockerVolume | Select-Object MountPoint, VolumeStatus, ProtectionStatus } else { 'BitLocker cmdlets unavailable' }\n}\n$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath .\\security-baseline-report.json -Encoding utf8\nWrite-Host 'Read-only report saved to security-baseline-report.json'` },
      { path: "docs/REVIEW-BEFORE-CHANGES.md", purpose: "Manual hardening review checklist", content: `# Review before any security change\n\nRequest: ${requestComment}\n\nThis starter only collects a local read-only baseline. Do not disable security products, alter firewall policy, encrypt a removable drive, or change device settings until the exact owned/authorized target, backup/recovery plan, and rollback procedure have been reviewed.` },
    ],
    commands: ["powershell -ExecutionPolicy Bypass -File .\\scripts\\Get-AuthorizedSecurityBaseline.ps1", "Get-Content .\\security-baseline-report.json"],
    verification: ["Confirm security-baseline-report.json was created", "Review the report for missing or disabled protections", "Do not apply changes until a separate owner-confirmed package is reviewed"],
  };
  if (profile === "security-protection-layer") return {
    files: [
      { path: "scripts/Get-AuthorizedSecurityBaseline.ps1", purpose: "Read-only baseline report before any reviewed protection change", content: `$ErrorActionPreference = 'Stop'
# This script changes no settings. Run it before reviewing -Apply.
$report = [ordered]@{
  ComputerName = $env:COMPUTERNAME
  Timestamp = (Get-Date).ToString('o')
  FirewallProfiles = if (Get-Command Get-NetFirewallProfile -ErrorAction SilentlyContinue) { Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction } else { 'Firewall cmdlets unavailable' }
  DefenderStatus = if (Get-Command Get-MpComputerStatus -ErrorAction SilentlyContinue) { Get-MpComputerStatus | Select-Object AMServiceEnabled, AntivirusEnabled, RealTimeProtectionEnabled, AntivirusSignatureLastUpdated } else { 'Microsoft Defender cmdlets unavailable' }
}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath .\\security-baseline-report.json -Encoding utf8
Write-Host 'Read-only report saved to security-baseline-report.json'` },
      { path: "config/protection-layer.json", purpose: "Declared defensive controls for the authorized Windows device", content: `{
  "version": 1,
  "scope": "authorized-local-windows-device",
  "controls": { "firewallProfilesEnabled": true, "defenderRealTimeProtectionEnabledWhenAvailable": true },
  "nonGoals": ["No credential access", "No remote access", "No security bypass", "No removable-media policy change", "No scheduled persistence"]
}
` },
      { path: "scripts/Install-AuthorizedProtectionLayer.ps1", purpose: "Executable elevated defensive-control implementation", content: `# Run only on a Windows device you own or are authorized to administer.
[CmdletBinding(SupportsShouldProcess = $true)]
param([switch]$Apply, [switch]$SkipDefender)

$ErrorActionPreference = 'Stop'
function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Get-ProtectionState {
  $firewall = if (Get-Command Get-NetFirewallProfile -ErrorAction SilentlyContinue) { Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction } else { @('Firewall cmdlets unavailable') }
  $defenderService = Get-Service -Name WinDefend -ErrorAction SilentlyContinue
  $defender = if ($null -eq $defenderService -or $defenderService.Status -ne 'Running') { 'Microsoft Defender service is unavailable or not running; it may be managed by another endpoint-security product.' } elseif (Get-Command Get-MpComputerStatus -ErrorAction SilentlyContinue) { Get-MpComputerStatus | Select-Object AMServiceEnabled, AntivirusEnabled, RealTimeProtectionEnabled, AntivirusSignatureLastUpdated } else { 'Microsoft Defender cmdlets unavailable' }
  [ordered]@{ ComputerName = $env:COMPUTERNAME; Timestamp = (Get-Date).ToString('o'); FirewallProfiles = $firewall; DefenderServiceStatus = if ($null -eq $defenderService) { 'Unavailable' } else { "$($defenderService.Status)" }; DefenderStatus = $defender }
}

if (-not $Apply) {
  Get-ProtectionState | ConvertTo-Json -Depth 6
  Write-Host 'Preview only. Re-run in elevated PowerShell with -Apply to enable the declared defensive controls.'
  exit 0
}
if (-not (Test-Administrator)) { throw 'Administrator PowerShell is required for -Apply. Open PowerShell as Administrator and retry.' }

$before = Get-ProtectionState
$warnings = [System.Collections.Generic.List[string]]::new()
if (Get-Command Get-NetFirewallProfile -ErrorAction SilentlyContinue) {
  Get-NetFirewallProfile | Where-Object { -not $_.Enabled } | ForEach-Object {
    if ($PSCmdlet.ShouldProcess("Firewall profile $($_.Name)", 'Enable')) { Set-NetFirewallProfile -Name $_.Name -Enabled True }
  }
} else { $warnings.Add('Firewall cmdlets were unavailable; no firewall profile was changed.') }

if (-not $SkipDefender) {
  $defenderService = Get-Service -Name WinDefend -ErrorAction SilentlyContinue
  if ($null -eq $defenderService -or $defenderService.Status -ne 'Running') {
    $warnings.Add('Microsoft Defender service is unavailable or not running; no Defender preference was changed. Review the installed endpoint-security product instead.')
  } elseif (Get-Command Set-MpPreference -ErrorAction SilentlyContinue) {
    try { if ($PSCmdlet.ShouldProcess('Microsoft Defender real-time protection', 'Enable')) { Set-MpPreference -DisableRealtimeMonitoring $false } }
    catch { $warnings.Add("Microsoft Defender was not changed: $($_.Exception.Message)") }
  } else { $warnings.Add('Microsoft Defender preference cmdlets were unavailable; no Defender setting was changed.') }
}

$after = Get-ProtectionState
$statePath = Join-Path (Get-Location) ("protection-layer-state-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
[ordered]@{ Version = 1; AppliedAt = (Get-Date).ToString('o'); Before = $before; After = $after; Warnings = $warnings; Request = ${JSON.stringify(requestComment)} } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statePath -Encoding utf8
Write-Host "Protection layer implementation complete. State record: $statePath"
Write-Host 'Run scripts\\Verify-AuthorizedProtectionLayer.ps1 next. This package never disables Firewall or Defender.'
` },
      { path: "scripts/Verify-AuthorizedProtectionLayer.ps1", purpose: "Read-only verification of implemented controls", content: `$ErrorActionPreference = 'Stop'
$firewall = if (Get-Command Get-NetFirewallProfile -ErrorAction SilentlyContinue) { Get-NetFirewallProfile | Select-Object Name, Enabled } else { @('Firewall cmdlets unavailable') }
$defenderService = Get-Service -Name WinDefend -ErrorAction SilentlyContinue
$defender = if ($null -eq $defenderService -or $defenderService.Status -ne 'Running') { 'Microsoft Defender service is unavailable or not running; it may be managed by another endpoint-security product.' } elseif (Get-Command Get-MpComputerStatus -ErrorAction SilentlyContinue) { Get-MpComputerStatus | Select-Object AMServiceEnabled, AntivirusEnabled, RealTimeProtectionEnabled, AntivirusSignatureLastUpdated } else { 'Microsoft Defender cmdlets unavailable' }
$result = [ordered]@{ VerifiedAt = (Get-Date).ToString('o'); FirewallProfiles = $firewall; DefenderServiceStatus = if ($null -eq $defenderService) { 'Unavailable' } else { "$($defenderService.Status)" }; DefenderStatus = $defender }
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath .\\protection-layer-verification.json -Encoding utf8
$result | ConvertTo-Json -Depth 6
` },
      { path: "scripts/Remove-ProtectionLayerLocalArtifacts.ps1", purpose: "Safe cleanup of local report files only", content: `param([switch]$ConfirmRemove)
if (-not $ConfirmRemove) { throw 'This only removes local reports. Re-run with -ConfirmRemove after reviewing them.' }
Get-ChildItem -LiteralPath . -Filter 'protection-layer-*.json' -File | Remove-Item -Force
Write-Host 'Local reports removed. Firewall and Defender protections were intentionally left enabled.'
` },
      { path: "docs/IMPLEMENTATION-NOTES.md", purpose: "Implementation and bounded cleanup notes", content: `# Authorized Windows protection layer

## Implemented controls

- Enables any disabled Windows Firewall profile.
- Requests Microsoft Defender real-time protection to be enabled when the installed Defender cmdlets support it.
- Saves a timestamped before/after state record in the local package folder.

## Cleanup boundary

The cleanup script removes only local report files. It deliberately does **not** disable Firewall or Microsoft Defender because weakening protections is not a safe automatic rollback action.

## Scope exclusions

This package does not collect credentials, create remote access, bypass controls, disable security software, encrypt drives, alter removable-media policy, create persistence, or manage third-party endpoint products.

Request: ${requestComment}
` },
    ],
    commands: ["# First run the read-only baseline from the generated package:", "powershell -ExecutionPolicy Bypass -File .\\scripts\\Get-AuthorizedSecurityBaseline.ps1", "Get-Content .\\security-baseline-report.json", "# Review the report and installer. Only then choose an elevated PowerShell window and explicitly run -Apply:", "Unblock-File -LiteralPath .\\scripts\\Install-AuthorizedProtectionLayer.ps1", "& .\\scripts\\Install-AuthorizedProtectionLayer.ps1 -Apply", "& .\\scripts\\Verify-AuthorizedProtectionLayer.ps1"],
    verification: ["Confirm security-baseline-report.json was created before any -Apply decision", "Confirm a timestamped protection-layer-state-*.json record was created only after an explicit reviewed -Apply", "Confirm available Firewall profiles report Enabled: true", "Confirm protection-layer-verification.json was created", "If Microsoft Defender cmdlets are available, confirm RealTimeProtectionEnabled is true or review the explicit warning", "Use cleanup only to remove local reports; it never weakens security controls"],
  };
  if (profile === "windows-signin-protection") return {
    files: [
      { path: "config/signin-protection.json", purpose: "Declared wake and sign-in protection settings", content: `{"version":1,"scope":"authorized-local-windows-device","requirements":{"requireSignInAfterWakeOnAC":true,"requireSignInAfterWakeOnBattery":true,"disableAutomaticSignIn":true,"accountPasswordHandledInteractively":true},"nonGoals":["No password is stored","No password is logged","No credential is sent anywhere"]}\n` },
      { path: "scripts/Install-RequireSignInAfterWake.ps1", purpose: "Executable wake sign-in and automatic-sign-in protection", content: `# Run only on a Windows device you own or are authorized to administer.
[CmdletBinding(SupportsShouldProcess = $true)]
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
function Test-Administrator { $identity = [Security.Principal.WindowsIdentity]::GetCurrent(); ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
function Get-ConsoleLockValues {
  $text = (& powercfg /QUERY SCHEME_CURRENT SUB_NONE CONSOLELOCK 2>&1 | Out-String)
  $ac = [regex]::Match($text, 'Current AC Power Setting Index:\\s*0x([0-9a-fA-F]+)').Groups[1].Value
  $dc = [regex]::Match($text, 'Current DC Power Setting Index:\\s*0x([0-9a-fA-F]+)').Groups[1].Value
  [ordered]@{ AC = if ($ac) { [Convert]::ToInt32($ac,16) } else { $null }; DC = if ($dc) { [Convert]::ToInt32($dc,16) } else { $null }; Raw = $text }
}
function Get-AutoLogonState { $path = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'; $value = (Get-ItemProperty -Path $path -Name AutoAdminLogon -ErrorAction SilentlyContinue).AutoAdminLogon; [ordered]@{ Configured = $value; AutomaticSignInEnabled = ($value -eq '1') } }
$before = [ordered]@{ ConsoleLock = Get-ConsoleLockValues; AutoLogon = Get-AutoLogonState }
if (-not $Apply) { $before | ConvertTo-Json -Depth 6; Write-Host 'Preview only. Re-run in elevated PowerShell with -Apply to require sign-in after wake and disable automatic sign-in.'; exit 0 }
if (-not (Test-Administrator)) { throw 'Administrator PowerShell is required for -Apply. Open PowerShell as Administrator and retry.' }
if ($PSCmdlet.ShouldProcess('Current power scheme', 'Require sign-in after wake on AC and battery')) { & powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_NONE CONSOLELOCK 1; & powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_NONE CONSOLELOCK 1; & powercfg /SETACTIVE SCHEME_CURRENT }
$winlogonPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
if ($PSCmdlet.ShouldProcess('Windows automatic sign-in', 'Disable')) { Set-ItemProperty -Path $winlogonPath -Name AutoAdminLogon -Value '0' -Type String }
$after = [ordered]@{ ConsoleLock = Get-ConsoleLockValues; AutoLogon = Get-AutoLogonState }
$statePath = Join-Path (Get-Location) ('signin-protection-state-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
[ordered]@{ Version = 1; AppliedAt = (Get-Date).ToString('o'); Before = $before; After = $after; Request = ${JSON.stringify(requestComment)} } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statePath -Encoding utf8
Write-Host "Sign-in protection implementation complete. State record: $statePath"
Write-Host 'If this is a local Windows account without a password, run scripts\\Set-LocalAccountPassword.ps1 interactively. Password text is never stored or displayed.'
` },
      { path: "scripts/Set-LocalAccountPassword.ps1", purpose: "Interactive local account password setup without storage or logging", content: `param([string]$UserName = $env:USERNAME)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command Set-LocalUser -ErrorAction SilentlyContinue)) { throw 'Set-LocalUser is unavailable. For a Microsoft or work account, set the password through Windows Settings > Accounts > Sign-in options.' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent(); $principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this script in Administrator PowerShell.' }
$account = Get-LocalUser -Name $UserName -ErrorAction Stop
$password = Read-Host "Create or replace the password for local account $($account.Name)" -AsSecureString
Set-LocalUser -Name $account.Name -Password $password
Write-Host 'Local account password updated. The password was not printed, saved, or sent anywhere.'
` },
      { path: "scripts/Verify-RequireSignInAfterWake.ps1", purpose: "Read-only wake sign-in and automatic-sign-in verification", content: `$ErrorActionPreference = 'Stop'
$power = (& powercfg /QUERY SCHEME_CURRENT SUB_NONE CONSOLELOCK 2>&1 | Out-String)
$winlogonPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
$autoLogon = (Get-ItemProperty -Path $winlogonPath -Name AutoAdminLogon -ErrorAction SilentlyContinue).AutoAdminLogon
$localAccount = Get-LocalUser -Name $env:USERNAME -ErrorAction SilentlyContinue
$result = [ordered]@{ VerifiedAt = (Get-Date).ToString('o'); ConsoleLockPowerSetting = $power; AutoAdminLogon = $autoLogon; AccountType = if ($localAccount) { 'Local Windows account' } else { 'Microsoft/work account or unknown' }; Note = 'If no password is configured, use Set-LocalAccountPassword.ps1 for a local account or Windows Settings > Accounts > Sign-in options for a Microsoft/work account.' }
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath .\\signin-protection-verification.json -Encoding utf8
$result | ConvertTo-Json -Depth 6
` },
      { path: "scripts/Restore-PreviousWakeRequirement.ps1", purpose: "Explicit rollback of prior wake requirement only", content: `param([Parameter(Mandatory = $true)][string]$StatePath, [switch]$ConfirmReduceWakeProtection)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmReduceWakeProtection) { throw 'This can reduce sign-in protection after wake. Re-run only with -ConfirmReduceWakeProtection after reviewing the saved state.' }
$state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
if ($null -eq $state.Before.ConsoleLock.AC -or $null -eq $state.Before.ConsoleLock.DC) { throw 'Prior wake values were unavailable; no change was made.' }
& powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_NONE CONSOLELOCK $state.Before.ConsoleLock.AC
& powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_NONE CONSOLELOCK $state.Before.ConsoleLock.DC
& powercfg /SETACTIVE SCHEME_CURRENT
Write-Host 'Previous wake requirement restored. Automatic sign-in was intentionally not re-enabled.'
` },
      { path: "docs/IMPLEMENTATION-NOTES.md", purpose: "Sign-in protection scope and recovery notes", content: `# Authorized Windows sign-in protection

- Requires sign-in after wake for the active power scheme on AC and battery.
- Disables configured automatic Windows sign-in.
- Never stores, prints, transmits, or reads a password.
- Provides an interactive local-account password script; Microsoft/work accounts use Windows **Settings > Accounts > Sign-in options**.
- The rollback script restores only the previous wake setting after explicit confirmation. It never re-enables automatic sign-in or removes an account password.

Request: ${requestComment}
` },
    ],
    commands: ["# From the extracted generated package in an elevated PowerShell window:", "Unblock-File -LiteralPath .\\scripts\\Install-RequireSignInAfterWake.ps1", "& .\\scripts\\Install-RequireSignInAfterWake.ps1 -Apply", "& .\\scripts\\Verify-RequireSignInAfterWake.ps1", "# Only if you use a local account without a password: & .\\scripts\\Set-LocalAccountPassword.ps1"],
    verification: ["Confirm signin-protection-state-*.json was created", "Confirm verification output shows AutoAdminLogon as 0 or absent", "Confirm the ConsoleLock power output shows the active wake setting", "Test by locking the laptop, then sleeping and waking it; Windows must show the sign-in screen"],
  };
  if (profile === "windows-local-password-removal") return {
    files: [
      { path: "scripts/Preview-RemoveLocalAccountPassword.ps1", purpose: "Read-only local-account eligibility preview", content: `param([string]$UserName = $env:USERNAME)
$ErrorActionPreference = 'Stop'
$account = Get-LocalUser -Name $UserName -ErrorAction SilentlyContinue
if (-not $account) { throw "'$UserName' is not a local Windows account. Do not use this package for Microsoft or work accounts; manage those through Windows Settings or the organization." }
[pscustomobject]@{ UserName = $account.Name; Enabled = $account.Enabled; PrincipalSource = $account.PrincipalSource; Action = 'No password change made. Review before deciding whether to continue.' } | Format-List
` },
      { path: "scripts/Remove-LocalAccountPassword.ps1", purpose: "Explicit-confirmation local-account password removal", content: `[CmdletBinding(SupportsShouldProcess = $true)]
param([string]$UserName = $env:USERNAME, [switch]$Apply)
$ErrorActionPreference = 'Stop'
$account = Get-LocalUser -Name $UserName -ErrorAction SilentlyContinue
if (-not $account) { throw "'$UserName' is not a local Windows account. No change was made." }
if (-not $Apply) { Write-Host "PREVIEW ONLY: no password was removed for $UserName." -ForegroundColor Yellow; Write-Host "If you still intend to reduce protection, re-run with -Apply and complete both typed confirmations."; return }
$intent = Read-Host "Type REMOVE LOCAL PASSWORD to confirm removal for local account $UserName"
if ($intent -cne 'REMOVE LOCAL PASSWORD') { throw 'Confirmation text did not match. No change was made.' }
$identity = Read-Host "Type the local account name exactly: $UserName"
if ($identity -cne $UserName) { throw 'Account name did not match. No change was made.' }
if ($PSCmdlet.ShouldProcess($UserName, 'Remove local Windows account password')) {
  & net.exe user $UserName ""
  if ($LASTEXITCODE -ne 0) { throw "Windows did not permit local password removal (exit code $LASTEXITCODE). No completion was reported; check local security policy before retrying." }
  [pscustomobject]@{ ChangedAt = (Get-Date).ToString('o'); UserName = $UserName; PasswordRemovalRequested = $true; PasswordValueStored = $false } | ConvertTo-Json | Set-Content -LiteralPath .\\local-password-removal-state.json -Encoding utf8
  Write-Host 'Local account password removal was requested. No password value was printed, saved, or transmitted.' -ForegroundColor Yellow
}
` },
      { path: "scripts/Verify-LocalAccountPasswordRemoval.ps1", purpose: "Read-only local-account state verification", content: `param([string]$UserName = $env:USERNAME)
$ErrorActionPreference = 'Stop'
$account = Get-LocalUser -Name $UserName -ErrorAction SilentlyContinue
if (-not $account) { throw "'$UserName' is not a local Windows account. No password status can be verified by this package." }
[pscustomobject]@{ VerifiedAt = (Get-Date).ToString('o'); UserName = $account.Name; Enabled = $account.Enabled; PrincipalSource = $account.PrincipalSource; Note = 'Windows does not expose password contents to verify blankness. Sign out or restart and test the local account manually.' } | ConvertTo-Json -Depth 4 | Tee-Object -FilePath .\\local-password-removal-verification.json
` },
      { path: "scripts/Restore-LocalAccountPassword.ps1", purpose: "Interactive rollback by setting a new local account password", content: `param([string]$UserName = $env:USERNAME)
$ErrorActionPreference = 'Stop'
$account = Get-LocalUser -Name $UserName -ErrorAction SilentlyContinue
if (-not $account) { throw "'$UserName' is not a local Windows account. No change was made." }
$password = Read-Host "Enter a new password for local account $UserName" -AsSecureString
Set-LocalUser -Name $UserName -Password $password
Write-Host 'A new local account password was set. The password was not printed, saved, or transmitted.' -ForegroundColor Green
` },
      { path: "docs/LOCAL-PASSWORD-REMOVAL-NOTES.md", purpose: "Scope, physical test, and interactive rollback notes", content: `# Local Windows account password removal

This package is only for a Windows **local account** you own. It does not support Microsoft accounts, work accounts, domain accounts, bypassing another user's sign-in, password recovery, or password discovery.

1. Run the preview script first.
2. The apply script requires both the exact removal phrase and the exact local account name.
3. The package never reads, prints, saves, logs, or transmits an existing password.
4. Windows does not reveal password contents for a script to verify. Sign out or restart and manually test the affected local account.
5. To restore protection, run Restore-LocalAccountPassword.ps1; it asks for a new password in a secure hidden prompt.

Request: ${requestComment}
` },
    ],
    commands: ["# From the newly extracted package in an elevated PowerShell window:", "& .\\scripts\\Preview-RemoveLocalAccountPassword.ps1", "# Only after the preview is correct and you still want to reduce protection: & .\\scripts\\Remove-LocalAccountPassword.ps1 -Apply", "& .\\scripts\\Verify-LocalAccountPasswordRemoval.ps1", "# To restore a password later: & .\\scripts\\Restore-LocalAccountPassword.ps1"],
    verification: ["Confirm the preview identifies the intended local account", "During apply, confirm you typed both required confirmations yourself", "Confirm local-password-removal-state.json records no password value", "Sign out or restart and test only the intended local account manually", "Restore a password through Restore-LocalAccountPassword.ps1 if you decide to re-enable sign-in protection"],
  };
  if (profile === "powershell-backup") {
    const { sourcePath, backupPath } = windowsBackupPaths(request);
    const psLiteral = (path: string) => `'${path.replace(/'/g, "''")}'`;
    return {
      files: [
        { path: "scripts/New-DatedProjectBackup.ps1", purpose: "Safe dated ZIP backup script with source preservation", content: `param(
  [Parameter(Mandatory = $true)][string]$SourcePath,
  [Parameter(Mandatory = $true)][string]$BackupPath
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $SourcePath -ErrorAction Stop).Path
if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw "Source folder does not exist: $SourcePath" }

if (Test-Path -LiteralPath $BackupPath) {
  if (-not (Test-Path -LiteralPath $BackupPath -PathType Container)) { throw "Backup path exists but is not a folder: $BackupPath" }
} else {
  New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null
}

$backup = (Resolve-Path -LiteralPath $BackupPath).Path
$items = @(Get-ChildItem -LiteralPath $source -Force)
if ($items.Count -eq 0) { throw "Source folder is empty; no archive was created: $source" }

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archivePath = Join-Path $backup ("project-backup-$timestamp.zip")
if (Test-Path -LiteralPath $archivePath) { throw "Archive already exists; nothing was overwritten: $archivePath" }

Compress-Archive -LiteralPath $items.FullName -DestinationPath $archivePath -CompressionLevel Optimal -ErrorAction Stop
if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) { throw "Backup archive was not created: $archivePath" }

$archive = Get-Item -LiteralPath $archivePath
[pscustomobject]@{
  SourcePath = $source
  ArchivePath = $archive.FullName
  SizeBytes = $archive.Length
  CreatedAt = $archive.CreationTime
} | Format-List

# This script never deletes or alters source files, overwrites an existing archive,
# creates a scheduled task, changes registry settings, or changes administrator settings.
` },
        { path: "docs/BACKUP-ROLLBACK.md", purpose: "Manual rollback guidance for the newly created archive only", content: `# Backup rollback

The generated script preserves the source folder. It creates one new timestamped ZIP archive and refuses to overwrite an existing archive.

If you decide to undo the result, first copy the displayed ArchivePath from the script output, confirm it is the new ZIP you intend to remove, then delete that single archive manually in File Explorer. Do not delete the source folder. No registry, scheduled task, service, policy, or administrator setting is changed by this package.

Request: ${requestComment}
` },
      ],
      commands: [
        "# Save the generated files with the shown folder structure before running this command.",
        `$sourcePath = ${psLiteral(sourcePath)}`,
        `$backupPath = ${psLiteral(backupPath)}`,
        "powershell -ExecutionPolicy Bypass -File .\\scripts\\New-DatedProjectBackup.ps1 -SourcePath $sourcePath -BackupPath $backupPath",
      ],
      verification: [
        "Confirm the script output shows the intended SourcePath and a new timestamped ArchivePath",
        "Confirm the source folder still contains its original files",
        "Confirm the new ZIP opens and contains expected project files",
        "Keep the displayed ArchivePath if you later need to remove only that new archive manually",
      ],
    };
  }
  if (profile === "windows-diagnostic") {
    const diagnosis = knownWindowsDiagnostic(request);
    return {
      files: [{ path: "docs/DIAGNOSIS.md", purpose: "Evidence-based interpretation of the pasted Windows error", content: `# ${diagnosis.title}\n\n## Likely cause\n\n${diagnosis.cause}\n\n## Safe next step\n\n${diagnosis.next}\n\n## Pasted evidence\n\n${requestComment}\n\nDo not repeat a high-impact apply command until the requested read-only evidence is available.\n` }],
      commands: ["& .\\scripts\\Collect-SynapseXDiagnostics.ps1", "# Paste synapsex-diagnostics.json and the full error into SynapseX for a corrected next action."],
      verification: ["Confirm synapsex-diagnostics.json was created", "Confirm the current folder and script list match the newly extracted ZIP", "Do not repeat Apply until the report and full error are reviewed"],
    };
  }
  if (profile === "powershell") return {
    files: [{ path: "scripts/Start-AuthorizedTask.ps1", purpose: "Safe PowerShell automation starting point", content: `param([string]$WorkingDirectory = (Get-Location).Path)\n$ErrorActionPreference = 'Stop'\nif (-not (Test-Path -LiteralPath $WorkingDirectory)) { throw "Working directory does not exist: $WorkingDirectory" }\nWrite-Host "SynapseX PowerShell starter running in: $WorkingDirectory"\nWrite-Host "Request: ${requestComment.replace(/"/g, "'")}"\n# Add reviewed task-specific logic below. Do not add destructive or privileged commands without owner confirmation.` }],
    commands: ["powershell -ExecutionPolicy Bypass -File .\\scripts\\Start-AuthorizedTask.ps1"],
    verification: ["Confirm the script prints the intended working directory", "Confirm no unexpected file or system change occurred"],
  };
  return { files: [], commands: [], verification: [] };
}

export function createFreeFirstArtifactPlan(prompt: string, context: UniversalGenerationContext) {
  const target = getUniversalTarget(context.targetId);
  const profile = chooseStarterProfile(prompt, context);
  const risk = profile === "security-baseline" || profile === "security-protection-layer" || profile === "windows-signin-protection" || profile === "windows-local-password-removal" || profile === "systems-design" ? "critical" : classifyCommandRisk(prompt);
  const starter = createStarterArtifacts(profile, prompt);
  const directProject = ["website", "nextjs-website", "nextjs-synapsex-showcase", "fastapi", "node", "react", "local-database", "windows-native-command"].includes(profile);
  const executionTier = getExecutionTier(prompt, context);
  const safePrompt = prompt.replace(/\s+/g, " ").trim().slice(0, 1600);
  const targetFile = target.id === "windows-powershell" ? "scripts/preflight.ps1" : target.id === "linux-bash" || target.id === "macos-zsh" ? "scripts/preflight.sh" : "scripts/preflight.md";
  const preflight = target.id === "windows-powershell"
    ? "$PSVersionTable.PSVersion\nGet-Location\nWrite-Host 'Preflight complete — review the target before running generated changes.'"
    : target.id === "linux-bash" || target.id === "macos-zsh"
      ? "#!/usr/bin/env bash\nset -eu\nprintf 'Shell: '; printf '%s\\n' \"$SHELL\"\nprintf 'Working directory: '; pwd\nprintf '%s\\n' 'Preflight complete — review the target before running generated changes.'"
      : `# ${target.label} preflight\nConfirm the required runtime (${target.defaultRuntime}), project directory, and prerequisites before using generated artifacts.`;
  const directPreflightCommands = directProject
    ? []
    : target.id === "windows-powershell"
    ? ["$PSVersionTable.PSVersion", "Get-Location", "Write-Host 'Preflight complete — review the target before running generated changes.'"]
    : target.id === "linux-bash" || target.id === "macos-zsh"
      ? ["printf 'Shell: %s\\n' \"$SHELL\"", "pwd", "printf '%s\\n' 'Preflight complete — review the target before running generated changes.'"]
      : target.id === "python"
        ? ["python --version", "python -m venv .venv", "# Activate .venv only after reviewing the generated project files."]
        : target.id === "node" || target.id === "web" || target.id === "api"
          ? ["node --version", "npm --version", "# Install dependencies only after reviewing the generated package manifest."]
          : ["# Confirm the device is owned or administratively managed before using any deployment or configuration package."];
  const windowsGuideFiles = target.id === "windows-powershell"
    ? [
        { path: "RUN-ME-FIRST.ps1", purpose: "Shows the safe package-specific preview, apply, and verification sequence", content: windowsRunFirstScript(profile, starter.commands) },
        { path: "docs/WINDOWS-ZIP-RUN-GUIDE.md", purpose: "Exact Windows download, extraction, preview, execution, verification, and rollback guidance", content: windowsZipRunGuide(profile, starter.commands) },
        { path: "scripts/Collect-SynapseXDiagnostics.ps1", purpose: "Read-only package, account, PowerShell, and wake-setting diagnostic collector", content: windowsDiagnosticCollectorScript() },
        { path: "docs/TROUBLESHOOTING.md", purpose: "Common Windows package failure diagnosis and safe evidence-collection guidance", content: windowsTroubleshootingGuide() },
      ]
    : [];
  const responseStarterCommands = target.id === "windows-powershell" && risk === "critical" ? [] : starter.commands;
  const directReadme = { path: "README.md", purpose: "Direct implementation setup and verification guide", content: `# SynapseX direct implementation\n\n## Request\n${safePrompt}\n\n## Execution tier\n${executionTier}\n\n## Run\n\nUse the commands shown in the SynapseX response in order. Each command has its own purpose, expected output, and safety check.\n\n## Verify\n\nComplete every verification step shown in the response before calling the project complete.\n\n## Stop\n\nStop a local development server with Ctrl+C in the terminal that started it.\n` };
  const starterHasReadme = starter.files.some((file) => file.path.toLowerCase() === "readme.md");
  return {
    analysis: directProject
      ? executionTier === "direct-native"
        ? `Direct native Windows command prepared. This request needs no ZIP, no Ollama model, and no project files: run the one reviewed command, then perform the stated visual verification.`
        : `Direct implementation prepared for ${target.label}. The visible response contains only the required runnable project files, commands, expected outcomes, verification, and safe stop guidance. Download ZIP remains optional.`
      : `Direct implementation prepared for ${target.label}. Complete runnable files, commands, verification, and rollback guidance are shown below. Download ZIP is optional and includes its own Windows extraction and run guide when applicable. A connected paid model is not required for this deterministic implementation; richer arbitrary source generation requires either an optional local model or an approved model connection.`,
    plan: executionTier === "direct-native" ? ["Run the one reviewed native command", "Perform the stated visual verification", "Paste any unexpected output into SynapseX"] : directProject ? ["Save the complete files shown in the response", "Run the implementation commands in order", "Complete the listed verification steps", "Stop the local service with Ctrl+C when finished"] : ["Review the declared target and permission level", "Use the complete files shown in the response", "Run the read-only preflight artifact", "Run the direct implementation commands", "Run verification and retain rollback evidence"],
    files: directProject && executionTier !== "direct-native" ? [...(starterHasReadme ? [] : [directReadme]), ...starter.files] : directProject ? [] : [
      { path: "README.md", purpose: "Self-run package overview", content: `# SynapseX self-run package\n\n## Request\n${safePrompt}\n\n## Target\n${target.label}\n\n## Safety status\nRisk: ${risk}\n\nThis package is generated without claiming execution. Run the preflight first and retain its output.\n` },
      { path: targetFile, purpose: "Read-only environment preflight", content: preflight },
      { path: "docs/EXECUTION-CHECKLIST.md", purpose: "Manual install, verification, and rollback checklist", content: `# Execution checklist\n\n1. Confirm the target is owned or authorized.\n2. Confirm the target platform and runtime.\n3. Run the preflight artifact.\n4. Save complete generated files before running commands.\n5. Verify expected output.\n6. Keep backup and rollback evidence.\n\nRisk classification: ${risk}.\n` },
      ...windowsGuideFiles,
      ...starter.files,
    ],
    verification: directProject ? starter.verification : ["Confirm the target platform and runtime match the selected contract", `Run ${targetFile} as a read-only preflight`, "Save preflight output before proceeding", ...starter.verification, "Do not mark the requested build complete until its own verification command succeeds"],
    commands: [...directPreflightCommands, ...responseStarterCommands],
    risks: risk === "blocked" ? ["The request contains a prohibited bypass, credential, or harmful-security pattern. Do not generate or execute it."] : risk === "critical" ? ["This request can change protection, data, devices, or system policy. Require target confirmation, backup/recovery acknowledgement, and a separate review before producing change commands."] : directProject ? ["This local implementation uses only the files and commands shown. It does not claim execution until its verification steps succeed."] : ["This free-first package is a preflight scaffold. It does not claim that a custom solution was generated or installed."],
  };
}

export function createLocalModelArtifactPlan(prompt: string, context: UniversalGenerationContext) {
  const target = getUniversalTarget(context.targetId);
  const risk = classifyCommandRisk(prompt);
  const safePrompt = prompt.replace(/\s+/g, " ").trim().slice(0, 1600);
  const windows = target.id === "windows-powershell";
  const unix = target.id === "linux-bash" || target.id === "macos-zsh";
  const scriptPath = windows ? "scripts/generate-with-ollama.ps1" : unix ? "scripts/generate-with-ollama.sh" : "docs/LOCAL-MODEL-GENERATION.md";
  const script = windows
    ? `$ErrorActionPreference = 'Stop'
$model = 'qwen2.5-coder:7b'
$root = Split-Path -Parent $PSScriptRoot
$promptFile = Join-Path $root 'prompts/request.md'
$outputFile = Join-Path $root 'output/generated-proposal.md'
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { throw 'Ollama is not installed. Install it from https://ollama.com/download, then run this script again.' }
if (-not (Test-Path -LiteralPath $promptFile)) { throw "Prompt file not found: $promptFile" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputFile) | Out-Null
$instruction = @'
You are a careful software engineer. Return a complete self-run software proposal for the supplied request. Include assumptions, complete files, exact save steps, install commands, run commands, expected output, verification, and rollback. Never claim anything executed. Refuse bypassing security controls, unauthorized access, credential theft, rooting, jailbreaking, or destructive commands.
'@
$request = Get-Content -LiteralPath $promptFile -Raw
ollama pull $model
($instruction + [Environment]::NewLine + [Environment]::NewLine + 'USER REQUEST:' + [Environment]::NewLine + $request) | ollama run $model | Set-Content -LiteralPath $outputFile -Encoding utf8
Get-FileHash -LiteralPath $outputFile
Write-Host "Local proposal saved to $outputFile"`
    : unix
      ? `#!/usr/bin/env bash
set -euo pipefail
model="qwen2.5-coder:7b"
root="$(cd "$(dirname "$0")/.." && pwd)"
prompt_file="$root/prompts/request.md"
output_file="$root/output/generated-proposal.md"
command -v ollama >/dev/null 2>&1 || { echo "Ollama is not installed. Install it from https://ollama.com/download, then run this script again."; exit 1; }
test -f "$prompt_file" || { echo "Prompt file not found: $prompt_file"; exit 1; }
mkdir -p "$(dirname "$output_file")"
ollama pull "$model"
{
  cat <<'INSTRUCTIONS'
You are a careful software engineer. Return a complete self-run software proposal for the supplied request. Include assumptions, complete files, exact save steps, install commands, run commands, expected output, verification, and rollback. Never claim anything executed. Refuse bypassing security controls, unauthorized access, credential theft, rooting, jailbreaking, or destructive commands.
INSTRUCTIONS
  printf '\n\nUSER REQUEST:\n'
  cat "$prompt_file"
} | ollama run "$model" > "$output_file"
sha256sum "$output_file" 2>/dev/null || shasum -a 256 "$output_file"
printf 'Local proposal saved to %s\n' "$output_file"`
      : `# Local model package

This selected target does not use a direct desktop shell script. Install Ollama on a computer you own, create the prompt file below, then run the local model from the Ollama CLI or its local API. Review every generated artifact before using it.`;
  const commands = windows
    ? ["ollama --version", "& .\\scripts\\generate-with-ollama.ps1"]
    : unix
      ? ["ollama --version", "chmod +x ./scripts/generate-with-ollama.sh", "./scripts/generate-with-ollama.sh"]
      : ["ollama --version", "ollama run qwen2.5-coder:7b"];
  return {
    analysis: `Custom implementation needs a local model because this request is outside SynapseX’s deterministic direct-command and starter-project catalog. The visible files and commands set up an optional Ollama workflow; Download ZIP is only an export convenience, not a required first step.`,
    plan: ["Confirm Ollama is available only if you want arbitrary custom source generation", "Save the visible local-model files into one reviewed folder or use optional Download ZIP", "Review the exact prompt before the model reads it", "Run the local generation script", "Review generated output before copying any command", "Run the generated proposal's own verification steps"],
    files: [
      { path: "README.md", purpose: "Local-model self-run package overview", content: `# SynapseX local-model package\n\n## Request\n${safePrompt}\n\n## Target\n${target.label}\n\n## Model\nThis package uses a user-controlled local Ollama model by default. The model name can be changed after reviewing hardware requirements.\n\n## Safety\nRisk: ${risk}. Generated output is a proposal only and must be reviewed before use.\n` },
      { path: "prompts/request.md", purpose: "Exact user request for the local model", content: `${buildUniversalGenerationContract(context)}\n\nUSER REQUEST:\n${safePrompt}\n` },
      { path: scriptPath, purpose: "Local Ollama generation workflow", content: script },
      { path: "docs/LOCAL-MODEL-SETUP.md", purpose: "Local model and verification instructions", content: `# Local model setup\n\n1. Install Ollama from https://ollama.com/download on the computer where you will run the package.\n2. Confirm the CLI with \`ollama --version\`.\n3. Review \`prompts/request.md\`.\n4. Run the platform-specific script.\n5. Review \`output/generated-proposal.md\` before copying any generated command.\n\nOllama serves a local API after it is running; this package uses the CLI to keep the first workflow copy-paste friendly.\n` },
      ...(windows ? [
        { path: "RUN-ME-FIRST.ps1", purpose: "Checks that this is the newly extracted local-model package and shows the next command", content: `$ErrorActionPreference = 'Stop'\n$root = Split-Path -Parent $PSCommandPath\nSet-Location $root\nif (-not (Test-Path .\\prompts\\request.md) -or -not (Test-Path .\\scripts\\generate-with-ollama.ps1)) { throw 'This is not a complete SynapseX local-model package folder. Extract the newest synapsex-package ZIP into a new folder and run RUN-ME-FIRST.ps1 there.' }\nWrite-Host 'Correct local-model package folder confirmed.' -ForegroundColor Green\nWrite-Host 'Next: ollama --version' -ForegroundColor Cyan\nWrite-Host 'Then: & .\\scripts\\generate-with-ollama.ps1' -ForegroundColor Cyan\nWrite-Host 'Do not run this from an older sign-in, backup, or protection package folder.' -ForegroundColor Yellow\n` },
        { path: "docs/WINDOWS-ZIP-RUN-GUIDE.md", purpose: "Exact Windows download, extraction, package-check, and local-model run guidance", content: windowsZipRunGuide("generic", commands) },
      ] : []),
    ],
    verification: ["Confirm `ollama --version` succeeds locally", "Confirm the visible prompt and generation script are saved together before running the script", "Review the exact prompt file before the model reads it", "Confirm output/generated-proposal.md exists and retain its checksum", "Treat every generated command as unexecuted until its own verification step succeeds"],
    commands: windows ? ["ollama --version", "# Save prompts/request.md and scripts/generate-with-ollama.ps1 from the visible files into the same project folder, or choose optional Download ZIP.", "& .\\scripts\\generate-with-ollama.ps1"] : commands,
    risks: risk === "critical" ? ["This request can affect protection, data, devices, or policy. The local model package produces a proposal only; require owner confirmation, backup/recovery review, and a separate command review before use."] : ["Local model output can be incorrect or unsafe. Review complete files and commands before saving or running them.", "Model download size and local hardware capability depend on the model selected by the user."],
  };
}
