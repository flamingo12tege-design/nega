// Sample data only — the app is not connected to a backend yet.
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
  minimumWithdrawal: 300,
  withdrawalFeePercent: 10,
  /** Each active package pays daily income for this many days. */
  packageDurationDays: 90,
} as const;

/** 6% one-time recruitment bonus + 6% / 4% / 2% daily team commission (A / B / C). */
export const referralRules: ReferralSettings = {
  recruitmentBonusPercent: 6,
  dailyCommissionPercentByLevel: [6, 4, 2],
};

/** Tiers from this number upward start locked; the admin can change each package. */
export const LOCKED_FROM_TIER = 5;
export const defaultPackageImage = pack;
export const isLocked = (a: Appliance) => a.tier >= LOCKED_FROM_TIER;

export const appliances: Appliance[] = [
  { id: "starter", tier: 1, name: "Starter Package", price: 800, dailyPayout: 120, image: kettle, short: "Everyday essentials to begin your CAS journey.", details: ["Entry-level package", "Contents confirmed by CAS admin", "Fast processing"] },
  { id: "basic", tier: 2, name: "Basic Package", price: 2000, dailyPayout: 300, image: iron, short: "Practical helpers for daily home care.", details: ["Small home appliance tier", "Contents confirmed by CAS admin", "Standard support"] },
  { id: "kitchen", tier: 3, name: "Kitchen Package", price: 5000, dailyPayout: 750, image: blender, short: "Upgrade your kitchen routine.", details: ["Kitchen appliance tier", "Contents confirmed by CAS admin", "Priority support"] },
  { id: "family", tier: 4, name: "Family Package", price: 12000, dailyPayout: 1800, image: rice, short: "Made for busy family homes.", details: ["Family tier", "Contents confirmed by CAS admin", "Priority support"] },
  { id: "comfort", tier: 5, name: "Comfort Package", price: 35000, dailyPayout: 5250, image: microwave, short: "Comfort and convenience, every day.", details: ["Mid-size appliance tier", "Contents confirmed by CAS admin", "Dedicated support"] },
  { id: "premium", tier: 6, name: "Premium Package", price: 75000, dailyPayout: 11250, image: washer, short: "Large appliances for a modern home.", details: ["Large appliance tier", "Contents confirmed by CAS admin", "Dedicated support"] },
  { id: "elite", tier: 7, name: "Elite Package", price: 150000, dailyPayout: 22500, image: fridge, short: "Top-tier appliances for refined living.", details: ["Elite tier", "Contents confirmed by CAS admin", "VIP support"] },
  { id: "ultimate", tier: 8, name: "Ultimate Home Package", price: 300000, dailyPayout: 45000, image: pack, short: "The complete CAS home experience.", details: ["Full home tier", "Contents confirmed by CAS admin", "VIP support"] },
];
export const initialLockedIds = appliances.filter((a) => a.tier >= LOCKED_FROM_TIER).map((a) => a.id);

export const depositAccount = { name: "Tegene", bank: "CBE", account: "1000604178669" } as const;

export const heroSlides = [
  { image: heroKitchen, title: "Make Your Home Better with CAS", subtitle: "Discover quality appliances for a better everyday life.", cta: "Explore Appliances", to: "/appliances" as const },
  { image: heroLaundry, title: "Your Dream Home Starts Here", subtitle: "Find the appliances that make life easier.", cta: "Shop Now", to: "/appliances" as const },
  { image: heroFriends, title: "Invite Friends. Earn Rewards.", subtitle: "Share CAS with friends and enjoy referral bonuses.", cta: "Invite Friends", to: "/team" as const },
];

export const user = {
  phone: "+251 911 234 567",
  email: "selam@example.com",
  memberId: "CAS-100482",
  joined: "2026-08-14",
  referralCode: "CAS482",
  wallet: { available: 1250, registrationBonus: rewardRules.registrationBonus, referralBonus: 450 },
  earnings: { thisWeek: 897.61, thisMonth: 897.61, teamBonus: 4309.53, payIncome: 5900, totalRevenue: 22951, totalWithdrawal: 22122 },
};

