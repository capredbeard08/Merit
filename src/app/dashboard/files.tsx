"use client";

import { useCallback, useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";

type FileItem = { id: string; originalName: string; contentType: string; sizeBytes: number; status: string; createdAt: string };
const ACCEPT = ".pdf,.docx,.jpg,.jpeg,.png,.gif,.txt,.html,.mp3,.mp4,.zip,.csv,.exe";
const MAX = 50 * 1024 * 1024;
const EXTENSIONS = ["pdf","docx","jpg","jpeg","png","gif","txt","html","mp3","mp4","zip","csv","exe"];
function prettySize(size: number) { return size < 1024 * 1024 ? Math.max(1, Math.round(size / 1024)) + " KB" : (size / (1024 * 1024)).toFixed(1) + " MB"; }

export default function FileLibrary({ workspaceId }: { workspaceId: string }) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    const response = await fetch("/api/files?workspaceId=" + encodeURIComponent(workspaceId), { cache: "no-store" });
    if (response.ok) { const data = await response.json(); setFiles(data.files || []); }
  }, [workspaceId]);
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
      setMessage("Upload complete. Files are stored privately in this workspace.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed. Please try again.");
      await refresh();
    } finally { setBusy(false); }
  }

  return (
    <section className="mt-8 rounded-3xl border border-[#dfe5dc] bg-white/80 p-6 shadow-sm sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#557565]">Private workspace storage</p>
          <h2 className="mt-2 text-2xl font-semibold">Files & documents</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#557565]">Store documents, images, audio, video, text, spreadsheets and ZIP archives. Maximum 50 MB per file. Files are never executed.</p>
        </div>
        <label className={"inline-flex cursor-pointer items-center justify-center rounded-xl bg-[#173b2f] px-4 py-3 text-sm font-semibold text-white " + (busy ? "opacity-60" : "")}>
          {busy ? "Uploading…" : "Upload files"}
          <input type="file" multiple accept={ACCEPT} disabled={busy} onChange={submit} className="sr-only" />
        </label>
      </div>
      {message && <p role="status" className="mt-4 rounded-xl bg-[#e7eee9] p-3 text-sm text-[#173b2f]">{message}</p>}
      <p className="mt-3 text-xs leading-5 text-[#718178]">Executable uploads are quarantined and cannot be downloaded. AI analysis will be enabled only for formats with a safe, supported extraction pipeline.</p>
      <div className="mt-5 divide-y divide-[#e4e9e3]">
        {files.length === 0 ? <p className="py-5 text-sm text-[#718178]">No files uploaded yet.</p> : files.map(file => (
          <div key={file.id} className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <p className="truncate font-medium text-[#173b2f]">{file.originalName}</p>
              <p className="mt-1 text-xs text-[#718178]">{prettySize(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString()} · {file.status === "QUARANTINED" ? "Quarantined" : "Private"}</p>
            </div>
            {file.status === "AVAILABLE" && <a href={"/api/files/" + encodeURIComponent(file.id)} className="shrink-0 text-sm font-semibold text-[#173b2f] underline underline-offset-4">Download</a>}
          </div>
        ))}
      </div>
    </section>
  );
}