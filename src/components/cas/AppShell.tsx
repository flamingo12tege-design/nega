import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutGrid, Users, ListChecks, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

const nav = [
	{ to: "/", label: "Home", icon: Home },
	{ to: "/appliances", label: "VIP", icon: LayoutGrid },
	{ to: "/team", label: "Team", icon: Users },
	{ to: "/tasks", label: "Tasks", icon: ListChecks },
	{ to: "/profile", label: "Profile", icon: UserRound },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
	const path = useRouterState({ select: (s) => s.location.pathname });
	const bare =
		path.startsWith("/login") ||
		path.startsWith("/register") ||
		path.startsWith("/admin") ||
		path.startsWith("/casadmin") ||
		// Result screens are full-page confirmations: no shell, no bottom nav.
		path.startsWith("/recharge/success") ||
		path.startsWith("/withdraw/success");
	if (bare) return <>{children}</>;
	const active = (to: string) => (to === "/" ? path === "/" : path.startsWith(to));

	return (
		<div className="min-h-screen lg:flex">
			<aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar p-6 text-sidebar-foreground lg:flex">
				<div className="rounded-2xl bg-background p-3">
					<Logo className="h-10 mx-auto" />
				</div>
				<nav className="mt-8 flex flex-col gap-1">
					{nav.map(({ to, label, icon: Icon }) => (
						<Link
							key={to}
							to={to}
							className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${
								active(to)
									? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
									: "hover:translate-x-1 hover:bg-sidebar-accent"
							}`}
						>
							<Icon className="h-5 w-5" /> {label}
						</Link>
					))}
				</nav>
			</aside>
			<main
				key={path}
				className="fade mx-auto w-full max-w-5xl pb-28 lg:pb-10"
			>
				{children}
			</main>
			<nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur lg:hidden">
				<div className="mx-auto grid max-w-lg grid-cols-5 px-2 pt-2">
					{nav.map(({ to, label, icon: Icon }) => {
						const on = active(to);
						return (
							<Link
								key={to}
								to={to}
								className="press flex flex-col items-center gap-1 py-1"
							>
								<span
									className={`grid h-8 w-12 place-items-center rounded-full transition-colors ${
										on
											? "bg-accent text-accent-foreground"
											: "text-muted-foreground"
									}`}
								>
									<Icon className="h-5 w-5" strokeWidth={on ? 2.4 : 2} />
								</span>
								<span
									className={`text-[11px] font-semibold ${
										on ? "text-primary" : "text-muted-foreground"
									}`}
								>
									{label}
								</span>
							</Link>
						);
					})}
				</div>
			</nav>
		</div>
	);
}

export function PageHeader({
	title,
	subtitle,
	back,
}: {
	title: string;
	subtitle?: string;
	back?: boolean;
}) {
	return (
		<header className="bg-primary px-5 pb-8 pt-6 text-primary-foreground lg:rounded-b-3xl">
			{back && (
				<button
					onClick={() => history.back()}
					className="mb-3 text-sm opacity-80"
				>
					← Back
				</button>
			)}
			<h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
			{subtitle && (
				<p className="mt-1 text-sm opacity-75">{subtitle}</p>
			)}
		</header>
	);
}

export function Section({
	title,
	action,
	children,
}: {
	title: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="mt-8 px-5">
			<div className="mb-3 flex items-end justify-between gap-3">
				<h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
				{action}
			</div>
			{children}
		</section>
	);
}
