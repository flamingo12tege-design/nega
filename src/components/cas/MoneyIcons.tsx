type IconProps = { className?: string | undefined };

/** Blue wallet with a gold coin and an add badge — used for deposits. */
export function DepositIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      {/* Card / wallet */}
      <rect x="4" y="19" width="34" height="22" rx="4" fill="#2F80C9" />
      <path d="M4 24h34v4H4z" fill="#1F65A6" />
      <rect x="8" y="31" width="12" height="3" rx="1.5" fill="#8FC6F0" opacity="0.85" />
      {/* Coin */}
      <circle cx="22" cy="15" r="10" fill="#E8A317" />
      <circle cx="22" cy="15" r="7.5" fill="#FFD24A" stroke="#C8860B" strokeWidth="1.2" />
      <text x="22" y="19.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="#8A5A05">$</text>
      {/* Plus badge */}
      <circle cx="38" cy="36" r="7" fill="#2F80C9" stroke="#fff" strokeWidth="1.5" />
      <path d="M38 32.5v7M34.5 36h7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Green card with a dollar sign and a downward arrow — used for withdrawals. */
export function WithdrawIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      {/* Card */}
      <rect x="5" y="5" width="38" height="27" rx="4" fill="#1FA463" />
      <rect x="9" y="9" width="30" height="19" rx="2" fill="#0E7A4A" />
      <path d="M9 14h30" stroke="#48C98A" strokeWidth="1.5" opacity="0.7" />
      <text x="24" y="23.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="#8EE9B8">$</text>
      {/* Down arrow */}
      <path d="M24 31v10" stroke="#E8891E" strokeWidth="4" strokeLinecap="round" />
      <path d="M18 37l6 6 6-6" fill="#F5A623" />
    </svg>
  );
}
