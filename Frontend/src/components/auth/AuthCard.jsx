import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Button from '../common/Button';
import Input from '../common/Input';
import { Radio } from 'lucide-react';

export const AuthCard = () => {
  const { login, register, authError, setAuthError } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validate = () => {
    let isValid = true;
    setEmailError('');
    setPasswordError('');

    if (!email || !email.includes('@')) {
      setEmailError('Please enter a valid email address');
      isValid = false;
    }
    if (!password || password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      isValid = false;
    }
    return isValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setAuthError(null);
    try {
      if (isRegister) {
        await register(email, password);
      } else {
        await login(email, password);
      }
    } catch {
      // Error is set in context
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickDemo = () => {
    setEmail('demo@hookrelay.dev');
    setPassword('password123');
    setEmailError('');
    setPasswordError('');
    setAuthError(null);
  };

  return (
    <div className="w-full max-w-sm mx-auto my-8">
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-xs text-left">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-md bg-gray-900 text-white flex items-center justify-center">
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <span className="font-semibold text-gray-900 text-sm">HookRelay</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            {isRegister ? 'Create an account' : 'Sign in to HookRelay'}
          </h1>
          <p className="text-xs text-gray-500 mt-1 leading-normal">
            {isRegister
              ? 'Enter your email and password to create an account.'
              : 'Enter your credentials to manage your webhook endpoints.'}
          </p>
        </div>

        {/* Form Error Banner if API error occurred */}
        {authError && (
          <div className="mb-4 p-2.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs">
            {authError}
          </div>
        )}

        {/* Inputs */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="auth-email"
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError('');
            }}
            placeholder="developer@company.com"
            required
            autoComplete="email"
            error={emailError}
          />

          <Input
            id="auth-password"
            label="Password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError('');
            }}
            placeholder="••••••••••••"
            required
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            helperText={isRegister ? 'Must be at least 6 characters' : undefined}
            error={passwordError}
          />

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full"
              isLoading={submitting}
            >
              {isRegister ? 'Create account' : 'Sign in'}
            </Button>
          </div>
        </form>

        {/* Toggle between register and login */}
        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
          <span>{isRegister ? 'Already have an account?' : "Don't have an account?"}</span>
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setAuthError(null);
              setEmailError('');
              setPasswordError('');
            }}
            className="font-medium text-gray-900 hover:underline cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-900 rounded px-1"
          >
            {isRegister ? 'Sign in' : 'Create one'}
          </button>
        </div>

        {/* Quick demo fill */}
        <div className="mt-4 pt-3 border-t border-gray-100 text-center">
          <button
            type="button"
            onClick={handleQuickDemo}
            className="text-xs text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
          >
            Fill demo credentials (<span className="font-mono text-gray-500">demo@hookrelay.dev</span>)
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthCard;
