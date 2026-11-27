// Shared types, business rules and the default package catalogue.
// All live/sample records (users, team, transactions, news, notifications) come from Supabase.
import kettle from "@/assets/p_kettle.webp";
import iron from "@/assets/p_iron.webp";
import blender from "@/assets/p_blender.webp";
import rice from "@/assets/p_ricecooker.webp";
import microwave from "@/assets/p_microwave.webp";
import washer from "@/assets/p_washer.webp";
import fridge from "@/assets/p_fridge.webp";
import pack from "@/assets/p_package.webp";
import heroKitchen from "@/assets/hero_family_kitchen.webp";
import heroLaundry from "@/assets/hero_laundry.webp";
import heroFriends from "@/assets/hero_friends.webp";
import type { ReferralLevel, ReferralSettings } from "./referral";

export type Appliance = { id: string; tier: number; name: string; price: number; dailyPayout: number; image: string; short: string; details: string[] };

export const rewardRules = {
  registrationBonus: 300,
  minimumWithdrawal: 50,
  withdrawalFeePercent: 10,
  /** Each active package pays daily income for this many days. */
  packageDurationDays: 45,
  withdrawalDays: "Monday – Saturday",
  withdrawalHours: "3:00 AM – 11:00 PM",
  withdrawalProcessing: "1–48 Hours",
  withdrawalFrequency: "Once per day",
} as const;

/** 10% one-time recruitment bonus (Level 1) + 8% / 3% / 1% daily team commission (A / B / C). */
export const referralRules: ReferralSettings = {
  recruitmentBonusPercent: 10,
  dailyCommissionPercentByLevel: [8, 3, 1],
};

/** Tiers from this number upward start locked; the admin can change each package. */
export const LOCKED_FROM_TIER = 5;
export const defaultPackageImage = pack;
export const isLocked = (a: Appliance) => a.tier >= LOCKED_FROM_TIER;

/** Default catalogue used as an SSR seed; the live list is loaded from Supabase `packages`. */
export const appliances: Appliance[] = [
  { id: "starter", tier: 1, name: "Electric Kettle", price: 1300, dailyPayout: 59.8, image: kettle, short: "Everyday essentials to begin your CAS journey.", details: ["Entry-level package", "Contents confirmed by CAS admin", "Fast processing"] },
  { id: "basic", tier: 2, name: "Steam Iron", price: 4200, dailyPayout: 193.2, image: iron, short: "Practical helpers for daily home care.", details: ["Small home appliance tier", "Contents confirmed by CAS admin", "Standard support"] },
  { id: "kitchen", tier: 3, name: "Blender", price: 12500, dailyPayout: 575, image: blender, short: "Upgrade your kitchen routine.", details: ["Kitchen appliance tier", "Contents confirmed by CAS admin", "Priority support"] },
  { id: "family", tier: 4, name: "Rice Cooker", price: 18000, dailyPayout: 828, image: rice, short: "Made for busy family homes.", details: ["Family tier", "Contents confirmed by CAS admin", "Priority support"] },
  { id: "comfort", tier: 5, name: "Comfort Package", price: 35000, dailyPayout: 1610, image: microwave, short: "Comfort and convenience, every day.", details: ["Mid-size appliance tier", "Contents confirmed by CAS admin", "Dedicated support"] },
  { id: "premium", tier: 6, name: "Premium Package", price: 75000, dailyPayout: 3450, image: washer, short: "Large appliances for a modern home.", details: ["Large appliance tier", "Contents confirmed by CAS admin", "Dedicated support"] },
  { id: "elite", tier: 7, name: "Elite Package", price: 150000, dailyPayout: 6900, image: fridge, short: "Top-tier appliances for refined living.", details: ["Elite tier", "Contents confirmed by CAS admin", "VIP support"] },
  { id: "ultimate", tier: 8, name: "Ultimate Home Package", price: 300000, dailyPayout: 13800, image: pack, short: "The complete CAS home experience.", details: ["Full home tier", "Contents confirmed by CAS admin", "VIP support"] },
];
export const initialLockedIds = appliances.filter((a) => a.tier >= LOCKED_FROM_TIER).map((a) => a.id);

/** Headline plans for the new-member announcement. Totals use the exact payout, not the rounded daily figure. */
export const vipPlans = appliances.slice(0, 2).map((a) => ({
  level: `VIP${a.tier}`,
  investment: a.price,
  dailyReturn: Math.round(a.dailyPayout),
  duration: `${rewardRules.packageDurationDays} Days`,
  totalReturn: Math.round(a.dailyPayout * rewardRules.packageDurationDays),
}));

export const depositAccount = { name: "Tegene", bank: "CBE", account: "1000604178669" } as const;

export const heroSlides = [
  { image: heroKitchen, title: "Make Your Home Better with CAS", subtitle: "Discover quality appliances for a better everyday life.", cta: "Explore Appliances", to: "/appliances" as const },
  { image: heroLaundry, title: "Your Dream Home Starts Here", subtitle: "Find the appliances that make life easier.", cta: "Shop Now", to: "/appliances" as const },
  { image: heroFriends, title: "Invite Friends. Earn Rewards.", subtitle: "Share CAS with friends and enjoy referral bonuses.", cta: "Invite Friends", to: "/team" as const },
];

export type TxType = "Registration bonus" | "Recruitment bonus" | "Team commission" | "Task reward" | "Daily income" | "Purchase" | "Deposit" | "Adjustment";

export type TeamMember = {
  name: string;
  joined: string;
  status: "Active" | "Pending";
  /** 1 = direct recruit (A), 2 = their recruit (B), 3 = their recruit (C). */
  level: ReferralLevel;
  /** Highest approved package tier owned by this member. */
  vip: number;
  applianceId: string;
  packagePrice: number;
  dailyIncome: number;
  daysActive: number;
};

export type TaskStatus = "Available" | "In Progress" | "Under Review" | "Completed";
/** Bonus tasks are admin-created only; none are seeded by default. */
export const initialTasks: { id: string; title: string; desc: string; reward: number; status: TaskStatus; icon: string }[] = [];

export type NewsItem = { id: string; title: string; date: string; image: string; tag: string; body: string };
export const defaultNewsImage = heroKitchen;

export type AdminUser = {
  id: string;
  name: string;
  phone: string;
  joined: string;
  status: "Active" | "Banned";
  balance: number;
  purchases: { id: string; applianceId: string; status: "Pending" | "Approved" | "Rejected"; date: string }[];
  deposits: { id: string; amount: number; date: string; method: string; status: "Completed" | "Pending" }[];
  history: { id: string; type: TxType; amount: number; date: string; status: "Completed" | "Pending" }[];
};
