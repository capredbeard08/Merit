export const FILE_MAX_BYTES = 50 * 1024 * 1024;
export const FILE_ALLOWED_EXTENSIONS = [
  "pdf", "docx", "jpg", "jpeg", "png", "gif", "txt", "mp3", "mp4", "zip", "csv",
] as const;

export const FILE_ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/gif",
  "text/plain",
  "audio/mpeg",
  "video/mp4",
  "application/zip",
  "application/x-zip-compressed",
  "text/csv",
  "application/csv",
];

export function safeOriginalName(input: string): string {
  if (/[\\/]/.test(input) || input.includes("..")) return "";
  const name = input.replace(/[\u0000-\u001f\u007f:]/g, "").trim();
  return name.slice(0, 180);
}

export function allowedFileName(input: string): boolean {
  const name = safeOriginalName(input);
  if (!name || name.startsWith(".") || name.includes("..")) return false;
  const parts = name.split(".");
  if (parts.length < 2) return false;
  const ext = parts.pop()?.toLowerCase();
  if (!ext || !FILE_ALLOWED_EXTENSIONS.includes(ext as (typeof FILE_ALLOWED_EXTENSIONS)[number])) return false;
  // Reject executable/script masquerading behind a permitted extension.
  if (parts.some((part) => ["exe", "com", "bat", "cmd", "ps1", "sh", "php", "js", "vbs", "scr"].includes(part.toLowerCase()))) return false;
  return true;
}

export function contentTypeForName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    txt: "text/plain", html: "text/html", mp3: "audio/mpeg", mp4: "video/mp4",
    zip: "application/zip", csv: "text/csv",
  };
  return (ext && types[ext]) || "application/octet-stream";
}
