import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export const queryKeys = {
  session: ["auth-session"] as const,
  profile: (userId: string) => ["profile", userId] as const,
  purchases: (userId: string) => ["purchases", userId] as const,
  dailyClaims: (userId: string) => ["daily-claims", userId] as const,
  teamCommission: ["team-commission"] as const,
  luckyWheelSpins: (userId: string) => ["lucky-wheel-spins", userId] as const,
  luckyWheelJackpot: (userId: string) =>
    ["lucky-wheel-jackpot", userId] as const,
  platformSettings: ["platform-settings"] as const,
  withdrawalSecurity: ["withdrawal-security"] as const,
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
        .select(
          "id,member_id,phone,role,wallet_balance,referral_code,payout_account,created_at",
        )
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
  claim_date: string | null;
  reference_id: string | null;
};

export function useDailyClaims(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.dailyClaims(userId ?? "anon"),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase
        .from("wallet_ledger")
        .select("id,amount,created_at,claim_date,reference_id")
        .eq("user_id", userId!)
        .eq("type", "daily_income")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []).map((row) => ({
        id: String(row.id),
        amount: Number(row.amount) || 0,
        created_at: String(row.created_at ?? ""),
        claim_date: row.claim_date ? String(row.claim_date) : null,
        reference_id: row.reference_id ? String(row.reference_id) : null,
      })) as DailyClaimRow[];
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export type PlatformSettings = Record<string, string>;

/** Cached platform settings. Rules change rarely, so avoid a query per page mount. */
export function usePlatformSettings(keys?: string[]) {
  return useQuery({
    queryKey: keys?.length
      ? ([...queryKeys.platformSettings, keys.join(",")] as const)
      : queryKeys.platformSettings,
    queryFn: async () => {
      let query = supabase.from("platform_settings").select("key,value");
      if (keys?.length) query = query.in("key", keys);
      const { data, error } = await query;
      if (error) throw error;
      return Object.fromEntries(
        (data ?? []).map((row) => [
          String(row.key),
          String(row.value ?? "").trim(),
        ]),
      ) as PlatformSettings;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export type WithdrawalSecurityStatus = {
  hasPassword: boolean;
  hasKeywords: boolean;
  unavailable: boolean;
};

const missingRpc = (message: string) =>
  /could not find the function|does not exist|not found/i.test(message);

/** Shared security-status cache for Profile settings and the withdraw form. */
export function useWithdrawalSecurityStatus() {
  return useQuery({
    queryKey: queryKeys.withdrawalSecurity,
    queryFn: async (): Promise<WithdrawalSecurityStatus> => {
      const { data, error } = await supabase.rpc("withdrawal_security_status");
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        return {
          hasPassword: row?.has_password === true,
          hasKeywords: row?.has_keywords === true,
          unavailable: false,
        };
      }

      // Fallback for databases that only have the original password RPC.
      const { data: legacy, error: legacyError } = await supabase.rpc(
        "has_withdrawal_password",
      );
      if (legacyError) throw legacyError;
      return {
        hasPassword: legacy === true,
        hasKeywords: false,
        unavailable: missingRpc(error.message),
      };
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export type LuckyWheelSpinsStatus = {
  available: number;
  error: string | null;
  unavailable: boolean;
};

/** Earned spins for the signed-in member. Errors resolve to zero so no free spin is offered. */
export function useLuckyWheelSpins(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.luckyWheelSpins(userId ?? "anon"),
    enabled: Boolean(userId),
    queryFn: async (): Promise<LuckyWheelSpinsStatus> => {
      const { data, error } = await supabase.rpc("lucky_wheel_spins_available");
      if (error) {
        return {
          available: 0,
          error: error.message,
          unavailable: missingRpc(error.message),
        };
      }
      return {
        available: Math.max(0, Number(data) || 0),
        error: null,
        unavailable: false,
      };
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** ETB 2,000 is reserved for locked-package / upper-tier VIP members. */
export function useLuckyWheelJackpot(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.luckyWheelJackpot(userId ?? "anon"),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "lucky_wheel_jackpot_unlocked",
      );
      if (error) return false;
      return data === true;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
}
