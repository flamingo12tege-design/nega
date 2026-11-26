/**
 * Short-lived withdrawal receipt.
 *
 * The receipt used to travel in the URL (?amount=…&account=…&method=…), which
 * exposed the member's bank number in browser history, screenshots, analytics
 * and the Referer header. It now lives only in this tab's session storage and
 * is consumed (and deleted) by the success page.
 */

const KEY = "cas.withdrawal.receipt.v1";

export type WithdrawalReceipt = {
  amount: number;
  account: string;
  method: string;
};

export function saveWithdrawalReceipt(receipt: WithdrawalReceipt) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...receipt, savedAt: Date.now() }));
  } catch {
    // Storage can be disabled; the success page still shows a generic receipt.
  }
}

export function takeWithdrawalReceipt(): WithdrawalReceipt | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    // One-time read: a refresh or a shared link must never replay the details.
    sessionStorage.removeItem(KEY);

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const amount = Number(parsed["amount"]);
    const account = String(parsed["account"] ?? "");
    const method = String(parsed["method"] ?? "CBE");
    const savedAt = Number(parsed["savedAt"]);

    // Ignore stale, malformed or injected values.
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (!/^\d{13}$/.test(account)) return null;
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > 10 * 60 * 1000) return null;

    return { amount, account, method: method === "CBE" ? method : "CBE" };
  } catch {
    return null;
  }
}
