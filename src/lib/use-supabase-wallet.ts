import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type WalletLedgerRow = {
  id: string;
  amount: number;
  type: string;
  status: string;
  created_at: string;
};

export type WalletSummary = {
  balance: number;
  thisWeek: number;
  thisMonth: number;
  teamBonus: number;
  payIncome: number;
  totalRevenue: number;
  totalWithdrawal: number;
  ledger: WalletLedgerRow[];
};

const empty: WalletSummary = {
  balance: 0,
  thisWeek: 0,
  thisMonth: 0,
  teamBonus: 0,
  payIncome: 0,
  totalRevenue: 0,
  totalWithdrawal: 0,
  ledger: [],
};

const startOfWeek = () => {
  const date = new Date();
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - diff);
  return date;
};

const startOfMonth = () => {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
};

export function useSupabaseWallet() {
  const [summary, setSummary] = useState<WalletSummary>(empty);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        if (active) setLoading(false);
        return;
      }

      const [{ data: profile }, { data: ledger }] = await Promise.all([
        supabase.from("profiles").select("wallet_balance").eq("id", userId).maybeSingle(),
        supabase
          .from("wallet_ledger")
          .select("id,amount,type,status,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      ]);

      if (!active) return;

      const rows: WalletLedgerRow[] = (ledger ?? []).map((row) => ({
        id: row.id,
        amount: Number(row.amount) || 0,
        type: String(row.type),
        status: String(row.status ?? "completed"),
        created_at: row.created_at,
      }));

      const week = startOfWeek();
      const month = startOfMonth();
      const incomeTypes = new Set(["daily_income", "team_commission", "referral_bonus", "recruitment_bonus", "commission", "deposit", "recharge"]);

      const completedRows = rows.filter((row) => row.status === "completed");
      const incomeRows = completedRows.filter((row) => incomeTypes.has(row.type));
      const positiveRows = completedRows.filter((row) => row.amount > 0);
      const teamRows = completedRows.filter((row) => ["team_commission", "referral_bonus", "recruitment_bonus", "commission"].includes(row.type));
      const payRows = completedRows.filter((row) => ["daily_income", "pay_income"].includes(row.type));
      const withdrawalRows = completedRows.filter((row) => row.type === "withdrawal");

      const sum = (items: WalletLedgerRow[]) => items.reduce((total, row) => total + Math.abs(row.amount), 0);
      const sumInPeriod = (items: WalletLedgerRow[], start: Date) =>
        items.filter((row) => new Date(row.created_at) >= start).reduce((total, row) => total + Math.abs(row.amount), 0);

      setSummary({
        balance: Number(profile?.wallet_balance) || 0,
        thisWeek: sumInPeriod(incomeRows, week),
        thisMonth: sumInPeriod(incomeRows, month),
        teamBonus: sum(teamRows),
        payIncome: sum(payRows),
        totalRevenue: sum(positiveRows),
        totalWithdrawal: sum(withdrawalRows),
        ledger: rows,
      });
      setLoading(false);
    };

    void load();

    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return { ...summary, loading };
}
