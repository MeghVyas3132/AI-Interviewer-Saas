import React, { useState } from 'react';
import { Button } from '@/components/Button';
import { apiClient } from '@/lib/api';

interface Employee {
    id: string;
    name: string;
    email: string;
}

interface AssignCandidateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    candidateId: string | null;
    employees: Employee[];
}

export function AssignCandidateModal({ isOpen, onClose, onSuccess, candidateId, employees }: AssignCandidateModalProps) {
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen || !candidateId) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee) return;

        setLoading(true);
        setError('');

        try {
            // POST /api/v1/hr/candidates/{id}/assign
            await apiClient.post(`/hr/candidates/${candidateId}/assign?employee_id=${selectedEmployee}`, {});
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Failed to assign candidate:', err);
            setError(err.message || 'Failed to assign candidate');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
                <div className="flex items-center justify-between p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-900">Assign Candidate</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                            {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Employee</label>
                        <p className="text-xs text-gray-500 mb-2">Assigning to Candidate ID: {candidateId.slice(0, 8)}...</p>
                        <select
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm border p-2"
                            value={selectedEmployee}
                            onChange={(e) => setSelectedEmployee(e.target.value)}
                        >
                            <option value="">-- Select an Interviewer --</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>
                                    {emp.name} ({emp.email})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading || !selectedEmployee}>
                            {loading ? 'Assigning...' : 'Assign Candidate'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
