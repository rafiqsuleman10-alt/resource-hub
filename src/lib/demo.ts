// Demo accounts shown on the login page and created by the seed script.
// This is a public demo with made-up people, so the password is printed
// on the login page on purpose.
export const DEMO_PASSWORD = "DemoHub2026!";

export type Role = "student" | "technician" | "maintenance";

export const DEMO_ACCOUNTS: { email: string; label: string; role: Role; blurb: string }[] = [
  { email: "student1@demo.hub", label: "Student 1", role: "student", blurb: "Has two items on loan" },
  { email: "student2@demo.hub", label: "Student 2", role: "student", blurb: "No loans yet" },
  { email: "tech@demo.hub", label: "Technician", role: "technician", blurb: "Stock, loans and dashboard" },
  { email: "maint@demo.hub", label: "Maintenance officer", role: "maintenance", blurb: "Work orders and servicing" },
];

export const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  technician: "Technician",
  maintenance: "Maintenance officer",
};
