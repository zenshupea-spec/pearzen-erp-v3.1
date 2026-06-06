import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../../../../packages/supabase/server";
import { isForgeOperatorEmail } from "../../lib/forge-access";

export default async function ForgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login/forge");
  }

  if (!(await isForgeOperatorEmail(user.email))) {
    redirect("/login/forge?error=forge_denied");
  }

  return (
    <main className="p-4 md:p-8 pb-24 font-sans">
      {children}
    </main>
  );
}