export type TxType = "Registration bonus" | "Recruitment bonus" | "Team commission" | "Task reward" | "Daily income" | "Purchase" | "Deposit" | "Adjustment";
export const transactions: { id: string; type: TxType; amount: number; date: string; status: "Completed" | "Pending" }[] = [
  { id: "t1", type: "Registration bonus", amount: rewardRules.registrationBonus, date: "2026-08-14", status: "Completed" },
  { id: "t2", type: "Deposit", amount: 2000, date: "2026-08-16", status: "Completed" },
  { id: "t3", type: "Purchase", amount: -800, date: "2026-08-17", status: "Completed" },
  { id: "t4", type: "Recruitment bonus", amount: 120, date: "2026-09-02", status: "Completed" },
  { id: "t5", type: "Team commission", amount: 25.2, date: "2026-09-20", status: "Completed" },
  { id: "t6", type: "Task reward", amount: 50, date: "2026-10-05", status: "Completed" },
  { id: "t7", type: "Team commission", amount: 25.2, date: "2026-11-01", status: "Pending" },
];

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

const member = (
  name: string,
  joined: string,
  status: TeamMember["status"],
  level: ReferralLevel,
  vip: number,
  applianceId: string,
  daysActive: number,
): TeamMember => {
  const appliance = appliances.find((a) => a.id === applianceId)!;
  return { name, joined, status, level, vip, applianceId, packagePrice: appliance.price, dailyIncome: appliance.dailyPayout, daysActive };
};

export const team: TeamMember[] = [
  member("CAS-100513", "2026-09-02", "Active", 1, 1, "basic", 40),
  member("CAS-100547", "2026-09-20", "Active", 2, 1, "starter", 25),
  member("CAS-100602", "2026-11-01", "Pending", 1, 0, "starter", 0),
  // VIP 2 > your VIP 1: no reward from this member, but they keep their own commission.
  member("CAS-100618", "2026-11-10", "Active", 3, 2, "kitchen", 10),
  member("CAS-100701", "2026-11-12", "Active", 3, 1, "starter", 5),
];

export type TaskStatus = "Available" | "In Progress" | "Under Review" | "Completed";
/** Bonus tasks are admin-created only; none are seeded by default. */
export const initialTasks: { id: string; title: string; desc: string; reward: number; status: TaskStatus; icon: string }[] = [];

export type NewsItem = { id: string; title: string; date: string; image: string; tag: string; body: string };
export const news: NewsItem[] = [
  { id: "n1", title: "CAS launches eight new appliance packages", date: "2026-11-15", image: heroKitchen, tag: "Product update", body: "We are excited to introduce our refreshed lineup of eight appliance packages, from everyday essentials to complete home packages. Each package is reviewed by our team to ensure quality and value for every Ethiopian home." },
  { id: "n2", title: "Referral rewards now credited faster", date: "2026-11-05", image: heroFriends, tag: "Promotion", body: "Referral bonuses are now reviewed and credited within 24 hours after your friend's registration is verified. Keep sharing CAS with your friends and family." },
  { id: "n3", title: "Laundry made simple with CAS", date: "2026-10-22", image: heroLaundry, tag: "Company news", body: "Modern washing machines save families hours every week. Learn how our Premium Package can bring this convenience into your home." },
];
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

