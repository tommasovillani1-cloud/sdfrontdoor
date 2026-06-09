import { cn } from "@/lib/utils";

/**
 * Element Six logo. Two variants from the brand assets:
 *  - "light" wordmark for light backgrounds
 *  - "dark" wordmark (on its blue plate) for dark surfaces like the sidebar
 */
export function Logo({
  variant = "light",
  className,
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  const src =
    variant === "dark"
      ? "/brand/e6-logo-dark.jpg"
      : "/brand/e6-logo-light.jpg";
  return (
    <img
      src={src}
      alt="Element Six, De Beers Group"
      className={cn("h-auto w-auto select-none", className)}
      draggable={false}
    />
  );
}
