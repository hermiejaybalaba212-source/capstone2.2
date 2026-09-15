"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/browser";

function Field({ label, type, value, onChange, placeholder, showToggle, onToggle }: { label: string; type: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder: string; showToggle?: boolean; onToggle?: () => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#540111]">{label}</span>
      <div className="relative">
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} required className="box-border w-full rounded-xl border border-[#7B1113]/25 bg-white px-4 py-3 pr-12 text-sm text-[#241012] outline-none placeholder:text-[#8B7376] focus:border-[#7B1113] focus:ring-4 focus:ring-[#7B1113]/10" />
        {showToggle && (
          <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B7376] hover:text-[#7B1113]" tabIndex={-1}>
            {type === "text" ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
            )}
          </button>
        )}
      </div>
    </label>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "forgot" | "update">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    const { data: authListener } = sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("update");
        setError("");
        setMessage("");
      }
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const sb = getSupabase();
      console.log("Attempting login for:", email.trim());

      const { data: authData, error: loginError } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      console.log("Auth result:", { authData: authData ? "ok" : null, loginError });

      if (loginError) {
        setError(loginError.message);
        setLoading(false);
        return;
      }

      const authUserId = authData?.user?.id;
      console.log("Auth user ID:", authUserId);
      if (!authUserId) {
        setError("Login succeeded but could not identify user.");
        setLoading(false);
        return;
      }

      // Some staff accounts may have a duplicate 'Student' row left over from the
      // handle_new_student_registration trigger. Prefer the non-Student / active row so
      // staff (CHED/Admin/Faculty) are never routed to the student dashboard.
      const { data: userRows, error: userError } = await sb
        .from("users")
        .select("role, status")
        .eq("auth_user_id", authUserId);

      console.log("User query:", { userRows, userError });

      if (userError) {
        setError("Failed to load user profile: " + userError.message);
        setLoading(false);
        return;
      }

      const staffRow = (userRows || []).find((u) => u.role !== "Student");
      const userData = staffRow || userRows?.[0];

      if (!userData) {
        setError("No user profile found. Contact admin.");
        setLoading(false);
        return;
      }

      if (userData.status === "Inactive") {
        setError("Your account is inactive. Please contact the Scholarship Office.");
        setLoading(false);
        return;
      }

      console.log("Routing to:", userData.role);
      setLoading(false);
      const roleHome =
        userData.role === "Admin" ? "/admin"
          : userData.role === "CHED" ? "/ched"
            : userData.role === "Faculty" ? "/faculty"
              : "/student";

      const params = new URLSearchParams(window.location.search);
      const redirectPath = params.get("redirect");
      if (redirectPath && redirectPath.startsWith(roleHome) && !redirectPath.startsWith("//") && !redirectPath.includes(":") && !redirectPath.includes("\\")) {
        router.push(redirectPath);
        return;
      }
      router.push(roleHome);
    } catch (err: unknown) {
      console.error("Login catch error:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage === "Failed to fetch"
        ? "Could not reach Supabase. Check your NEXT_PUBLIC_SUPABASE_URL, network connection, and Supabase project status."
        : errorMessage);
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const sb = getSupabase();
    const { error: resetError } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/login` });
    setLoading(false);

    if (resetError) { setError(resetError.message); return; }
    setMessage("If this email has an account, a password reset link has been sent.");
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword.length < 8) { setError("Password must contain at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    const sb = getSupabase();
    const { error: updateError } = await sb.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateError) { setError(updateError.message); return; }
    setNewPassword("");
    setConfirmPassword("");
    setMode("login");
    setMessage("Password updated successfully. You can now log in.");
  };

  return (
    <div className="flex min-h-screen font-sans text-[#241012]">
      <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-gradient-to-b from-[#7B1113] via-[#5A0C0E] to-[#3E0009] p-10 text-white xl:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-black/20" />
        <Link href="/" className="relative flex items-center gap-3">
          <div className="leading-tight">
            <p className="text-lg font-bold">St. Peter&apos;s College</p>
            <p className="text-xs text-white/70">Iligan City</p>
          </div>
        </Link>
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/70">ISEWM Scholarship System</p>
          <h1 className="mt-4 text-3xl font-bold leading-snug">Intelligent Scholarship Application, Ranking &amp; Early-Warning Monitoring</h1>
          <ul className="mt-7 space-y-3 text-sm text-white/85">
            {["Random Forest ranking prioritizing financial need", "Records validated against the Registrar Information System", "Automatic early-warning alerts below the 93% average", "One portal for Students, Faculty, CHED and Administrators"].map((f) => (
              <li key={f} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-white/15 text-[10px] font-bold">&#10003;</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs leading-relaxed text-white/60">&copy; {new Date().getFullYear()} St. Peter&rsquo;s College &middot; Scholarship &amp; Financial Aid Office</p>
      </aside>

      <main className="flex flex-1 items-center justify-center bg-white px-4 py-8 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="leading-tight">
                <p className="text-sm font-bold text-[#241012]">St. Peter&rsquo;s College</p>
                <p className="text-[10px] text-[#6B5458]">Scholarship System</p>
              </div>
            </Link>
            <Link href="/register" className="rounded-lg border border-[#7B1113]/30 px-3 py-2 text-xs font-semibold text-[#7B1113] hover:bg-[#7B1113]/5">Register</Link>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {["Student", "Faculty", "CHED", "Administrator"].map((r) => (
              <span key={r} className="rounded-full border border-[#7B1113]/15 bg-[#FAF7F5] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#7B1113]">{r}</span>
            ))}
          </div>
          <h2 className="mt-6 text-center text-2xl font-bold text-[#241012]">
            {mode === "login" ? "Welcome back!" : mode === "forgot" ? "Reset your password" : "Set a new password"}
          </h2>
          <p className="mt-2 text-center text-sm leading-relaxed text-[#6B5458]">
            {mode === "login" ? "Log in with your email \u2014 you will be routed automatically by role." : mode === "forgot" ? "Enter your email and we will send you a secure reset link." : "Choose a strong password of at least 8 characters."}
          </p>
          {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><div className="flex gap-3"><span className="font-bold">!</span><p>{error}</p></div></div>}
          {message && <div className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"><div className="flex gap-3"><span className="font-bold">&#10003;</span><p>{message}</p></div></div>}
          <form onSubmit={mode === "login" ? handleLogin : mode === "forgot" ? handleForgotPassword : handleUpdatePassword} className="mt-6 space-y-4">
            {mode !== "update" && <Field label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g., student@gmail.com" />}
            {mode === "login" && <Field label="Password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" showToggle onToggle={() => setShowPassword(!showPassword)} />}
            {mode === "update" && (
              <>
                <Field label="New Password" type={showPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" showToggle onToggle={() => setShowPassword(!showPassword)} />
                <Field label="Confirm New Password" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter the same password again" />
              </>
            )}
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-[#7B1113] to-[#540111] px-4 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? "Please wait..." : mode === "login" ? "Log In" : mode === "forgot" ? "Send Reset Link" : "Update Password"}
            </button>
          </form>
          <div className="mt-5 flex items-center justify-center gap-1.5 text-sm">
            {mode === "login" ? (
              <>
                <button type="button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }} className="font-semibold text-[#7B1113] hover:underline">Forgot password?</button>
                <span className="text-[#8B7376]">&middot;</span>
                <span className="text-[#6B5458]">No account yet?</span>
                <Link href="/register" className="font-semibold text-[#7B1113] hover:underline">Register</Link>
              </>
            ) : (
              <button type="button" onClick={() => { setMode("login"); setError(""); setMessage(""); }} className="font-semibold text-[#7B1113] hover:underline">&larr; Back to login</button>
            )}
          </div>
          <p className="mt-8 hidden text-center text-xs text-[#8B7376] lg:block">Protected by St. Peter&rsquo;s College &middot; ISEWM Scholarship System</p>
        </div>
      </main>
    </div>
  );
}
