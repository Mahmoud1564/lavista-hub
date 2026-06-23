import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";
type RequestedRole = "admin" | "staff";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [requestedRole, setRequestedRole] = useState<RequestedRole>("staff");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [lastSignupEmail, setLastSignupEmail] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startCooldown(seconds: number) {
    setCooldown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  function parseRetrySeconds(msg: string): number {
    const m = msg.match(/(\d+)\s*seconds?/i);
    if (m) return parseInt(m[1], 10);
    if (/rate limit/i.test(msg)) return 60;
    return 30;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (cooldown > 0) return;
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back");
        navigate({ to: "/dashboard", replace: true });
      } else if (mode === "forgot") {
        if (!email) throw new Error("Enter your email");
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/reset-password",
        });
        if (error) throw error;
        toast.success("Password reset email sent. Check your inbox (and spam).");
        setMode("signin");
      } else {
        if (!fullName.trim()) throw new Error("Please enter your full name");
        if (password.length < 6) throw new Error("Password must be at least 6 characters");
        if (password !== confirmPassword) throw new Error("Passwords do not match");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/dashboard",
            data: { full_name: fullName.trim(), requested_role: requestedRole },
          },
        });
        if (error) throw error;
        setLastSignupEmail(email);
        toast.success(`Account created as ${requestedRole}. Check your email to confirm. An admin must approve your role.`);
        setMode("signin");
        setConfirmPassword("");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      toast.error(msg);
      if (/rate limit|too many|over_email_send/i.test(msg)) {
        startCooldown(parseRetrySeconds(msg));
      }
    } finally {
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    const target = lastSignupEmail || email;
    if (!target) { toast.error("Enter your email first"); return; }
    if (cooldown > 0) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: target,
        options: { emailRedirectTo: window.location.origin + "/dashboard" },
      });
      if (error) throw error;
      toast.success("Confirmation email resent. Check your inbox (and spam).");
      startCooldown(60);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend";
      toast.error(msg);
      if (/rate limit|too many|over_email_send/i.test(msg)) {
        startCooldown(parseRetrySeconds(msg));
      }
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || cooldown > 0;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl p-8 shadow-lg">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-xl mb-3">L</div>
          <h1 className="text-2xl font-semibold">Lavista Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin" ? "Sign in to continue" : mode === "signup" ? "Create staff account" : "Reset your password"}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Full name</label>
                <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">I am a</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["staff", "admin"] as RequestedRole[]).map((r) => (
                    <button key={r} type="button" onClick={() => setRequestedRole(r)}
                      className={`py-2 rounded-md border text-sm capitalize transition ${
                        requestedRole === r
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-input border-border text-foreground hover:border-ring"
                      }`}>
                      {r}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">An existing admin must approve your access after sign-up.</p>
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          {mode !== "forgot" && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Password</label>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          )}
          {mode === "signup" && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Confirm password</label>
              <input type="password" required minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          )}
          <button disabled={disabled} type="submit"
            className="w-full py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">
            {cooldown > 0
              ? `Retry in ${cooldown}s`
              : loading
                ? "..."
                : mode === "signin" ? "Sign in" : mode === "signup" ? "Sign up" : "Send reset link"}
          </button>
        </form>
        <div className="mt-4 space-y-2 text-center text-sm">
          {(mode === "signin" || mode === "signup") && (
            <button type="button" onClick={resendConfirmation} disabled={disabled}
              className="block w-full text-muted-foreground hover:text-foreground disabled:opacity-50">
              {cooldown > 0 ? `Resend available in ${cooldown}s` : "Resend confirmation email"}
            </button>
          )}
          {mode === "signin" && (
            <button type="button" onClick={() => setMode("forgot")} className="block w-full text-muted-foreground hover:text-foreground">
              Forgot password?
            </button>
          )}
          <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setConfirmPassword(""); }}
            className="block w-full text-muted-foreground hover:text-foreground">
            {mode === "signin" ? "Need an account? Sign up" : mode === "signup" ? "Have an account? Sign in" : "Back to sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
