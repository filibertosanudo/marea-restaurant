import { auth } from "@/auth";

export default async function AdminHomePage() {
  const session = await auth();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[6px] p-lg text-center">
      <h1 className="font-display text-[22px] font-semibold text-on-surface">
        Marea Admin
      </h1>
      <p className="text-[13px] text-on-surface-muted">
        {session?.user?.email} · {session?.user?.role}
      </p>
    </div>
  );
}
