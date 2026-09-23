import type { Metadata } from "next";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-3 text-[1.35em] font-bold">How it works</h1>
      <ol className="mb-3 list-decimal pl-6 [&>li]:mb-1.5">
        <li>Find the equipment you need and see how far each locker is.</li>
        <li>Reserve it. We hold it for 30 minutes.</li>
        <li>Tap your student card at the locker and take the item.</li>
        <li>Return it to any locker before it&apos;s due.</li>
      </ol>
      <h2 className="mt-5 mb-2 font-bold">Due dates and public holidays</h2>
      <p className="mb-2.5">
        If a loan would end on a public holiday, when no technicians are on campus, it&apos;s due at 10:00 on the next
        working day instead. We tell you before you reserve.
      </p>
      <h2 className="mt-5 mb-2 font-bold">Something went wrong?</h2>
      <p className="mb-2.5">
        If a door doesn&apos;t open or the wrong item is inside, use the buttons on the locker screen. A technician is
        notified straight away.
      </p>
      <p>Technician desk: S-Blocks ground floor, weekdays 07:30 to 16:00.</p>
    </div>
  );
}
