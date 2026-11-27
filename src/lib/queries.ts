import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export const queryKeys = {
  session: ["auth-session"] as const,
  profile: (userId: string) => ["profile", userId] as const,
  purchases: (userId: string) => ["purchases", userId] as const,
  dailyClaims: (userId: string) => ["daily-claims", userId] as const,
};

export function useSessionUser() {
  const query = useQuery({
    queryKey: queryKeys.session,
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.user ?? null;
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  const user = query.data ?? null;
  return {
    user: user as User | null,
    userId: user?.id ?? null,
    loading: query.isLoading,
  };
}

export type ProfileRow = {
  id: string;
  member_id: string | null;
  phone: string | null;
  role: string | null;
  wallet_balance: number | null;
  referral_code: string | null;
  payout_account: string | null;
  created_at: string | null;
};

export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.profile(userId ?? "anon"),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,member_id,phone,role,wallet_balance,referral_code,payout_account,created_at")
        .eq("id", userId!)
        .maybeSingle();
      return (data ?? null) as ProfileRow | null;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export type PurchaseRow = {
  id: string;
  package_id: string;
  amount: number;
  payment_method: string | null;
  status: string;
  created_at: string;
};

export function usePurchases(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.purchases(userId ?? "anon"),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase
        .from("purchases")
        .select("id,package_id,amount,payment_method,status,created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      return (data ?? []).map((row) => ({
        id: String(row.id),
        package_id: String(row.package_id),
        amount: Number(row.amount) || 0,
        payment_method: row.payment_method ? String(row.payment_method) : null,
        status: String(row.status ?? ""),
        created_at: String(row.created_at ?? ""),
      })) as PurchaseRow[];
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export type DailyClaimRow = {
  id: string;
  amount: number;
  created_at: string;
  reference_id: string | null;
};

export function useDailyClaims(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.dailyClaims(userId ?? "anon"),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase
        .from("wallet_ledger")
        .select("id,amount,created_at,reference_id")
        .eq("user_id", userId!)
        .eq("type", "daily_income")
        .order("created_at", { ascending: false });
      return (data ?? []).map((row) => ({
        id: String(row.id),
        amount: Number(row.amount) || 0,
        created_at: String(row.created_at ?? ""),
        reference_id: row.reference_id ? String(row.reference_id) : null,
      })) as DailyClaimRow[];
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
