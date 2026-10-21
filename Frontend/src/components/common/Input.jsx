import React from 'react';

export const Input = ({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  helperText,
  error,
  autoComplete,
  className = '',
  disabled = false,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="space-y-1.5 text-left">
      {label && (
        <div className="flex items-center justify-between">
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700"
          >
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          {error && (
            <span className="text-xs text-red-600 font-medium">{error}</span>
          )}
        </div>
      )}

      <input
        id={inputId}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        className={`w-full h-9 px-3 text-sm bg-white border rounded-md text-gray-900 placeholder:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1 disabled:bg-gray-50 disabled:text-gray-400 ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
            : 'border-gray-300 focus:border-gray-900'
        } ${className}`}
        {...props}
      />

      {helperText && !error && (
        <p className="text-xs text-gray-500 leading-normal">{helperText}</p>
      )}
    </div>
  );
};

export default Input;
