import React from 'react';
import { Loader2 } from 'lucide-react';

export const Button = ({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'ghost' | 'danger'
  size = 'md',        // 'sm' | 'md'
  isLoading = false,
  disabled = false,
  className = '',
  type = 'button',
  icon: Icon,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-colors select-none focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';

  const sizeClasses = {
    sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
    md: 'h-9 px-4 text-sm gap-2 rounded-md',
  }[size] || 'h-9 px-4 text-sm gap-2 rounded-md';

  const variantClasses = {
    primary:
      'bg-gray-900 hover:bg-gray-800 text-white shadow-xs focus:ring-gray-900',
    indigo:
      'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs focus:ring-indigo-500',
    secondary:
      'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-2xs hover:border-gray-300 focus:ring-gray-300',
    outline:
      'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-2xs hover:border-gray-300 focus:ring-gray-300',
    ghost:
      'text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:ring-gray-400',
    danger:
      'bg-red-600 hover:bg-red-700 text-white shadow-xs focus:ring-red-600',
  }[variant] || 'bg-gray-900 hover:bg-gray-800 text-white';

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : Icon ? (
        <Icon className="w-4 h-4 text-current shrink-0" />
      ) : null}
      <span>{children}</span>
    </button>
  );
};

export default Button;
