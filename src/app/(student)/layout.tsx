import SignOutButton from "@/components/SignOutButton";
import { getCampus, getStudent } from "@/lib/student";
import NearPicker from "./NearPicker";
import StudentNav from "./StudentNav";

// Frame for every student page: header with "You're near", and the tabs.
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { supabase, zoneId } = await getStudent();
  const [{ zones }, loans] = await Promise.all([
    getCampus(),
    supabase.from("loans").select("id", { count: "exact", head: true }).is("returned_at", null),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-slate text-white">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-4 px-5 pt-4 pb-3 md:items-center md:px-6">
          <div>
            <p className="text-[1.35em] font-bold tracking-tight">Resource Hub</p>
            <NearPicker zones={zones} value={zoneId} />
          </div>
          <div className="flex items-center gap-3">
            <StudentNav loans={loans.count ?? 0} variant="top" />
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-8 md:px-6 md:pt-6">
        {children}
      </main>
      <StudentNav loans={loans.count ?? 0} variant="bottom" />
    </div>
  );
}
