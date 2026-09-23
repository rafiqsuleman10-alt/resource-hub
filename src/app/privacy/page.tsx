import type { Metadata } from "next";
import PlainPage from "@/components/PlainPage";

export const metadata: Metadata = { title: "Privacy" };

// Plain-language privacy notice, organised around the conditions for lawful
// processing in South Africa's Protection of Personal Information Act (POPIA).
export default function PrivacyPage() {
  const h2 = "mt-6 mb-2 text-[1.15em] font-bold";
  return (
    <PlainPage title="Privacy">
      <p className="note note-warn mb-4">
        <b>This is a demo.</b> It holds made-up sample data only. Please don&apos;t enter real personal information.
      </p>
      <p className="mb-3">
        Resource Hub is a final-year Industrial Engineering design project at the Durban University of Technology. This
        page explains what information the system keeps, why, and who can see it. It follows the principles of the
        Protection of Personal Information Act (POPIA).
      </p>

      <h2 className={h2}>What we keep, and why</h2>
      <ul className="mb-3 list-disc pl-6 [&>li]:mb-1.5">
        <li>
          <b>Your account:</b> email address, display name, role (student, technician or maintenance officer), faculty
          and year of study, and a student card number, so you can log in and use the lockers. We don&apos;t keep
          student numbers, ID numbers or phone numbers.
        </li>
        <li>
          <b>Where you&apos;re near on campus:</b> so we can list the nearest locker first. You choose it, and you can
          change it at any time.
        </li>
        <li>
          <b>Reservations and loans:</b> what you borrowed, from which locker, and when it&apos;s due and was returned,
          so the equipment gets back and overdue items can be followed up.
        </li>
        <li>
          <b>Fault reports:</b> what went wrong, your note, and a photo if you add one, so a technician can fix it.
          Please photograph the item or locker only, not people.
        </li>
        <li>
          <b>Reservation attempts:</b> whether each reservation could be met, to measure how often students find what
          they need. Wrong backup PINs at a locker are counted (without any names) to stop guessing.
        </li>
      </ul>

      <h2 className={h2}>Who can see it</h2>
      <ul className="mb-3 list-disc pl-6 [&>li]:mb-1.5">
        <li>
          <b>You</b> see your own reservations, loans and fault reports, and nobody else&apos;s.
        </li>
        <li>
          <b>Technicians</b> see everything, to run the lockers and follow up overdue loans.
        </li>
        <li>
          <b>Maintenance officers</b> see fault reports, photos and the equipment, but not who borrowed what. Work orders
          don&apos;t show who reported them.
        </li>
        <li>
          <b>The locker screens</b> can&apos;t read any records. They only check a card, PIN or item tag, and show your
          first name when you collect.
        </li>
      </ul>
      <p className="mb-3">
        These rules are enforced by the database itself (row level security), not just by the website. Fault photos are
        stored privately and shown to staff through links that stop working after an hour.
      </p>

      <h2 className={h2}>Keeping it safe and accurate</h2>
      <p className="mb-3">
        The site uses HTTPS, and passwords are stored by our login provider (Supabase) in a form that can&apos;t be read
        back. The only cookie is the one that keeps you logged in. Display settings are saved in your browser only.
      </p>

      <h2 className={h2}>How long we keep it</h2>
      <p className="mb-3">
        In this demo, all records can be reset to the sample data at any time. In a real system, loan and fault records
        would be kept only as long as needed for stock control and maintenance, and accounts removed when a student
        leaves the university.
      </p>

      <h2 className={h2}>Your rights</h2>
      <p className="mb-3">
        You can ask to see the information held about you, to correct it, or to have it deleted, and you can object to
        how it&apos;s used. In a real system you would do this at the technician desk (S-Blocks ground floor, weekdays
        07:30 to 16:00) or with the university&apos;s information officer. You can also complain to the Information
        Regulator of South Africa.
      </p>
    </PlainPage>
  );
}
