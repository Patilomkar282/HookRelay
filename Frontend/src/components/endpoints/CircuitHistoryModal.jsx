import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCircuitEvents } from '../../api/client';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { X, Activity, ShieldAlert, CheckCircle2, RotateCcw, Clock, AlertTriangle } from 'lucide-react';

export const CircuitHistoryModal = ({ endpoint, onClose }) => {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['circuitEvents', endpoint?.id],
    queryFn: () => fetchCircuitEvents(endpoint.id, { limit: 50, offset: 0 }),
    enabled: !!endpoint?.id,
  });

  const events = data?.items || [];

  const getReasonLabel = (reason) => {
    switch (reason) {
      case 'threshold_reached':
        return 'Consecutive Failure Threshold Reached';
      case 'cooldown_elapsed':
        return 'Cooldown Elapsed (Probe Dispatched)';
      case 'probe_succeeded':
        return 'Probe Succeeded (Recovered)';
      case 'probe_failed':
        return 'Probe Failed (Cooldown Escalated)';
      case 'manual_reset':
        return 'Manual Resume by Owner';
      case 'target_changed':
        return 'Target URL Changed';
      default:
        return reason;
    }
  };

  const getStateBadge = (state) => {
    switch (state) {
      case 'open':
        return <Badge status="failed" label="OPEN" />;
      case 'half_open':
        return <Badge status="warning" label="HALF-OPEN" />;
      case 'closed':
        return <Badge status="delivered" label="CLOSED" />;
      default:
        return <Badge status="neutral" label={state?.toUpperCase() || 'UNKNOWN'} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                Circuit Breaker Audit Trail
              </h3>
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                Endpoint: {endpoint?.name || `/h/${endpoint?.slug}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-md transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[500px] overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-700">Current State:</span>
              {getStateBadge(endpoint?.circuit_state)}
            </div>
            <Button
              variant="secondary"
              size="xs"
              onClick={() => refetch()}
              isLoading={isRefetching}
              icon={RotateCcw}
            >
              Refresh Log
            </Button>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-xs text-gray-500">
              Loading circuit transition history...
            </div>
          ) : isError ? (
            <div className="p-4 rounded-lg bg-red-50 text-xs text-red-600 border border-red-200">
              {error?.message || 'Failed to load circuit events'}
            </div>
          ) : events.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-500 border border-dashed rounded-xl bg-gray-50/50">
              No circuit state changes recorded for this endpoint yet.
              <p className="text-[11px] text-gray-400 mt-1">
                Transitions (trips, cooldown claims, probes, manual resumes) will appear here.
              </p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
              {events.map((evt) => (
                <div key={evt.id} className="relative group">
                  {/* Timeline bullet */}
                  <div
                    className={`absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-white shadow-xs ${
                      evt.to_state === 'open'
                        ? 'bg-red-500'
                        : evt.to_state === 'half_open'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                  />
                  <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-3.5 space-y-1.5 transition-all group-hover:bg-white group-hover:shadow-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {getStateBadge(evt.from_state)}
                        <span className="text-xs text-gray-400 font-mono">→</span>
                        {getStateBadge(evt.to_state)}
                      </div>
                      <span className="text-[11px] text-gray-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(evt.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-gray-800">
                      {getReasonLabel(evt.reason)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CircuitHistoryModal;
