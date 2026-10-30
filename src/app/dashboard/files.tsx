"use client";

import { useCallback, useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";

type FileItem = { id: string; originalName: string; contentType: string; sizeBytes: number; status: string; createdAt: string; deletedAt?: string | null };
const ACCEPT = ".pdf,.docx,.jpg,.jpeg,.png,.gif,.txt,.mp3,.mp4,.zip,.csv";
const MAX = 50 * 1024 * 1024;
const EXTENSIONS = ["pdf","docx","jpg","jpeg","png","gif","txt","mp3","mp4","zip","csv"];
function prettySize(size: number) { return size < 1024 * 1024 ? Math.max(1, Math.round(size / 1024)) + " KB" : (size / (1024 * 1024)).toFixed(1) + " MB"; }

export default function FileLibrary({ workspaceId, canManage, canRecover, canErase }: { workspaceId: string; canManage: boolean; canRecover: boolean; canErase: boolean }) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [deletedFiles, setDeletedFiles] = useState<FileItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    const activeResponse = await fetch("/api/files?workspaceId=" + encodeURIComponent(workspaceId), { cache: "no-store" });
    if (activeResponse.ok) { const data = await activeResponse.json(); setFiles(data.files || []); }
    if (canRecover) {
      const deletedResponse = await fetch("/api/files?workspaceId=" + encodeURIComponent(workspaceId) + "&includeDeleted=true", { cache: "no-store" });
      if (deletedResponse.ok) { const data = await deletedResponse.json(); setDeletedFiles(data.files || []); }
    }
  }, [workspaceId, canRecover]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function submit(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected.length) return;
    setBusy(true); setMessage("");
    try {
      for (const file of selected) {
        if (file.size > MAX) throw new Error(file.name + " exceeds the 50 MB limit.");
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!ext || !EXTENSIONS.includes(ext)) throw new Error(file.name + " has an unsupported file type.");
        await upload(file.name, file, {
          access: "private",
          handleUploadUrl: "/api/files/upload",
          clientPayload: JSON.stringify({ workspaceId, originalName: file.name, sizeBytes: file.size }),
        });
      }
      setMessage("Upload complete. Files remain quarantined until the server-side safety workflow approves them.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed. Please try again.");
      await refresh();
    } finally { setBusy(false); }
  }

  async function fileAction(url: string, method: "DELETE" | "POST", body?: object) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "The file action could not be completed.");
      setMessage("File action completed.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The file action failed.");
    } finally { setBusy(false); }
  }

  async function erase(file: FileItem) {
    if (!window.confirm("Permanently erase " + file.originalName + "? This cannot be undone.")) return;
    await fileAction("/api/files/" + encodeURIComponent(file.id) + "/erase", "POST", { confirmation: "PERMANENTLY ERASE" });
  }

  return (
    <section className="mt-8 rounded-3xl border border-[#dfe5dc] bg-white/80 p-6 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#557565]">Private workspace storage</p>
          <h2 className="mt-2 text-2xl font-semibold">Files & documents</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#557565]">Store documents, images, audio, video, text, spreadsheets and ZIP archives. Maximum 50 MB per file. Files are never executed.</p>
        </div>
        {canManage && <label className={"inline-flex cursor-pointer items-center justify-center rounded-xl bg-[#173b2f] px-4 py-3 text-sm font-semibold text-white " + (busy ? "opacity-60" : "")}>
          {busy ? "Working…" : "Upload files"}
          <input type="file" multiple accept={ACCEPT} disabled={busy} onChange={submit} className="sr-only" />
        </label>}
      </div>
      {message && <p role="status" className="mt-4 rounded-xl bg-[#e7eee9] p-3 text-sm text-[#173b2f]">{message}</p>}
      <p className="mt-3 text-xs leading-5 text-[#718178]">Executable, script, and ambiguous binary uploads are blocked. New uploads remain quarantined until they pass the supported safety workflow. Deleting a file moves it to the protected recovery area; it does not immediately destroy the stored file.</p>
      <div className="mt-5 divide-y divide-[#e4e9e3]">
        {files.length === 0 ? <p className="py-5 text-sm text-[#718178]">No active files uploaded yet.</p> : files.map(file => (
          <div key={file.id} className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <p className="truncate font-medium text-[#173b2f]">{file.originalName}</p>
              <p className="mt-1 text-xs text-[#718178]">{prettySize(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString()} · {file.status === "QUARANTINED" ? "Quarantined" : file.status}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {file.status === "AVAILABLE" && <a href={"/api/files/" + encodeURIComponent(file.id)} className="text-sm font-semibold text-[#173b2f] underline underline-offset-4">Download</a>}
              {canManage && <button type="button" disabled={busy} onClick={() => void fileAction("/api/files/" + encodeURIComponent(file.id), "DELETE")} className="text-sm font-semibold text-[#8a3e2e] underline underline-offset-4 disabled:opacity-50">Delete</button>}
            </div>
          </div>
        ))}
      </div>
      {canRecover && <div className="mt-8 border-t border-[#dfe5dc] pt-6">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#557565]">Protected recovery</p><h3 className="mt-1 text-lg font-semibold">Recently deleted files</h3></div>
          <span className="rounded-full bg-[#e7eee9] px-3 py-1 text-xs font-semibold text-[#315b49]">{deletedFiles.length} items</span>
        </div>
        <div className="mt-3 divide-y divide-[#e4e9e3]">
          {deletedFiles.length === 0 ? <p className="py-4 text-sm text-[#718178]">No recoverable files.</p> : deletedFiles.map(file => (
            <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0"><p className="truncate font-medium text-[#173b2f]">{file.originalName}</p><p className="mt-1 text-xs text-[#718178]">Deleted {file.deletedAt ? new Date(file.deletedAt).toLocaleString() : "date unavailable"} · {prettySize(file.sizeBytes)}</p></div>
              <div className="flex items-center gap-3">
                <button type="button" disabled={busy} onClick={() => void fileAction("/api/files/" + encodeURIComponent(file.id) + "/restore", "POST")} className="text-sm font-semibold text-[#173b2f] underline underline-offset-4 disabled:opacity-50">Restore</button>
                {canErase && <button type="button" disabled={busy} onClick={() => void erase(file)} className="text-sm font-semibold text-[#8a3e2e] underline underline-offset-4 disabled:opacity-50">Erase permanently</button>}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-[#718178]">Permanent erasure is separate from ordinary deletion and is available only to the workspace owner. Recovery availability remains subject to the platform's retention and lawful-erasure policy.</p>
      </div>}
    </section>
  );
}
