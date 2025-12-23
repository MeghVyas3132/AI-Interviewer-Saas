import React, { useState } from 'react';
import { Card } from '@/components/Card';

interface Candidate {
  id: string;
  name: string;
  status: string;
  scheduled_at?: string;
}

interface PipelineProps {
  candidates: Candidate[];
  onStageChange?: (candidateId: string, newStage: string) => void;
  pendingChanges?: Record<string, string>; // candidateId -> newStage
  onUndo?: () => void;
  onConfirm?: () => void;
}

const STAGES = [
  { id: 'applied', label: 'Applied', color: 'bg-blue-100 text-blue-800' },
  { id: 'screening', label: 'Screening', color: 'bg-yellow-100 text-yellow-800' },
  { id: 'interview', label: 'Interview', color: 'bg-purple-100 text-purple-800' },
  { id: 'offer', label: 'Offer', color: 'bg-green-100 text-green-800' },
  { id: 'rejected', label: 'Rejected', color: 'bg-gray-100 text-gray-800' },
];

export function KanbanCandidatePipeline({ candidates, onStageChange, pendingChanges, onUndo, onConfirm }: PipelineProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const getCandidatesByStage = (stage: string) => {
    return candidates.filter(c => (pendingChanges?.[c.id] || c.status).toLowerCase() === stage.toLowerCase());
  };

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
        {onUndo && <button className="btn-secondary" onClick={onUndo}>Undo</button>}
        {onConfirm && <button className="btn-primary" onClick={onConfirm}>Confirm</button>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {STAGES.map(stage => {
          const stageCandidates = getCandidatesByStage(stage.id);
          return (
            <div
              key={stage.id}
              className="bg-gray-50 rounded-xl p-2 min-h-[300px] border border-gray-100"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                if (draggedId && onStageChange) onStageChange(draggedId, stage.id);
                setDraggedId(null);
              }}
            >
              <div className="flex items-center justify-between mb-3 px-2 pt-1">
                <h3 className="font-semibold text-gray-700 text-sm">{stage.label}</h3>
                <span className="bg-white px-2 py-0.5 rounded-full text-xs font-medium text-gray-500 border border-gray-200 shadow-sm">
                  {stageCandidates.length}
                </span>
              </div>
              <div className="space-y-2">
                {stageCandidates.map(candidate => (
                  <div
                    key={candidate.id}
                    className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition cursor-move group"
                    draggable
                    onDragStart={() => setDraggedId(candidate.id)}
                    onDragEnd={() => setDraggedId(null)}
                  >
                    <p className="font-medium text-gray-900 text-sm truncate group-hover:text-brand-600 transition">
                      {candidate.name}
                    </p>
                    {candidate.scheduled_at && (
                      <div className="mt-1 flex items-center text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                        <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {new Date(candidate.scheduled_at).toLocaleDateString()}
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                        #{candidate.id.slice(0, 4)}
                      </span>
                    </div>
                  </div>
                ))}
                {stageCandidates.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-lg">
                    <span className="text-gray-300 text-xs">Empty</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
