import React from 'react';

export const Badge = ({
  status = 'pending', // 'delivered' | 'retrying' | 'failed' | 'pending' | 'active' | 'neutral'
  label,
  children,
  className = '',
}) => {
  const norm = (status || '').toLowerCase();

  const styles = {
    delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    retrying: 'bg-amber-50 text-amber-700 border-amber-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    pending: 'bg-gray-100 text-gray-700 border-gray-200',
    active: 'bg-blue-50 text-blue-700 border-blue-200',
    neutral: 'bg-gray-100 text-gray-700 border-gray-200',
  }[norm] || 'bg-gray-100 text-gray-700 border-gray-200';

  const dotColors = {
    delivered: 'bg-emerald-500',
    success: 'bg-emerald-500',
    retrying: 'bg-amber-500',
    warning: 'bg-amber-500',
    failed: 'bg-red-500',
    error: 'bg-red-500',
    pending: 'bg-gray-400',
    active: 'bg-blue-500',
    neutral: 'bg-gray-400',
  }[norm] || 'bg-gray-400';

  const displayText = label || children || status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${styles} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColors}`} />
      <span>{displayText}</span>
    </span>
  );
};

export default Badge;