export const adminUsers: AdminUser[] = [
  {
    id: "CAS-100482", name: "Selam Tesfaye", phone: "+251 911 234 567", joined: "2026-08-14", status: "Active", balance: 1250,
    purchases: [{ id: "p1", applianceId: "starter", status: "Approved", date: "2026-08-17" }],
    deposits: [{ id: "d1", amount: 2000, date: "2026-08-16", method: "CBE Birr", status: "Completed" }],
    history: [
      { id: "h1", type: "Registration bonus", amount: 300, date: "2026-08-14", status: "Completed" },
      { id: "h2", type: "Deposit", amount: 2000, date: "2026-08-16", status: "Completed" },
      { id: "h3", type: "Purchase", amount: -800, date: "2026-08-17", status: "Completed" },
      { id: "h4", type: "Recruitment bonus", amount: 120, date: "2026-09-02", status: "Completed" },
    ],
  },
  {
    id: "CAS-100513", name: "Alemayehu Bekele", phone: "+251 912 345 678", joined: "2026-09-02", status: "Active", balance: 340,
    purchases: [{ id: "p2", applianceId: "basic", status: "Approved", date: "2026-09-02" }],
    deposits: [{ id: "d2", amount: 2000, date: "2026-09-01", method: "CBE Birr", status: "Completed" }],
    history: [
      { id: "h5", type: "Deposit", amount: 2000, date: "2026-09-01", status: "Completed" },
      { id: "h6", type: "Purchase", amount: -2000, date: "2026-09-02", status: "Completed" },
      { id: "h7", type: "Daily income", amount: 300, date: "2026-11-18", status: "Completed" },
    ],
  },
  {
    id: "CAS-100547", name: "Birtakan Gemechu", phone: "+251 913 456 789", joined: "2026-09-20", status: "Active", balance: 80,
    purchases: [{ id: "p3", applianceId: "starter", status: "Approved", date: "2026-09-21" }],
    deposits: [{ id: "d3", amount: 800, date: "2026-09-20", method: "CBE Birr", status: "Completed" }],
    history: [
      { id: "h8", type: "Deposit", amount: 800, date: "2026-09-20", status: "Completed" },
      { id: "h9", type: "Purchase", amount: -800, date: "2026-09-21", status: "Completed" },
    ],
  },
  {
    id: "CAS-100602", name: "Chala Fikru", phone: "+251 914 567 890", joined: "2026-11-01", status: "Active", balance: 0,
    purchases: [{ id: "p4", applianceId: "starter", status: "Pending", date: "2026-11-01" }],
    deposits: [{ id: "d4", amount: 800, date: "2026-11-01", method: "CBE Birr", status: "Pending" }],
    history: [{ id: "h10", type: "Deposit", amount: 800, date: "2026-11-01", status: "Pending" }],
  },
  {
    id: "CAS-100618", name: "Desta Tsegaye", phone: "+251 915 678 901", joined: "2026-11-10", status: "Banned", balance: 25,
    purchases: [{ id: "p5", applianceId: "kitchen", status: "Approved", date: "2026-11-10" }],
    deposits: [{ id: "d5", amount: 5000, date: "2026-11-09", method: "CBE Birr", status: "Completed" }],
    history: [
      { id: "h11", type: "Deposit", amount: 5000, date: "2026-11-09", status: "Completed" },
      { id: "h12", type: "Purchase", amount: -5000, date: "2026-11-10", status: "Completed" },
    ],
  },
  {
    id: "CAS-100671", name: "Eyerusalem Lemma", phone: "+251 916 789 012", joined: "2026-10-03", status: "Active", balance: 620,
    purchases: [{ id: "p6", applianceId: "kitchen", status: "Approved", date: "2026-10-04" }],
    deposits: [{ id: "d6", amount: 5000, date: "2026-10-03", method: "CBE Birr", status: "Completed" }],
    history: [
      { id: "h13", type: "Deposit", amount: 5000, date: "2026-10-03", status: "Completed" },
      { id: "h14", type: "Purchase", amount: -5000, date: "2026-10-04", status: "Completed" },
      { id: "h15", type: "Daily income", amount: 750, date: "2026-11-19", status: "Completed" },
    ],
  },
  {
    id: "CAS-100684", name: "Fikadu Hailu", phone: "+251 917 890 123", joined: "2026-11-04", status: "Active", balance: 0,
    purchases: [{ id: "p7", applianceId: "starter", status: "Pending", date: "2026-11-04" }],
    deposits: [{ id: "d7", amount: 800, date: "2026-11-04", method: "CBE Birr", status: "Pending" }],
    history: [{ id: "h16", type: "Deposit", amount: 800, date: "2026-11-04", status: "Pending" }],
  },
  {
    id: "CAS-100699", name: "Genet Assefa", phone: "+251 918 901 234", joined: "2026-10-18", status: "Active", balance: 2100,
    purchases: [{ id: "p8", applianceId: "basic", status: "Approved", date: "2026-10-19" }],
    deposits: [{ id: "d8", amount: 2000, date: "2026-10-18", method: "CBE Birr", status: "Completed" }],
    history: [
      { id: "h17", type: "Deposit", amount: 2000, date: "2026-10-18", status: "Completed" },
      { id: "h18", type: "Purchase", amount: -2000, date: "2026-10-19", status: "Completed" },
      { id: "h19", type: "Daily income", amount: 300, date: "2026-11-17", status: "Completed" },
    ],
  },
  {
    id: "CAS-100721", name: "Haji Mohammed", phone: "+251 919 012 345", joined: "2026-09-11", status: "Banned", balance: 45,
    purchases: [{ id: "p9", applianceId: "starter", status: "Approved", date: "2026-09-12" }],
    deposits: [{ id: "d9", amount: 800, date: "2026-09-11", method: "CBE Birr", status: "Completed" }],
    history: [
      { id: "h20", type: "Deposit", amount: 800, date: "2026-09-11", status: "Completed" },
      { id: "h21", type: "Purchase", amount: -800, date: "2026-09-12", status: "Completed" },
    ],
  },
  {
    id: "CAS-100745", name: "Iris Teshome", phone: "+251 913 111 222", joined: "2026-08-29", status: "Active", balance: 9800,
    purchases: [{ id: "p10", applianceId: "family", status: "Approved", date: "2026-08-30" }],
    deposits: [{ id: "d10", amount: 12000, date: "2026-08-29", method: "CBE Birr", status: "Completed" }],
    history: [
      { id: "h22", type: "Deposit", amount: 12000, date: "2026-08-29", status: "Completed" },
      { id: "h23", type: "Purchase", amount: -12000, date: "2026-08-30", status: "Completed" },
      { id: "h24", type: "Team commission", amount: 1800, date: "2026-11-16", status: "Completed" },
    ],
  },
  {
    id: "CAS-100780", name: "Jemal Abdella", phone: "+251 914 222 333", joined: "2026-10-25", status: "Active", balance: 150,
    purchases: [{ id: "p11", applianceId: "starter", status: "Approved", date: "2026-10-26" }],
    deposits: [{ id: "d11", amount: 800, date: "2026-10-25", method: "CBE Birr", status: "Completed" }],
    history: [
      { id: "h25", type: "Deposit", amount: 800, date: "2026-10-25", status: "Completed" },
      { id: "h26", type: "Purchase", amount: -800, date: "2026-10-26", status: "Completed" },
    ],
  },
  {
    id: "CAS-100812", name: "Kalkidan Worku", phone: "+251 915 333 444", joined: "2026-11-12", status: "Active", balance: 300,
    purchases: [],
    deposits: [],
    history: [{ id: "h27", type: "Registration bonus", amount: 300, date: "2026-11-12", status: "Completed" }],
  },
];

export const notifications = [
  { id: "x1", title: "Referral bonus pending", body: "CAS-100602 joined with your link. Bonus under review.", date: "2026-11-01", unread: true },
  { id: "x2", title: "Task approved", body: "You earned ETB 50 for a completed task.", date: "2026-10-05", unread: true },
  { id: "x3", title: "Welcome to CAS!", body: "Your registration bonus has been credited. Start exploring your home appliance experience.", date: "2026-08-14", unread: false },
];

export const testimonials = [
  { name: "Tigist A.", city: "Addis Ababa", text: "The process was simple and the support team was always helpful." },
  { name: "Yonas M.", city: "Hawassa", text: "I invited my brothers and we all enjoyed the rewards. Great experience." },
  { name: "Liya K.", city: "Bahir Dar", text: "CAS feels trustworthy and beautifully made. My kitchen looks amazing." },
];
