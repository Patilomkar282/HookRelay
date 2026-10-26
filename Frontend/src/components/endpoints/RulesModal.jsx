import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchEndpointRules,
  updateEndpointRules,
  previewEndpointRules,
  fetchEndpointEvents,
} from '../../api/client';
import Button from '../common/Button';
import Badge from '../common/Badge';
import {
  X,
  Filter,
  Sliders,
  PlayCircle,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Shield,
  Layers,
  Code2,
  Info,
} from 'lucide-react';

const OPERATORS = [
  { value: 'equals', label: 'equals (=)', needsValue: true, placeholder: 'e.g. payment.captured' },
  { value: 'not_equals', label: 'not equals (!=)', needsValue: true, placeholder: 'e.g. test_event' },
  { value: 'in', label: 'in (list)', needsValue: true, placeholder: 'item1, item2, item3' },
  { value: 'not_in', label: 'not in (list)', needsValue: true, placeholder: 'excluded1, excluded2' },
  { value: 'contains', label: 'contains (substring)', needsValue: true, placeholder: 'e.g. error' },
  { value: 'starts_with', label: 'starts with', needsValue: true, placeholder: 'e.g. order.' },
  { value: 'exists', label: 'field exists', needsValue: false, placeholder: 'No value needed' },
  { value: 'gt', label: 'greater than (>)', needsValue: true, placeholder: 'e.g. 500' },
  { value: 'lt', label: 'less than (<)', needsValue: true, placeholder: 'e.g. 1000' },
];

const STEP_OPS = [
  { value: 'project', label: 'Project (Keep & Rename Fields)', desc: 'Keep only specified fields and rename them' },
  { value: 'drop', label: 'Drop (Remove Fields)', desc: 'Delete sensitive or unwanted paths' },
  { value: 'mask', label: 'Mask (Redact to ***)', desc: 'Hide sensitive data like emails or passwords' },
  { value: 'set', label: 'Set (Add/Overwrite Value)', desc: 'Inject static constants or flags' },
];

const SAMPLE_TEMPLATES = {
  razorpay: {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_Hn3482jhdf9',
          amount: 49900,
          currency: 'INR',
          status: 'captured',
          email: 'customer@example.com',
          contact: '+919876543210',
          notes: { order_id: 'ord_9981' },
        },
      },
    },
  },
  stripe: {
    id: 'evt_1Mv9Fh2eZvKYlo2C86lW4t7A',
    object: 'event',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_3Mv9Fg2eZvKYlo2C1V4K13nB',
        amount: 2500,
        currency: 'usd',
        customer: 'cus_N62i9Z',
        receipt_email: 'buyer@hookrelay.dev',
      },
    },
  },
};

