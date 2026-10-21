import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from './api/client'

function App() {
  const [count, setCount] = useState(0)

  // Live query to the FastAPI backend using TanStack Query & Axios
  const {
    data: health,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['backendHealth'],
    queryFn: fetchHealth,
  })

  const techStack = [
    { name: 'React (Vite)', category: 'Frontend' },
    { name: 'FastAPI', category: 'Backend' },
    { name: 'Tailwind CSS', category: 'Styling' },
    { name: 'TanStack Query', category: 'Data Fetching' },
    { name: 'Axios', category: 'HTTP Client' },
    { name: 'SQLAlchemy 2.0', category: 'ORM' },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight text-white font-sans">
              Hook<span className="text-indigo-400">Relay</span>
            </h1>
            <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Fullstack Connected
            </span>
          </div>
          <p className="text-sm text-slate-400">
            React frontend connected with Python FastAPI backend via Axios & TanStack Query.
          </p>
        </div>

        {/* Backend Connection Live Card */}
        <div className={`p-4 rounded-xl border transition-all ${
          isLoading
            ? 'bg-amber-950/20 border-amber-500/30'
            : isError
            ? 'bg-rose-950/20 border-rose-500/30'
            : 'bg-emerald-950/20 border-emerald-500/30'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isLoading ? 'bg-amber-400' : isError ? 'bg-rose-400' : 'bg-emerald-400'
                }`} />
                <span className={`relative inline-flex rounded-full h-3 w-3 ${
                  isLoading ? 'bg-amber-500' : isError ? 'bg-rose-500' : 'bg-emerald-500'
                }`} />
              </span>
              <span className="text-sm font-semibold text-slate-200">
                {isLoading
                  ? 'Connecting to FastAPI backend...'
                  : isError
                  ? 'FastAPI Backend Disconnected'
                  : 'FastAPI Backend Connected'}
              </span>
            </div>

            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-xs px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isFetching ? 'Pinging...' : 'Ping API'}
            </button>
          </div>

          {health && !isError && (
            <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-xs font-mono">
              <div>
                <span className="text-slate-500 block">Status:</span>
                <span className="text-emerald-400 font-semibold">{health.status}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Project:</span>
                <span className="text-slate-300 font-semibold">{health.project}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Environment:</span>
                <span className="text-slate-300 font-semibold">{health.environment}</span>
              </div>
            </div>
          )}

          {isError && (
            <p className="mt-2 text-xs text-rose-400">
              Error connecting to http://localhost:8000: {error?.message}
            </p>
          )}
        </div>

        {/* Tech Stack Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {techStack.map((tech) => (
            <div
              key={tech.name}
              className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 flex flex-col justify-between"
            >
              <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                {tech.category}
              </div>
              <div className="text-sm font-semibold text-slate-200 mt-1">
                {tech.name}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                <span>Active</span>
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={() => setCount((c) => c + 1)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            Counter: {count}
          </button>
          <span className="text-xs text-slate-500 font-mono">
            API: http://localhost:8000
          </span>
        </div>
      </div>
    </div>
  )
}

export default App
