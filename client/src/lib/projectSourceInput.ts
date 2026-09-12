export type ProjectSourceMode = "link" | "file";

export function projectSourceInputKey(mode: ProjectSourceMode) {
  return `${mode}-source-input`;
}
