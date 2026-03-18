"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useBreakRule, useUpsertBreakRule } from "@/hooks/useBreakRules";
import { useStore } from "@/hooks/useStores";
import { Button, Card, Input, Select } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { parseApiError } from "@/lib/utils";

export default function BreakRulesPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const storeId = params.id as string;

  const { data: store } = useStore(storeId);
  const { data: breakRule, isLoading } = useBreakRule(storeId);
  const upsertMut = useUpsertBreakRule();

  const [maxContinuous, setMaxContinuous] = useState("240");
  const [breakDuration, setBreakDuration] = useState("30");
  const [maxDaily, setMaxDaily] = useState("480");
  const [calcBasis, setCalcBasis] = useState("per_store");

  useEffect(() => {
    if (breakRule) {
      setMaxContinuous(String(breakRule.max_continuous_minutes));
      setBreakDuration(String(breakRule.break_duration_minutes));
      setMaxDaily(String(breakRule.max_daily_work_minutes));
      setCalcBasis(breakRule.work_hour_calc_basis);
    }
  }, [breakRule]);

  const handleSave = async () => {
    try {
      await upsertMut.mutateAsync({
        storeId,
        data: {
          max_continuous_minutes: parseInt(maxContinuous) || 240,
          break_duration_minutes: parseInt(breakDuration) || 30,
          max_daily_work_minutes: parseInt(maxDaily) || 480,
          work_hour_calc_basis: calcBasis,
        },
      });
      toast({ type: "success", message: "Break rules saved" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to save break rules") });
    }
  };

  if (isLoading) {
    return (
      <Card padding="p-16">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full border-accent border-t-transparent h-6 w-6 border-2" />
        </div>
      </Card>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push(`/stores/${storeId}`)}
          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-extrabold text-text">Break Rules</h1>
          <p className="text-sm text-text-muted mt-0.5">{store?.name ?? "Store"}</p>
        </div>
      </div>

      <Card padding="p-6" className="max-w-lg">
        <div className="space-y-4">
          <Input
            label="Max Continuous Work (minutes)"
            type="number"
            value={maxContinuous}
            onChange={(e) => setMaxContinuous(e.target.value)}
            min={0}
          />
          <Input
            label="Break Duration (minutes)"
            type="number"
            value={breakDuration}
            onChange={(e) => setBreakDuration(e.target.value)}
            min={0}
          />
          <Input
            label="Max Daily Work (minutes)"
            type="number"
            value={maxDaily}
            onChange={(e) => setMaxDaily(e.target.value)}
            min={0}
          />
          <Select
            label="Work Hour Calculation Basis"
            options={[
              { value: "per_store", label: "Per Store" },
              { value: "total", label: "Total (All Stores)" },
            ]}
            value={calcBasis}
            onChange={(e) => setCalcBasis(e.target.value)}
          />
          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={handleSave} disabled={upsertMut.isPending}>
              {upsertMut.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
