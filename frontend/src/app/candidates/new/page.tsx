'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'

export default function NewCandidatePage() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        position: '',
        domain: '',
        experience_years: '',
        qualifications: '',
        resume_url: ''
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            // Build payload with proper types
            const payload = {
                first_name: formData.first_name || null,
                last_name: formData.last_name || null,
                email: formData.email,
                phone: formData.phone || null,
                position: formData.position || null,
                domain: formData.domain || null,
                experience_years: formData.experience_years ? parseInt(formData.experience_years) : null,
                qualifications: formData.qualifications || null,
            }
            
            await apiClient.post('/candidates', payload)
            router.push('/hr') // Redirect to HR dashboard after success
        } catch (err: any) {
            console.error('Failed to create candidate:', err)
            const msg = err.response?.data?.detail?.[0]?.msg || err.response?.data?.detail || err.message || 'Failed to create candidate'
            setError(msg)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mx-auto">
                <div className="mb-8">
                    <Button variant="outline" onClick={() => router.back()}>
                        ← Back
                    </Button>
                </div>

                <Card>
                    <div className="p-8">
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Add New Candidate</h1>
                        <p className="text-gray-600 mb-6">Enter the candidate&apos;s information below</p>

                        {error && (
                            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-6">
                            {/* Name Row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        First Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-2.5 border"
                                        value={formData.first_name}
                                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                                        placeholder="John"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Last Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-2.5 border"
                                        value={formData.last_name}
                                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                                        placeholder="Doe"
                                    />
                                </div>
                            </div>

                            {/* Contact Row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Email Address <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-2.5 border"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="john.doe@example.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Phone Number
                                    </label>
                                    <input
                                        type="tel"
                                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-2.5 border"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="+1 (555) 000-0000"
                                    />
                                </div>
                            </div>

                            {/* Position & Domain Row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Position / Role <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-2.5 border"
                                        value={formData.position}
                                        onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                                        placeholder="Software Engineer"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Domain / Department
                                    </label>
                                    <select
                                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-2.5 border"
                                        value={formData.domain}
                                        onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                                    >
                                        <option value="">Select Domain</option>
                                        <option value="Engineering">Engineering</option>
                                        <option value="Product">Product</option>
                                        <option value="Design">Design</option>
                                        <option value="Marketing">Marketing</option>
                                        <option value="Sales">Sales</option>
                                        <option value="HR">Human Resources</option>
                                        <option value="Finance">Finance</option>
                                        <option value="Operations">Operations</option>
                                        <option value="Data Science">Data Science</option>
                                        <option value="DevOps">DevOps</option>
                                        <option value="QA">Quality Assurance</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>

                            {/* Experience */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Years of Experience
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="50"
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-2.5 border"
                                    value={formData.experience_years}
                                    onChange={(e) => setFormData({ ...formData, experience_years: e.target.value })}
                                    placeholder="e.g. 3"
                                />
                            </div>

                            {/* Qualifications */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Qualifications / Skills
                                </label>
                                <textarea
                                    rows={3}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-2.5 border resize-none"
                                    value={formData.qualifications}
                                    onChange={(e) => setFormData({ ...formData, qualifications: e.target.value })}
                                    placeholder="e.g. Bachelor's in Computer Science, Python, React, AWS..."
                                />
                            </div>

                            {/* Resume URL (optional) */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Resume URL <span className="text-gray-400">(optional)</span>
                                </label>
                                <input
                                    type="url"
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 p-2.5 border"
                                    value={formData.resume_url}
                                    onChange={(e) => setFormData({ ...formData, resume_url: e.target.value })}
                                    placeholder="https://drive.google.com/..."
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Link to resume (Google Drive, Dropbox, etc.)
                                </p>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t">
                                <Button type="button" variant="outline" onClick={() => router.back()}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={loading} isLoading={loading}>
                                    Create Candidate
                                </Button>
                            </div>
                        </form>
                    </div>
                </Card>
            </div>
        </div>
    )
}
