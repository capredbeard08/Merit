import { redirect } from "next/navigation";

export default async function OptOutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!t) redirect("/");

  redirect("/api/feedback/" + id + "/optout?t=" + encodeURIComponent(t));
}
