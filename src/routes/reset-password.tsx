import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase auto-parses the recovery token from the URL hash and emits
    // a PASSWORD_RECOVERY event. Once we have a session, we can update.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (password.length < 6) throw new Error("Password must be at least 6 characters");
      if (password !== confirmPassword) throw new Error("Passwords do not match");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. Please sign in.");
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl p-8 shadow-lg">
        <h1 className="text-2xl font-semibold text-center mb-2">Reset password</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">
          {ready ? "Choose a new password" : "Open this page from the reset link in your email."}
        </p>
        {ready && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">New password</label>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Confirm new password</label>
              <input type="password" required minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <button disabled={loading} type="submit"
              className="w-full py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">
              {loading ? "..." : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
