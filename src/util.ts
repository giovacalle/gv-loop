export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "loop";
}

export function expandTilde(path: string): string {
  if (path === "~") return process.env.HOME ?? path;
  if (path.startsWith("~/")) return `${process.env.HOME ?? "~"}${path.slice(1)}`;
  return path;
}

export function timestampId(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function assertSafeId(id: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)) {
    throw new Error(`Invalid loop id "${id}". Use lowercase letters, numbers, and hyphens.`);
  }
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function isTruthyAnswer(input: string): boolean {
  return /^(y|yes|ok|confirm)$/i.test(input.trim());
}
