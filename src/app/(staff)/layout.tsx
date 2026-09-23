import SignOutButton from "@/components/SignOutButton";
import { ROLE_LABEL } from "@/lib/demo";
import { getStaff } from "@/lib/staff";
import StaffNav from "./StaffNav";

// Frame for the staff screens (desktop-first, still fine on a phone).
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await getStaff();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-slate text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 md:px-6">
          <div>
            <p className="text-[1.35em] font-bold tracking-tight">Resource Hub</p>
            <p className="text-[0.9em] text-[#C9D3DC]">
              {profile.display_name} · {ROLE_LABEL[profile.role]}
            </p>
          </div>
          <nav aria-label="Main" className="flex items-center gap-1">
            <StaffNav role={profile.role} />
            <span className="ml-2">
              <SignOutButton />
            </span>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
