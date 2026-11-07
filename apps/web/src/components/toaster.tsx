"use client";
import * as React from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@testpilot/ui";

type Toast = { id: number; title: string; description?: string; variant: "success" | "error" };
const ToastContext = React.createContext<{ toast: (t: Omit<Toast, "id">) => void } | null>(null);

/** Minimal accessible toast system (aria-live region). */
export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const toast = React.useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
  }, []);
  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn("pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-popover p-3.5 text-sm shadow-lg")}
          >
            {t.variant === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            )}
            <div className="flex-1">
              <p className="font-medium">{t.title}</p>
              {t.description && <p className="mt-0.5 text-muted-foreground">{t.description}</p>}
            </div>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <Toaster>");
  return ctx.toast;
}
