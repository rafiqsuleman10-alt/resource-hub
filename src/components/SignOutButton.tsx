import { signOut } from "@/app/login/actions";

export default function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className="rounded-lg border border-white/30 px-3 py-1.5 text-[0.9em] hover:bg-white/10">
        Log out
      </button>
    </form>
  );
}