export default function RulesModal({ endpoint, isOpen, onClose, onRulesSaved }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('filter'); // 'filter' | 'transform' | 'preview'
  const [matchMode, setMatchMode] = useState('all');
  const [conditions, setConditions] = useState([]);
  const [steps, setSteps] = useState([]);
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState(null);

  // Preview state
  const [previewSource, setPreviewSource] = useState('sample'); // 'sample' | 'event'
  const [samplePayload, setSamplePayload] = useState(JSON.stringify(SAMPLE_TEMPLATES.razorpay, null, 2));
  const [selectedEventId, setSelectedEventId] = useState('');
  const [previewResult, setPreviewResult] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Fetch saved rules for endpoint
  const { data: rulesData, isLoading: isLoadingRules } = useQuery({
    queryKey: ['endpoint_rules', endpoint?.id],
    queryFn: () => fetchEndpointRules(endpoint.id),
    enabled: isOpen && !!endpoint?.id,
  });

  // Fetch recent events for endpoint for previewing stored events
  const { data: eventsData } = useQuery({
    queryKey: ['endpoint_recent_events', endpoint?.id],
    queryFn: () => fetchEndpointEvents(endpoint.id, { limit: 10 }),
    enabled: isOpen && !!endpoint?.id && previewSource === 'event',
  });

  // Initialize state when rules are loaded
  useEffect(() => {
    if (rulesData) {
      if (rulesData.filter) {
        setMatchMode(rulesData.filter.match || 'all');
        setConditions(
          (rulesData.filter.conditions || []).map((c) => ({
            ...c,
            value: Array.isArray(c.value) ? c.value.join(', ') : c.value ?? '',
          }))
        );
      } else {
        setMatchMode('all');
        setConditions([]);
      }

      if (rulesData.transform && rulesData.transform.length > 0) {
        setSteps(
          rulesData.transform.map((s) => {
            if (s.op === 'project') {
              const entries = Object.entries(s.map || {});
              return {
                op: 'project',
                mapEntries: entries.length > 0 ? entries.map(([k, v]) => ({ key: k, path: v })) : [{ key: '', path: '' }],
              };
            }
            if (s.op === 'drop') {
              const pathsList = Array.isArray(s.paths) ? s.paths.join(', ') : s.paths || s.path || '';
              return { op: 'drop', pathsStr: pathsList };
            }
            return { ...s };
          })
        );
      } else {
        setSteps([]);
      }
    }
  }, [rulesData]);

  // Save rules mutation
  const saveMutation = useMutation({
    mutationFn: (payload) => updateEndpointRules(endpoint.id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['endpoint_rules', endpoint.id] });
      queryClient.invalidateQueries({ queryKey: ['endpoints'] });
      setValidationError(null);
      if (onRulesSaved) onRulesSaved(data);
      onClose();
    },
    onError: (err) => {
      setValidationError(err.message || 'Failed to save rules');
    },
  });

  if (!isOpen || !endpoint) return null;

  // Build clean payload for save / preview
  const buildRulesPayload = () => {
    // 1. Filter
    let filterPayload = null;
    if (conditions.length > 0) {
      const parsedConditions = conditions.map((c) => {
        let val = c.value;
        if (c.op === 'exists') {
          val = null;
        } else if (c.op === 'in' || c.op === 'not_in') {
          val = typeof c.value === 'string' ? c.value.split(',').map((s) => s.trim()).filter(Boolean) : c.value;
        } else if (c.op === 'gt' || c.op === 'lt') {
          const num = Number(c.value);
          val = isNaN(num) ? c.value : num;
        }
        return {
          field: c.field.trim(),
          op: c.op,
          value: val,
        };
      });
      filterPayload = {
        match: matchMode,
        conditions: parsedConditions,
      };
    }

    // 2. Transform
    let transformPayload = null;
    if (steps.length > 0) {
      transformPayload = steps.map((s) => {
        if (s.op === 'project') {
          const mapObj = {};
          (s.mapEntries || []).forEach(({ key, path }) => {
            if (key && path) mapObj[key.trim()] = path.trim();
          });
          return { op: 'project', map: mapObj };
        }
        if (s.op === 'drop') {
          const pList = (s.pathsStr || '')
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
          return { op: 'drop', paths: pList };
        }
        if (s.op === 'mask') {
          return { op: 'mask', path: (s.path || '').trim() };
        }
        if (s.op === 'set') {
          return { op: 'set', path: (s.path || '').trim(), value: s.value };
        }
        return s;
      });
    }

    return {
      filter: filterPayload,
      transform: transformPayload,
    };
  };

  const handleSave = () => {
    setValidationError(null);
    try {
      const payload = buildRulesPayload();
      saveMutation.mutate(payload);
    } catch (err) {
      setValidationError(err.message);
    }
  };

  // Preview mutation
  const handleRunPreview = async () => {
    setIsPreviewLoading(true);
    setPreviewResult(null);
    setValidationError(null);
    try {
      const activeRules = buildRulesPayload();
      let previewReq = { rules: activeRules };

      if (previewSource === 'event') {
        if (!selectedEventId) {
          throw new Error('Please select a stored event to test.');
        }
        previewReq.event_id = selectedEventId;
      } else {
        let parsed;
        try {
          parsed = JSON.parse(samplePayload);
        } catch (e) {
          throw new Error(`Sample payload is not valid JSON: ${e.message}`);
        }
        previewReq.sample_json = parsed;
      }

      const res = await previewEndpointRules(endpoint.id, previewReq);
      setPreviewResult(res);
    } catch (err) {
      setValidationError(err.message || 'Preview failed');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Filter conditions management
  const addCondition = () => {
    if (conditions.length >= 20) return;
    setConditions([
      ...conditions,
      { field: 'body.event', op: 'equals', value: '' },
    ]);
  };

  const removeCondition = (idx) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const updateCondition = (idx, field, val) => {
    const updated = [...conditions];
    updated[idx] = { ...updated[idx], [field]: val };
    setConditions(updated);
  };

  // Transform steps management
  const addStep = (op) => {
    if (steps.length >= 20) return;
    if (op === 'project') {
      setSteps([...steps, { op: 'project', mapEntries: [{ key: '', path: '' }] }]);
    } else if (op === 'drop') {
      setSteps([...steps, { op: 'drop', pathsStr: '' }]);
    } else if (op === 'mask') {
      setSteps([...steps, { op: 'mask', path: '' }]);
    } else if (op === 'set') {
      setSteps([...steps, { op: 'set', path: '', value: '' }]);
    }
  };

  const removeStep = (idx) => {
    setSteps(steps.filter((_, i) => i !== idx));
  };

  const moveStep = (idx, direction) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= steps.length) return;
    const newSteps = [...steps];
    const [moved] = newSteps.splice(idx, 1);
    newSteps.splice(targetIdx, 0, moved);
    setSteps(newSteps);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Mailbox Rules & Transformations</h2>
                <Badge variant="purple" className="font-mono text-xs">
                  v{rulesData?.rules_version ?? 0}
                </Badge>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                {endpoint.name || 'Mailbox'} • /h/{endpoint.slug}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 gap-2">
          <button
            onClick={() => setActiveTab('filter')}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'filter'
                ? 'border-purple-500 text-purple-400 bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Filter className="w-4 h-4" />
            Payload Filter ({conditions.length}/20)
          </button>
          <button
            onClick={() => setActiveTab('transform')}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'transform'
                ? 'border-purple-500 text-purple-400 bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            Transform Pipeline ({steps.length}/20)
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'preview'
                ? 'border-purple-500 text-purple-400 bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <PlayCircle className="w-4 h-4" />
            Live Preview & Test
          </button>
        </div>

        {/* Validation Error Banner */}
        {validationError && (
          <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 text-red-400 text-xs">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Validation Error</p>
              <p>{validationError}</p>
            </div>
          </div>
        )}

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 1: FILTER CONDITIONS */}
          {activeTab === 'filter' && (
            <div className="space-y-5">
              <div className="p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl text-xs text-slate-300 flex items-start gap-3">
                <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-white mb-1">Declarative Forwarding Filter</p>
                  <p>
                    Only events matching these conditions will be forwarded to your target URL. Unmatched events are safely marked as <code className="bg-slate-900 px-1 py-0.5 rounded text-amber-400">filtered</code> and dropped without consuming forwarding attempts.
                  </p>
                </div>
              </div>

              {/* Match Mode Selector */}
              <div className="flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold text-slate-300">Condition Match Logic:</span>
                <div className="flex rounded-lg bg-slate-900 p-1 border border-slate-800">
                  <button
                    onClick={() => setMatchMode('all')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                      matchMode === 'all'
                        ? 'bg-purple-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Match ALL (AND)
                  </button>
                  <button
                    onClick={() => setMatchMode('any')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                      matchMode === 'any'
                        ? 'bg-purple-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Match ANY (OR)
                  </button>
                </div>
              </div>

              {/* Conditions List */}
              {conditions.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl">
                  <Filter className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 font-medium">No filter conditions configured</p>
                  <p className="text-xs text-slate-500 mt-1">All incoming webhooks will be forwarded without filtering.</p>
                  <Button
                    onClick={addCondition}
                    variant="outline"
                    size="sm"
                    className="mt-4 border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
                  >
                    <Plus className="w-4 h-4 mr-1.5" /> Add First Condition
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {conditions.map((cond, idx) => {
                    const opDef = OPERATORS.find((o) => o.value === cond.op) || OPERATORS[0];
                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center gap-3 group hover:border-slate-700 transition-all"
                      >
                        <span className="text-xs font-mono text-slate-500 w-6 text-center">#{idx + 1}</span>

                        {/* Field input */}
                        <div className="flex-1">
                          <input
                            type="text"
                            placeholder="e.g. body.event or header.x-type"
                            value={cond.field}
                            onChange={(e) => updateCondition(idx, 'field', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono"
                          />
                        </div>

                        {/* Operator dropdown */}
                        <div className="w-44">
                          <select
                            value={cond.op}
                            onChange={(e) => updateCondition(idx, 'op', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                          >
                            {OPERATORS.map((op) => (
                              <option key={op.value} value={op.value}>
                                {op.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Value input */}
                        <div className="flex-1">
                          <input
                            type="text"
                            placeholder={opDef.placeholder}
                            disabled={!opDef.needsValue}
                            value={opDef.needsValue ? cond.value : ''}
                            onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                            className={`w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono ${
                              !opDef.needsValue ? 'opacity-40 cursor-not-allowed' : ''
                            }`}
                          />
                        </div>

                        {/* Remove button */}
                        <button
                          onClick={() => removeCondition(idx)}
                          className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                          title="Remove condition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}

                  {conditions.length < 20 && (
                    <Button
                      onClick={addCondition}
                      variant="outline"
                      size="sm"
                      className="border-slate-800 text-slate-300 hover:bg-slate-800/80 text-xs mt-2"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Condition ({conditions.length}/20)
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TRANSFORM PIPELINE */}
          {activeTab === 'transform' && (
            <div className="space-y-5">
              <div className="p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl text-xs text-slate-300 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-white mb-1">Sequential Transformation Pipeline</p>
                  <p>
                    Modify, sanitize, or reshape payloads before forwarding to your destination. Transformations are executed sequentially on a clean copy. The stored event in PostgreSQL is completely untouched.
                  </p>
                </div>
              </div>

              {/* Steps List */}
              {steps.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl">
                  <Layers className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 font-medium">No transformation steps configured</p>
                  <p className="text-xs text-slate-500 mt-1">Events that pass the filter will be forwarded in their original format.</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-4">
                    {STEP_OPS.map((op) => (
                      <Button
                        key={op.value}
                        onClick={() => addStep(op.value)}
                        variant="outline"
                        size="sm"
                        className="text-xs border-slate-700 hover:border-purple-500/50 hover:bg-purple-500/10"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> {op.label.split(' ')[0]}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {steps.map((step, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 relative group"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 text-xs font-bold flex items-center justify-center font-mono">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold uppercase text-purple-300 tracking-wider font-mono">
                            {step.op}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {STEP_OPS.find((o) => o.value === step.op)?.desc}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => moveStep(idx, -1)}
                            disabled={idx === 0}
                            className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-20 rounded"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => moveStep(idx, 1)}
                            disabled={idx === steps.length - 1}
                            className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-20 rounded"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => removeStep(idx)}
                            className="p-1 text-slate-500 hover:text-red-400 rounded hover:bg-red-500/10"
                            title="Remove Step"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Step Specific Form Fields */}
                      {step.op === 'project' && (
                        <div className="space-y-2">
                          <p className="text-[11px] text-slate-400">
                            Specify output field name and source payload path:
                          </p>
                          {(step.mapEntries || []).map((entry, mIdx) => (
                            <div key={mIdx} className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Output key (e.g. event_name)"
                                value={entry.key}
                                onChange={(e) => {
                                  const updated = [...steps];
                                  updated[idx].mapEntries[mIdx].key = e.target.value;
                                  setSteps(updated);
                                }}
                                className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-white font-mono placeholder-slate-600"
                              />
                              <span className="text-slate-500 text-xs font-mono">&larr;</span>
                              <input
                                type="text"
                                placeholder="Source path (e.g. payload.payment.id)"
                                value={entry.path}
                                onChange={(e) => {
                                  const updated = [...steps];
                                  updated[idx].mapEntries[mIdx].path = e.target.value;
                                  setSteps(updated);
                                }}
                                className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-white font-mono placeholder-slate-600"
                              />
                              <button
                                onClick={() => {
                                  const updated = [...steps];
                                  updated[idx].mapEntries = updated[idx].mapEntries.filter((_, i) => i !== mIdx);
                                  setSteps(updated);
                                }}
                                className="text-slate-500 hover:text-red-400 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => {
                              const updated = [...steps];
                              updated[idx].mapEntries.push({ key: '', path: '' });
                              setSteps(updated);
                            }}
                            className="text-[11px] text-purple-400 hover:text-purple-300 font-medium flex items-center gap-1 mt-1"
                          >
                            <Plus className="w-3 h-3" /> Add Project Field
                          </button>
                        </div>
                      )}

                      {step.op === 'drop' && (
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-400">Paths to drop (comma-separated):</label>
                          <input
                            type="text"
                            placeholder="e.g. card.cvv, customer.raw_password, tracking"
                            value={step.pathsStr || ''}
                            onChange={(e) => {
                              const updated = [...steps];
                              updated[idx].pathsStr = e.target.value;
                              setSteps(updated);
                            }}
                            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder-slate-600"
                          />
                        </div>
                      )}

                      {step.op === 'mask' && (
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-400">Target path to mask with ***:</label>
                          <input
                            type="text"
                            placeholder="e.g. payload.payment.entity.email"
                            value={step.path || ''}
                            onChange={(e) => {
                              const updated = [...steps];
                              updated[idx].path = e.target.value;
                              setSteps(updated);
                            }}
                            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder-slate-600"
                          />
                        </div>
                      )}

                      {step.op === 'set' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-400">Target path:</label>
                            <input
                              type="text"
                              placeholder="e.g. metadata.source"
                              value={step.path || ''}
                              onChange={(e) => {
                                const updated = [...steps];
                                updated[idx].path = e.target.value;
                                setSteps(updated);
                              }}
                              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder-slate-600"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-400">Static Value:</label>
                            <input
                              type="text"
                              placeholder="e.g. HookRelay"
                              value={step.value ?? ''}
                              onChange={(e) => {
                                const updated = [...steps];
                                updated[idx].value = e.target.value;
                                setSteps(updated);
                              }}
                              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder-slate-600"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add Step Action Bar */}
                  {steps.length < 20 && (
                    <div className="flex items-center gap-2 pt-2">
                      <span className="text-xs text-slate-400 font-medium">Add Step:</span>
                      {STEP_OPS.map((op) => (
                        <Button
                          key={op.value}
                          onClick={() => addStep(op.value)}
                          variant="outline"
                          size="sm"
                          className="text-xs border-slate-800 hover:border-purple-500/50 hover:bg-purple-500/10"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> {op.label.split(' ')[0]}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIVE PREVIEW & TEST */}
          {activeTab === 'preview' && (
            <div className="space-y-5">
              <div className="p-4 bg-slate-800/40 border border-slate-700/50 rounded-xl text-xs text-slate-300 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <PlayCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-white mb-1">Instant Dry-Run Test</p>
                    <p>
                      Execute your current filtering and transformation pipeline against sample data or real stored webhooks. <strong className="text-purple-300">Sends nothing over the network and creates no delivery logs.</strong>
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                  10 tests / min
                </Badge>
              </div>

              {/* Source selection */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
                  <button
                    onClick={() => setPreviewSource('sample')}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                      previewSource === 'sample'
                        ? 'bg-purple-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Custom JSON Sample
                  </button>
                  <button
                    onClick={() => setPreviewSource('event')}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                      previewSource === 'event'
                        ? 'bg-purple-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Select Stored Event
                  </button>
                </div>

                {previewSource === 'sample' && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">Quick Template:</span>
                    <button
                      onClick={() => setSamplePayload(JSON.stringify(SAMPLE_TEMPLATES.razorpay, null, 2))}
                      className="text-xs bg-slate-800/80 hover:bg-slate-700 px-2 py-1 rounded text-slate-300 transition-colors"
                    >
                      Razorpay
                    </button>
                    <button
                      onClick={() => setSamplePayload(JSON.stringify(SAMPLE_TEMPLATES.stripe, null, 2))}
                      className="text-xs bg-slate-800/80 hover:bg-slate-700 px-2 py-1 rounded text-slate-300 transition-colors"
                    >
                      Stripe
                    </button>
                  </div>
                )}
              </div>

              {/* Input section */}
              {previewSource === 'sample' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Input JSON Payload:</label>
                  <textarea
                    rows={8}
                    value={samplePayload}
                    onChange={(e) => setSamplePayload(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-purple-500 leading-relaxed"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Pick a Stored Event:</label>
                  {eventsData?.events?.length > 0 ? (
                    <select
                      value={selectedEventId}
                      onChange={(e) => setSelectedEventId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                    >
                      <option value="">-- Choose an event to preview --</option>
                      {eventsData.events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.id} • {ev.received_at ? new Date(ev.received_at).toLocaleTimeString() : 'Recent'} • {JSON.stringify(ev.body).slice(0, 60)}...
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-slate-500 italic p-3 bg-slate-950 rounded-xl border border-slate-800">
                      No events received by this mailbox yet. Switch to "Custom JSON Sample" to test your rules.
                    </p>
                  )}
                </div>
              )}

              {/* Action Button */}
              <div className="flex justify-end">
                <Button
                  onClick={handleRunPreview}
                  disabled={isPreviewLoading}
                  className="bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20 text-xs px-5"
                >
                  {isPreviewLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Evaluating...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-3.5 h-3.5 mr-1.5" /> Run Live Preview
                    </>
                  )}
                </Button>
              </div>

              {/* Preview Result Card */}
              {previewResult && (
                <div className="mt-4 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/80 animate-in fade-in duration-200">
                  <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                    <div className="flex items-center gap-3">
                      {previewResult.action === 'forward_transformed' && (
                        <Badge variant="success" className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Transformed & Forwarded
                        </Badge>
                      )}
                      {previewResult.action === 'forward_original' && (
                        <Badge variant="blue" className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Forwarded Original
                        </Badge>
                      )}
                      {previewResult.action === 'filtered' && (
                        <Badge variant="amber" className="flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Filtered Out (Dropped)
                        </Badge>
                      )}
                      {previewResult.action === 'error' && (
                        <Badge variant="danger" className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Transform Error (Fail Closed)
                        </Badge>
                      )}

                      <span className="text-xs font-mono text-slate-400">
                        matches: {previewResult.matches ? 'true' : 'false'}
                      </span>
                    </div>

                    {previewResult.output && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(previewResult.output, null, 2));
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy Output'}
                      </button>
                    )}
                  </div>

                  <div className="p-4">
                    {previewResult.error && (
                      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 font-mono mb-3">
                        {previewResult.error}
                      </div>
                    )}

                    {previewResult.output ? (
                      <pre className="bg-slate-900/90 p-3 rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto max-h-60 leading-relaxed border border-slate-800">
                        {JSON.stringify(previewResult.output, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        {previewResult.action === 'filtered'
                          ? 'No output generated because the payload failed filter criteria.'
                          : 'No output data.'}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Shield className="w-4 h-4 text-purple-400" />
            <span>Rules are enforced strictly server-side & fail closed.</span>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={onClose} variant="ghost" size="sm">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20 text-xs px-5"
            >
              {saveMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving...
                </>
              ) : (
                'Save Rules'
              )}
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
