export type ProjectContextFile = { path: string; content: string };

export type BrowserProjectContext = {
  name?: string;
  source?: string;
  languages: string[];
  frameworks: string[];
  dependencies: string[];
  evidence: string;
  filesRead: number;
};

const languageByExtension: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript",
  py: "Python", go: "Go", rs: "Rust", java: "Java", cs: "C#", php: "PHP", rb: "Ruby",
  sql: "SQL", html: "HTML", css: "CSS", scss: "CSS", swift: "Swift", kt: "Kotlin",
};

export function summarizeProjectContext(name: string | undefined, files: ProjectContextFile[]): BrowserProjectContext {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const dependencies = new Set<string>();
  const excerpts: string[] = [];

  for (const file of files.slice(0, 120)) {
    const extension = file.path.split(".").pop()?.toLowerCase();
    if (extension && languageByExtension[extension]) languages.add(languageByExtension[extension]);
    const value = file.content.toLowerCase();
    if (/next(?:\.js)?|next\/app/.test(value) || file.path === "next.config.js" || file.path === "next.config.mjs") frameworks.add("Next.js");
    if (/react|react-dom/.test(value)) frameworks.add("React");
    if (/vite/.test(value)) frameworks.add("Vite");
    if (/fastapi/.test(value)) frameworks.add("FastAPI");
    if (/express/.test(value)) frameworks.add("Express");
    if (/django/.test(value)) frameworks.add("Django");
    if (/flask/.test(value)) frameworks.add("Flask");
    if (/drizzle/.test(value)) frameworks.add("Drizzle ORM");
    if (/prisma/.test(value)) frameworks.add("Prisma");
    if (/tailwind/.test(value)) frameworks.add("Tailwind CSS");
    if (file.path.endsWith("package.json")) {
      try {
        const parsed = JSON.parse(file.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        Object.keys({ ...parsed.dependencies, ...parsed.devDependencies }).forEach((item) => dependencies.add(item));
      } catch { /* Keep raw file evidence even if package JSON is incomplete. */ }
    }
    excerpts.push(`FILE: ${file.path}\n${file.content.slice(0, 6000)}`);
  }

  return {
    name,
    source: name ? `Browser-selected local folder: ${name}` : "Pasted project context",
    languages: Array.from(languages).sort(),
    frameworks: Array.from(frameworks).sort(),
    dependencies: Array.from(dependencies).sort().slice(0, 120),
    evidence: excerpts.join("\n\n").slice(0, 60000),
    filesRead: Math.min(files.length, 120),
  };
}
