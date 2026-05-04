"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { ResultModalProvider } from "@/components/ui/ResultModal";

/** 앱 전역 프로바이더 래퍼 — React Query + Toast 컨텍스트 제공.
 *
 * Global provider wrapper supplying React Query client and Toast context.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ResultModalProvider>{children}</ResultModalProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
