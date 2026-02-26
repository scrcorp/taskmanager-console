"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { getCompanyCode } from "@/lib/auth";
import { CompanyCodeModal } from "@/components/ui/CompanyCodeModal";
import { AxiosError } from "axios";

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [companyCode, setCompanyCode] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);

  useEffect(() => {
    const saved = getCompanyCode();
    setCompanyCode(saved);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please enter username and password.");
      return;
    }

    if (!companyCode) {
      setError("Please set a company code first.");
      return;
    }

    try {
      await login(username, password);
      router.push("/");
    } catch (err) {
      if (err instanceof AxiosError) {
        const status = err.response?.status;
        const detail = err.response?.data?.detail;

        if (status === 404) {
          setError("Invalid company code.");
        } else if (status === 401) {
          setError("Invalid username or password.");
        } else if (typeof detail === "string") {
          setError(detail);
        } else {
          setError("An error occurred during login.");
        }
      } else {
        setError("Unable to connect to server.");
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <div className="w-[400px] bg-card border border-border rounded-2xl p-10">
        <div className="text-center mb-9">
          <div className="text-3xl font-extrabold text-text">
            <img src="/taskmanager_icon.png" alt="TaskManager" className="inline-block w-12 h-12 mr-2 align-middle" /> TaskManager
          </div>
          <div className="text-text-muted text-sm mt-2">Admin Console</div>
          {companyCode && (
            <button
              type="button"
              onClick={() => setShowCodeModal(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-sm font-bold tracking-widest hover:bg-accent/20 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg>
              {companyCode}
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
            </button>
          )}
          {!companyCode && (
            <button
              type="button"
              onClick={() => setShowCodeModal(true)}
              className="mt-3 text-accent text-sm font-medium hover:underline"
            >
              Set Company Code
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="bg-danger-muted text-danger text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}
          <div>
            <label className="block text-text-secondary text-sm font-semibold mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-text-secondary text-sm font-semibold mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !username.trim() || !password.trim()}
            className="w-full py-3 rounded-lg bg-accent text-white font-bold text-sm mt-2 hover:bg-accent-light disabled:opacity-50 transition-colors"
          >
            {isLoading ? "Logging in..." : "Log In"}
          </button>
        </form>
      </div>

      <CompanyCodeModal
        isOpen={showCodeModal}
        onClose={() => setShowCodeModal(false)}
        onSave={(code) => setCompanyCode(code)}
      />
    </div>
  );
}
