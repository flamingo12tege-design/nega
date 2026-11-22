import logo from "@/assets/cas_logo.webp";
export function Logo({ className = "h-9" }: { className?: string }) {
  return <img src={logo} alt="CAS" width={360} height={150} className={`${className} w-auto object-contain`} />;
}
