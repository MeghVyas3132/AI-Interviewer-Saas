'use client';

import { useState, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { apiClient } from '@/lib/api';

// New simplified pipeline stages for AI-powered interview flow
const PIPELINE_STAGES = [
  { 
    id: 'uploaded', 
    label: 'Uploaded', 
    color: 'bg-slate-100 border-slate-300',
    description: 'Newly added candidates'
  },
  { 
    id: 'assigned', 
    label: 'Assigned', 
    color: 'bg-blue-100 border-blue-300',
    description: 'Assigned to interviewer'
  },
  { 
    id: 'interview_scheduled', 
    label: 'Interview Scheduled', 
    color: 'bg-purple-100 border-purple-300',
    description: 'Interview date set'
  },
  { 
    id: 'interview_completed', 
    label: 'Interview Taken', 
    color: 'bg-amber-100 border-amber-300',
    description: 'Awaiting AI verdict'
  },
  { 
    id: 'review', 
    label: 'Under Review', 
    color: 'bg-yellow-100 border-yellow-300',
    description: 'Needs manual review'
  },
  { 
    id: 'passed', 
    label: 'Passed', 
    color: 'bg-green-100 border-green-300',
    description: 'Approved by AI/HR'
  },
  { 
    id: 'failed', 
    label: 'Failed', 
    color: 'bg-red-100 border-red-300',
    description: 'Did not pass interview'
  },
  { 
    id: 'auto_rejected', 
    label: 'Auto Rejected', 
    color: 'bg-red-200 border-red-400',
    description: 'Below minimum score'
  },
];

// Legacy stages mapping for backward compatibility
const LEGACY_STAGE_MAP: Record<string, string> = {
  'applied': 'uploaded',
  'screening': 'assigned',
  'assessment': 'interview_scheduled',
  'interview': 'interview_completed',
  'selected': 'passed',
  'offer': 'passed',
  'accepted': 'passed',
  'rejected': 'failed',
  'withdrawn': 'failed',
  'on_hold': 'review',
};

interface Candidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  position?: string;
  assigned_to?: string;
  ats_score?: number;
  interview_score?: number;
}

interface Props {
  jobId?: string;
  onCandidateClick?: (candidate: Candidate) => void;
  editable?: boolean; // HR can edit, Employee can only view
}

function KanbanCandidatePipeline({ jobId, onCandidateClick, editable = true }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = jobId ? '?job_id=' + jobId : '';
      const response: any = await apiClient.get('/candidates' + params);
      setCandidates(response.candidates || response.data?.candidates || response || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  // Map legacy status to new pipeline stage
  const mapStatusToStage = (status: string): string => {
    return LEGACY_STAGE_MAP[status] || status;
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!editable) return; // Only HR can drag
    
    const { draggableId, destination, source } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const newStatus = destination.droppableId;
    setCandidates(prev =>
      prev.map(c => (c.id === draggableId ? { ...c, status: newStatus } : c))
    );

    try {
      await apiClient.patch('/candidates/' + draggableId + '/status', { status: newStatus });
    } catch (err) {
      fetchCandidates();
    }
  };

  const getCandidatesByStage = (stageId: string) => 
    candidates.filter(c => mapStatusToStage(c.status) === stageId);

  // Get score badge color
  const getScoreBadgeColor = (score?: number) => {
    if (!score) return 'bg-gray-100 text-gray-600';
    if (score >= 70) return 'bg-green-100 text-green-700';
    if (score >= 50) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="ml-2 text-gray-600">Loading pipeline...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
        <p className="text-red-600">{error}</p>
        <button onClick={fetchCandidates} className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pipeline Legend */}
      <div className="flex flex-wrap gap-2 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
        <span className="font-medium">Pipeline Flow:</span>
        {PIPELINE_STAGES.slice(0, 6).map((stage, idx) => (
          <span key={stage.id} className="flex items-center gap-1">
            <span>{stage.label}</span>
            {idx < 5 && <span className="text-gray-400">-&gt;</span>}
          </span>
        ))}
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {PIPELINE_STAGES.map(stage => {
              const stageCandidates = getCandidatesByStage(stage.id);
              return (
                <Droppable droppableId={stage.id} key={stage.id} isDropDisabled={!editable}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`w-72 flex-shrink-0 rounded-lg border-2 p-3 transition-all ${stage.color} ${
                        snapshot.isDraggingOver ? 'ring-2 ring-blue-400 scale-[1.02]' : ''
                      }`}
                    >
                      {/* Stage Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <h3 className="font-semibold text-gray-800 text-sm">{stage.label}</h3>
                            <p className="text-xs text-gray-500">{stage.description}</p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-white rounded-full text-sm font-bold shadow-sm">
                          {stageCandidates.length}
                        </span>
                      </div>

                      {/* Candidates List */}
                      <div className="space-y-2 min-h-[250px] max-h-[500px] overflow-y-auto">
                        {stageCandidates.map((candidate, index) => (
                          <Draggable 
                            key={candidate.id} 
                            draggableId={candidate.id} 
                            index={index}
                            isDragDisabled={!editable}
                          >
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => onCandidateClick?.(candidate)}
                                className={`bg-white rounded-lg p-3 shadow-sm border cursor-pointer transition-all hover:shadow-md ${
                                  snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-400 rotate-1' : ''
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 text-sm truncate">
                                      {candidate.first_name} {candidate.last_name}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">{candidate.email}</p>
                                  </div>
                                  {/* Score Badge */}
                                  {(candidate.ats_score || candidate.interview_score) && (
                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                      getScoreBadgeColor(candidate.interview_score || candidate.ats_score)
                                    }`}>
                                      {candidate.interview_score || candidate.ats_score}%
                                    </span>
                                  )}
                                </div>
                                {candidate.position && (
                                  <p className="text-xs text-blue-600 mt-1 truncate">{candidate.position}</p>
                                )}
                                {candidate.assigned_to && (
                                  <p className="text-xs text-gray-400 mt-1">
                                    👤 Assigned
                                  </p>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {stageCandidates.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                            <p className="text-xs">No candidates</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Droppable>
              );
            })}
          </div>
        </div>
      </DragDropContext>

      {!editable && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center text-sm text-blue-700">
          <span className="font-medium">View Only Mode:</span> Only HR can move candidates between stages.
        </div>
      )}
    </div>
  );
}

// Named export for compatibility
export { KanbanCandidatePipeline };
export default KanbanCandidatePipeline;
