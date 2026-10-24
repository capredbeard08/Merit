import Link from "next/link";
import MeritMark from "@/components/MeritMark";
import SignOutButton from "@/components/SignOutButton";

const items = [
  { label: "Overview", href: "/dashboard", icon: "home" },
  { label: "Activity", href: "/dashboard#action-inbox", icon: "activity" },
  { label: "Feedback", href: "/dashboard/feedback", icon: "message" },
  { label: "Customers", href: "/dashboard#team", icon: "users" },
  { label: "Locations", href: "/dashboard#branches", icon: "pin" },
  { label: "Automation", href: "/dashboard#workspace-settings", icon: "settings" },
  { label: "Test events", href: "/dashboard#action-inbox", icon: "file" },
] as const;

function NavIcon({ name }: { name: string }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  switch (name) {
    case "home": return <svg {...common}><path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9M9 21v-7h6v7"/></svg>;
    case "activity": return <svg {...common}><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>;
    case "message": return <svg {...common}><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8z"/></svg>;
    case "users": return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case "pin": return <svg {...common}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
    case "settings": return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4L7.3 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2Z"/></svg>;
    default: return <svg {...common}><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/></svg>;
  }
}

export default function DashboardSidebar({ workspaceName, userName, active = "overview" }: { workspaceName: string; userName: string; active?: "overview" | "feedback" }) {
  return (
    <aside className="flex min-h-full w-full flex-col border-b border-[#dfe8e3] bg-[#f4f8f6] px-4 py-5 md:fixed md:inset-y-0 md:left-0 md:z-20 md:w-[234px] md:border-b-0 md:border-r md:px-3 md:py-6">
      <Link href="/dashboard" className="flex items-center gap-2 px-2 text-[#075b46]" aria-label="MERIT overview">
        <MeritMark size={34} /><span className="text-[1.45rem] font-extrabold tracking-[0.08em]">MERIT</span>
      </Link>
      <p className="mt-2 px-2 text-sm leading-5 text-[#53645d]">More feedback. Stronger<br className="hidden md:block" /> relationships.</p>
      <nav aria-label="Main navigation" className="mt-6 grid grid-cols-2 gap-1 sm:grid-cols-3 md:mt-5 md:flex md:flex-col md:gap-1">
        {items.map((item) => {
          const selected = active === "feedback" ? item.label === "Feedback" : active === "overview" && item.label === "Overview";
          return <Link key={item.label} href={item.href} aria-current={selected ? "page" : undefined} className={"flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors " + (selected ? "bg-[#e2f1eb] text-[#073e31] before:absolute before:left-0 before:h-8 before:w-[3px] before:rounded-r-full before:bg-[#08745a]" : "text-[#273b33] hover:bg-white/80")}>
            <NavIcon name={item.icon} /><span>{item.label}</span>
          </Link>;
        })}
      </nav>
      <div className="mt-5 hidden border-t border-[#dfe8e3] pt-4 md:mt-auto md:block">
        <p className="truncate px-2 text-sm font-semibold text-[#233d32]">{workspaceName}</p>
        <div className="mt-4 flex items-center gap-3 px-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e1ece7] text-sm font-semibold text-[#174b3b]">{(userName || "M").slice(0,1).toUpperCase()}</span>
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#1b3028]">{userName}</p><p className="text-xs text-[#6a7a72]">Workspace member</p></div>
        </div>
        <div className="mt-4 px-2"><SignOutButton /></div>
      </div>
    </aside>
  );
}
