import { createSupabaseServerClient } from "../../../packages/supabase/server";

import EmpNumberLoginForm from "./EmpNumberLoginForm";

export default async function Page() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {user ? (
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <span className="connection-status-light" aria-hidden="true" />
              <div>
                <div className="text-sm font-medium text-field-fg">Connected</div>
                <div className="mt-1 text-xs text-field-fg/70">
                  {user.id}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <EmpNumberLoginForm />
        )}
      </div>
    </main>
  );
}

