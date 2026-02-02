import { type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "outline" | "ghost";
type ButtonSize = "sm" | "default" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const baseClasses = "font-medium rounded-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-indigo-500 text-white border-none hover:bg-indigo-600",
  secondary: "bg-transparent text-indigo-600 dark:text-indigo-500 border border-indigo-500 hover:bg-indigo-500/10",
  success: "bg-green-500 text-white border-none hover:bg-green-600",
  danger: "bg-red-500 text-white border-none hover:bg-red-600",
  outline: "bg-transparent border border-gray-400 dark:border-gray-500 text-gray-700 dark:text-gray-300 hover:border-red-500 hover:text-red-500",
  ghost: "bg-transparent border-none p-0 underline text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-xs px-2 py-0.5",
  default: "text-sm px-2 py-1",
  lg: "text-base px-4 py-2",
};

export function Button({ variant = "primary", size = "default", fullWidth = false, className = "", children, ...props }: ButtonProps) {
  const classes = [baseClasses, variantClasses[variant], sizeClasses[size], fullWidth && "w-full", className]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
