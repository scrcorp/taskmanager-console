"use client";

/**
 * 매장 재고 리다이렉트 페이지.
 *
 * Redirects to the first store's inventory page.
 * If no stores are available, shows a placeholder.
 */

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStores } from "@/hooks/useStores";
import { LoadingSpinner, Card } from "@/components/ui";

export default function StoreInventoryRedirectPage(): React.ReactElement {
  const router = useRouter();
  const { data: stores, isLoading } = useStores();

  useEffect(() => {
    if (stores && stores.length > 0) {
      router.replace(`/inventory/stores/${stores[0].id}`);
    }
  }, [stores, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isLoading && (!stores || stores.length === 0)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card padding="p-8">
          <p className="text-text-secondary text-center">
            No stores found. Create a store first to manage inventory.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-64">
      <LoadingSpinner />
    </div>
  );
}
