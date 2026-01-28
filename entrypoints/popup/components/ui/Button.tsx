import { type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "outline" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

const baseClasses =
  "text-sm font-medium rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-indigo-500 text-white border-none hover:bg-indigo-600",
  secondary:
    "bg-transparent text-indigo-500 border border-indigo-500 hover:bg-indigo-500/10",
  success:
    "bg-green-500 text-white border-none hover:bg-green-600",
  danger:
    "bg-red-500 text-white border-none hover:bg-red-600",
  outline:
    "bg-transparent border border-gray-500 hover:border-red-500 hover:text-red-500",
  ghost:
    "bg-transparent border-none p-0 underline text-indigo-400 hover:text-indigo-300",
};

const sizeClasses = {
  default: "px-2 py-1",
  fullWidth: "w-full py-2 px-4",
};

export function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const classes = [
    baseClasses,
    variantClasses[variant],
    fullWidth ? sizeClasses.fullWidth : sizeClasses.default,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
