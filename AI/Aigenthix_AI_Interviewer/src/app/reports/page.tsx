"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  BarChart3,
  TrendingUp,
  Clock,
  Calendar,
  Filter,
  Download,
  Search,
  Target,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Briefcase,
  FileText,
  Activity,
  Shield,
  Sparkles,
  TrendingDown,
  Award,
  FileJson,
  FileSpreadsheet,
  FileText as FileTextIcon,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

// Response type badge helper function
const ResponseTypeBadge = ({ responseType }: { responseType?: string }) => {
  if (!responseType) return null;

  const responseTypeConfig: Record<string, { className: string; label: string; ariaLabel: string }> = {
    spoken: {
      className: 'bg-green-100 text-green-700 border border-green-300',
      label: '🎤 Spoken',
      ariaLabel: 'Spoken response'
    },
    typed: {
      className: 'bg-blue-100 text-blue-700 border border-blue-300',
      label: '⌨️ Typed',
      ariaLabel: 'Typed response'
    },
    mixed: {
      className: 'bg-purple-100 text-purple-700 border border-purple-300',
      label: '🎤⌨️ Mixed',
      ariaLabel: 'Mixed response (spoken and typed)'
    }
  };

  const config = responseTypeConfig[responseType] || responseTypeConfig.mixed;

  return (
    <span 
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.className}`}
      aria-label={config.ariaLabel}
    >
      {config.label}
    </span>
  );
};

// Mock data generation
const indianNames = [
  "Aarav Patel", "Priya Sharma", "Rajesh Kumar", "Anjali Gupta", "Vikram Singh",
  "Meera Reddy", "Arjun Joshi", "Sneha Das", "Karan Malhotra", "Divya Nair",
  "Rohan Iyer", "Sanya Jain", "Aman Tripathi", "Isha Trivedi", "Neha Kapoor",
  "Siddharth Shah", "Kavya Menon", "Rahul Chaturvedi", "Ananya Rao", "Vedant Agarwal",
  "Nisha Desai", "Suraj Mehta", "Pooja Soni", "Kiran Bansal", "Arushi Dugal",
  "Ayush Garg", "Shreya Khurana", "Harsh Sachdeva", "Ritika Malhotra", "Ishaan Khanna",
  "Aashi Gupta", "Yash Verma", "Aditi Rawat", "Tanmay Pandey", "Akanksha Wadhwa",
  "Soham Chawla", "Preeti Chopra", "Vivaan Lohia", "Krisha Tiwari", "Rishabh Saxena"
];

// Roles will be loaded dynamically from Admin Job Positions (only those mapped to a subcategory)
// Keep a local mock list only for legacy mock-data generator references
const MOCK_ROLES = [
  "AI Engineer", "ML Engineer", "Software Developer", "Product Manager",
  "Data Scientist", "DevOps Engineer", "QA Engineer"
];

const statuses = ["shortlisted", "pending", "rejected"];

const topics = [
  "Data Structures & Algorithms",
  "System Design",
  "Machine Learning",
  "Problem Solving",
  "Communication",
  "Leadership",
  "Technical Knowledge",
  "Code Quality"
];

// Generate mock candidates
function generateMockCandidates(count: number = 120) {
  const candidates = [];
  for (let i = 0; i < count; i++) {
    const technical = Math.floor(Math.random() * 80) + 20;
    const communication = Math.floor(Math.random() * 80) + 20;
    const behavioral = Math.floor(Math.random() * 80) + 20;
    const overall = Math.floor(technical * 0.4 + communication * 0.3 + behavioral * 0.3);
    const plagiarism = Math.floor(Math.random() * 45);
    const authenticity = 100 - plagiarism;
    
    const status = plagiarism > 30 ? "rejected" : 
                   overall >= 70 ? "shortlisted" : 
                   overall >= 50 ? "pending" : "rejected";

    candidates.push({
      id: `CAND${String(i + 1).padStart(4, '0')}`,
      name: indianNames[i % indianNames.length] + (i >= indianNames.length ? ` ${Math.floor(i / indianNames.length) + 1}` : ''),
      role: MOCK_ROLES[i % MOCK_ROLES.length],
      technical,
      communication,
      behavioral,
      overall,
      plagiarism,
      authenticity,
      interviewDate: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toLocaleDateString(),
      duration: Math.floor(Math.random() * 60) + 30,
      status,
      voiceFaceMatch: Math.random() > 0.15,
    });
  }
  return candidates;
}

// Generate mock interview questions
function generateMockInterview(candidateId: string) {
  const questions = [
    {
      id: "Q1",
      type: "Technical",
      question: "Explain the difference between supervised and unsupervised learning.",
      answer: "Supervised learning uses labeled data to train models, while unsupervised learning finds patterns in unlabeled data.",
      confidence: Math.floor(Math.random() * 40) + 60,
      keywords: ["supervised", "unsupervised", "labeled data", "patterns"],
      missedPoints: ["specific algorithms", "real-world examples"]
    },
    {
      id: "Q2",
      type: "Behavioral",
      question: "Describe a challenging project you worked on and how you handled it.",
      answer: "I worked on a distributed system project where we had to handle high traffic. I collaborated with the team to implement load balancing and caching strategies.",
      confidence: Math.floor(Math.random() * 40) + 60,
      keywords: ["distributed", "collaboration", "problem-solving"],
      missedPoints: ["specific metrics", "failure scenarios"]
    },
    {
      id: "Q3",
      type: "Communication",
      question: "How would you explain machine learning to a non-technical stakeholder?",
      answer: "I would use analogies comparing it to how humans learn from examples, gradually improving predictions over time.",
      confidence: Math.floor(Math.random() * 40) + 60,
      keywords: ["analogy", "examples", "predictions"],
      missedPoints: ["specific use cases", "business value"]
    }
  ];
  return questions;
}

const allCandidates = generateMockCandidates(120);

export default function ReportsPage() {
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [minScore, setMinScore] = useState(0);
  const [maxPlagiarism, setMaxPlagiarism] = useState(100);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [liveData, setLiveData] = useState<{
    summary: any;
    candidates: any[];
  } | null>(null);
  const [transcripts, setTranscripts] = useState<Array<{
    candidate_id: string;
    candidate_name: string;
    candidate_email?: string;
    role?: string;
    interview_id?: string;
    status: string;
    questions_count: number;
    qa: Array<{ id: string; question?: string; answer?: string; feedback?: string; scoring?: any; at?: string; }>;
  }> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Manual refresh function for candidate summary
  const refreshCandidateSummary = async () => {
    setIsRefreshing(true);
    try {
      // Force refresh by adding query parameter to bypass cache
      const response = await fetch('/api/reports/latest?forceRefresh=true');
      const result = await response.json();
      
      if (result.success && result.data) {
        setLiveData(result.data);
        setError(null);
        console.log('Candidate summary refreshed:', {
          totalCandidates: result.data.summary?.total_candidates || 0,
          candidatesCount: result.data.candidates?.length || 0
        });
      } else {
        console.warn('No live report data available');
      }
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError('Failed to load reports');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fetch live report data with auto-refresh
  useEffect(() => {
    let isMounted = true;
    
    const fetchReports = async (isInitialLoad: boolean = false) => {
      try {
        // Always use forceRefresh=true to bypass cache and get fresh data from CandidateSummary
        const response = await fetch('/api/reports/latest?forceRefresh=true', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          },
          cache: 'no-cache',
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (!isMounted) return;
        
        if (result.success && result.data) {
          setLiveData(result.data);
          setError(null);
        } else {
          if (isInitialLoad) {
            console.warn('No live report data available');
          }
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Error fetching reports:', err);
        if (isInitialLoad) {
          setError('Failed to load reports');
        }
        // Don't set error for auto-refresh failures to avoid UI disruption
      } finally {
        if (isMounted && isInitialLoad) {
          setLoading(false);
        }
      }
    };

    // Fetch immediately on mount
    fetchReports(true);

    // Auto-refresh every 5 seconds to show new interviews and analysis
    const intervalId = setInterval(() => {
      fetchReports(false);
    }, 5000); // Refresh every 5 seconds

    // Cleanup interval on unmount
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  // Fetch available roles from Admin -> Job Positions (only those linked to a subcategory)
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const resp = await fetch('/api/admin/job-positions');
        const json = await resp.json();
        if (json?.success && Array.isArray(json.data)) {
          const titles: string[] = json.data
            .filter((jp: any) => jp?.is_active && jp?.subcategory_id)
            .map((jp: any) => jp.title)
            .filter(Boolean);
          const uniqueSorted = Array.from(new Set(titles)).sort((a, b) => a.localeCompare(b));
          setAvailableRoles(uniqueSorted);
        } else {
          setAvailableRoles([]);
        }
      } catch (e) {
        console.warn('Failed to load job roles:', e);
        setAvailableRoles([]);
      }
    };
    fetchRoles();
  }, []);

  // If selected role is no longer available, reset to 'all'
  useEffect(() => {
    if (selectedRole !== 'all' && !availableRoles.includes(selectedRole)) {
      setSelectedRole('all');
    }
  }, [availableRoles]);

  // Fetch transcripts (real Q&A) separately with auto-refresh
  useEffect(() => {
    const fetchTranscripts = async () => {
      try {
        const resp = await fetch('/api/reports/transcripts?limit=20', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-cache',
        });
        
        if (!resp.ok) {
          throw new Error(`HTTP error! status: ${resp.status}`);
        }
        
        const json = await resp.json();
        if (json.success && Array.isArray(json.data)) {
          console.log(`[Reports Page] Received ${json.data.length} transcripts`, json.debug ? { debug: json.debug } : '');
          setTranscripts(json.data);
          // Log debug info if available
          if (json.debug) {
            console.warn('[Reports Page] Debug info from transcripts API:', json.debug);
          }
        } else {
          console.warn('[Reports Page] Transcripts API returned non-array data:', json);
          setTranscripts([]);
        }
      } catch (e) {
        console.error('[Reports Page] Failed to fetch transcripts:', e);
        // Don't clear transcripts on error to avoid UI disruption
        // setTranscripts([]);
      }
    };
    
    // Fetch immediately
    fetchTranscripts();
    
    // Auto-refresh every 5 seconds to show new interview Q&A data
    const intervalId = setInterval(() => {
      fetchTranscripts();
    }, 5000); // Refresh every 5 seconds
    
    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Use live data only - no fallback to mock data
  const displayCandidates = useMemo(() => {
    if (liveData?.candidates && liveData.candidates.length > 0) {
      return liveData.candidates;
    }
    return []; // Return empty array instead of mock data
  }, [liveData]);

  // Role options: intersection of roles present in reports and active admin roles
  const roleOptions = useMemo(() => {
    const fromReports = Array.from(new Set(displayCandidates.map((c: any) => c.role).filter(Boolean)));
    if (availableRoles.length === 0 && fromReports.length > 0) {
      return fromReports.sort((a, b) => a.localeCompare(b));
    }
    const setAdmin = new Set(availableRoles);
    const intersected = fromReports.filter(r => setAdmin.has(r));
    const base = intersected.length > 0 ? intersected : availableRoles;
    return Array.from(new Set(base)).sort((a, b) => a.localeCompare(b));
  }, [displayCandidates, availableRoles]);

  const filteredCandidates = useMemo(() => {
    const startDateObj = startDate ? new Date(startDate) : null;
    const endDateObj = endDate ? new Date(endDate) : null;
    if (endDateObj) {
      endDateObj.setHours(23, 59, 59, 999);
    }

    return displayCandidates.filter(candidate => {
      const roleMatch = selectedRole === "all" || candidate.role === selectedRole;
      const overallScore = candidate.overall_score || candidate.overall || 0;
      const scoreMatch = overallScore >= minScore;
      const plagiarismMatch = (candidate.plagiarism || 0) <= maxPlagiarism;
      const statusMatch = selectedStatus === "all" || candidate.status === selectedStatus;
      const timestamp = candidate.timestamp || candidate.completed_at || candidate.updated_at || candidate.created_at;
      const candidateDate = timestamp ? new Date(timestamp) : null;
      let dateMatch = true;
      if (startDateObj) {
        dateMatch = candidateDate ? candidateDate >= startDateObj : false;
      }
      if (dateMatch && endDateObj) {
        dateMatch = candidateDate ? candidateDate <= endDateObj : false;
      }
      
      // Search logic: if query is empty, match all; otherwise search in name, ID, and email
      const trimmedQuery = searchQuery.trim();
      let searchMatch = true; // Default: match all if no search query
      
      if (trimmedQuery.length > 0) {
        const queryLower = trimmedQuery.toLowerCase();
        
        // Name search (case-insensitive)
        const nameMatch = candidate.name?.toLowerCase().includes(queryLower) || false;
        
        // ID search - check multiple ID fields and formats
        const candidateId = candidate.candidate_id ? String(candidate.candidate_id).toLowerCase() : '';
        const idField = candidate.id ? String(candidate.id).toLowerCase() : '';
        const interviewId = candidate.interview_id ? String(candidate.interview_id).toLowerCase() : '';
        const idMatch = candidateId.includes(queryLower) || 
                        idField.includes(queryLower) ||
                        interviewId.includes(queryLower) || false;
        
        // Email search
        const emailMatch = candidate.email?.toLowerCase().includes(queryLower) || false;
        
        // Numeric ID exact match (for direct ID lookups)
        let numericIdMatch = false;
        if (!isNaN(Number(trimmedQuery))) {
          const numericValue = Number(trimmedQuery);
          numericIdMatch = candidate.candidate_id === trimmedQuery ||
                          candidate.id === numericValue ||
                          candidate.interview_id === numericValue ||
                          String(candidate.candidate_id) === String(numericValue) ||
                          String(candidate.id) === String(numericValue) || false;
        }
        
        searchMatch = nameMatch || idMatch || emailMatch || numericIdMatch;
      }
      
      return roleMatch && scoreMatch && plagiarismMatch && statusMatch && searchMatch && dateMatch;
    });
  }, [displayCandidates, selectedRole, minScore, maxPlagiarism, selectedStatus, searchQuery, startDate, endDate]);

  const averageOverall = useMemo(() => {
    if (filteredCandidates.length === 0) return 0;
    const total = filteredCandidates.reduce((sum, c) => sum + (c.overall_score || c.overall || 0), 0);
    return Math.round(total / filteredCandidates.length);
  }, [filteredCandidates]);

  const shortlistedCount = useMemo(() => {
    return filteredCandidates.filter(c => c.status === "shortlisted").length;
  }, [filteredCandidates]);

  const shortlistedPercentage = useMemo(() => {
    if (filteredCandidates.length === 0) return 0;
    return Math.round((shortlistedCount / filteredCandidates.length) * 100);
  }, [shortlistedCount, filteredCandidates.length]);

  const averageDuration = useMemo(() => {
    if (filteredCandidates.length === 0) return 0;
    
    // Parse duration strings like "15m" to extract minutes
    const parseDuration = (duration: string | number | undefined): number => {
      if (!duration) return 0;
      if (typeof duration === 'number') return Math.max(0, Math.round(duration));
      
      // Handle string formats like "15m", "30m", etc.
      const match = String(duration).match(/(\d+(?:\.\d+)?)\s*m/);
      if (match) {
        return Math.max(0, Math.round(parseFloat(match[1])));
      }
      
      // Try to parse as plain number
      const num = parseFloat(String(duration));
      return isNaN(num) ? 0 : Math.max(0, Math.round(num));
    };
    
    const durations = filteredCandidates
      .map(c => parseDuration(c.duration))
      .filter(d => d > 0); // Only count valid durations
    
    if (durations.length === 0) return 0;
    
    const sum = durations.reduce((acc, d) => acc + d, 0);
    return Math.round(sum / durations.length);
  }, [filteredCandidates]);

  // Chart data
  const roleScoreData = useMemo(() => {
    const roleData: Record<string, { tech: number[]; comm: number[]; beh: number[] }> = {};
    filteredCandidates.forEach(c => {
      if (!roleData[c.role]) {
        roleData[c.role] = { tech: [], comm: [], beh: [] };
      }
      roleData[c.role].tech.push(c.technical);
      roleData[c.role].comm.push(c.communication);
      roleData[c.role].beh.push(c.behavioral);
    });

    return Object.entries(roleData).map(([role, scores]) => ({
      role,
      technical: Math.round(scores.tech.reduce((a, b) => a + b, 0) / scores.tech.length),
      communication: Math.round(scores.comm.reduce((a, b) => a + b, 0) / scores.comm.length),
      behavioral: Math.round(scores.beh.reduce((a, b) => a + b, 0) / scores.beh.length),
    }));
  }, [filteredCandidates]);

  const statusDistribution = useMemo(() => {
    const counts = filteredCandidates.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredCandidates]);

  const aggregateScores = useMemo(() => {
    if (filteredCandidates.length === 0) {
      return { overall: 0, technical: 0, communication: 0, behavioral: 0, authenticity: 0 };
    }

    const totals = filteredCandidates.reduce(
      (acc, candidate) => {
        const overall = candidate.overall_score ?? candidate.overall ?? 0;
        const technical = candidate.technical ?? 0;
        const communication = candidate.communication ?? 0;
        const behavioral = candidate.behavioral ?? 0;
        const authenticity = candidate.authenticity ?? (100 - (candidate.plagiarism ?? 0));

        acc.overall += overall;
        acc.technical += technical;
        acc.communication += communication;
        acc.behavioral += behavioral;
        acc.authenticity += authenticity;
        return acc;
      },
      { overall: 0, technical: 0, communication: 0, behavioral: 0, authenticity: 0 }
    );

    const count = filteredCandidates.length;

    return {
      overall: Math.round(totals.overall / count),
      technical: Math.round(totals.technical / count),
      communication: Math.round(totals.communication / count),
      behavioral: Math.round(totals.behavioral / count),
      authenticity: Math.round(totals.authenticity / count),
    };
  }, [filteredCandidates]);

  const radarData = useMemo(() => {
    return [
      { subject: "Overall", value: aggregateScores.overall },
      { subject: "Technical", value: aggregateScores.technical },
      { subject: "Communication", value: aggregateScores.communication },
      { subject: "Behavioral", value: aggregateScores.behavioral },
      { subject: "Authenticity", value: aggregateScores.authenticity },
    ];
  }, [aggregateScores]);

  const plagiarismData = useMemo(() => {
    return [
      { name: "Low (0-15%)", value: filteredCandidates.filter(c => (c.plagiarism || 0) < 15).length },
      { name: "Medium (15-30%)", value: filteredCandidates.filter(c => (c.plagiarism || 0) >= 15 && (c.plagiarism || 0) < 30).length },
      { name: "High (30%+)", value: filteredCandidates.filter(c => (c.plagiarism || 0) >= 30).length },
    ];
  }, [filteredCandidates]);

  const scatterData = useMemo(() => {
    return filteredCandidates.map(c => ({
      technical: c.technical || 0,
      authenticity: c.authenticity ?? (100 - (c.plagiarism || 0)),
      name: (c.name || 'Candidate').split(' ')[0]
    }));
  }, [filteredCandidates]);

  const scoreDistribution = useMemo(() => {
    const ranges = [
      { range: "0-20", min: 0, max: 20 },
      { range: "21-40", min: 21, max: 40 },
      { range: "41-60", min: 41, max: 60 },
      { range: "61-80", min: 61, max: 80 },
      { range: "81-100", min: 81, max: 100 },
    ];
    
    return ranges.map(r => ({
      range: r.range,
      count: filteredCandidates.filter(c => {
        const overall = c.overall_score ?? c.overall ?? 0;
        return overall >= r.min && overall <= r.max;
      }).length
    }));
  }, [filteredCandidates]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  // Quick filter chips
  const [quickFilters, setQuickFilters] = useState<string[]>([]);

  const toggleQuickFilter = (filter: string) => {
    setQuickFilters(prev => 
      prev.includes(filter) 
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };

  // Enhanced quick filters - match the metrics calculation definitions
  const highPerformers = useMemo(() => {
    // High performers: overall_score >= 80 (matches metrics calculation)
    return filteredCandidates.filter(c => (c.overall_score || c.overall || 0) >= 80).length;
  }, [filteredCandidates]);

  const needsReview = useMemo(() => {
    // Needs review: overall_score < 50 && status !== 'rejected' && status !== 'abandoned'
    // (rejected includes abandoned and incomplete interviews)
    return filteredCandidates.filter(c => 
      (c.overall_score || c.overall || 0) < 50 && c.status !== 'rejected' && c.status !== 'abandoned'
    ).length;
  }, [filteredCandidates]);

  const pendingReviews = useMemo(() => {
    return filteredCandidates.filter(c => c.status === "pending").length;
  }, [filteredCandidates]);

  // Apply quick filters - match the metrics calculation definitions
  const finalFilteredCandidates = useMemo(() => {
    if (quickFilters.length === 0) return filteredCandidates;
    
    return filteredCandidates.filter(candidate => {
      return quickFilters.every(filter => {
        switch(filter) {
          case "high-performers":
            // High performers: overall_score >= 80 (matches metrics calculation)
            return (candidate.overall_score || candidate.overall || 0) >= 80;
          case "shortlisted":
            // Shortlisted: status === "shortlisted"
            return candidate.status === "shortlisted";
          case "needs-review":
            // Needs review: overall_score < 50 && status !== 'abandoned' (matches metrics calculation)
            return (candidate.overall_score || candidate.overall || 0) < 50 && candidate.status !== 'abandoned';
          case "pending":
            // Pending: status === "pending"
            return candidate.status === "pending";
          case "top-technical":
            // Top technical: technical score >= 80
            return (candidate.technical || 0) >= 80;
          default:
            return true;
        }
      });
    });
  }, [filteredCandidates, quickFilters]);

  const plagiarismInsights = useMemo(() => {
    const sortedCandidates = [...finalFilteredCandidates].sort((a, b) => {
      const aScore = a.plagiarism ?? 0;
      const bScore = b.plagiarism ?? 0;
      return bScore - aScore;
    });

    const summary = sortedCandidates.reduce(
      (acc, candidate) => {
        const score = candidate.plagiarism ?? 0;
        if (score >= 30) {
          acc.high += 1;
        } else if (score >= 15) {
          acc.medium += 1;
        } else {
          acc.low += 1;
        }
        acc.total += 1;
        acc.totalScore += score;
        return acc;
      },
      { high: 0, medium: 0, low: 0, total: 0, totalScore: 0 }
    );

    const average = summary.total > 0 ? Math.round(summary.totalScore / summary.total) : 0;

    return {
      sortedCandidates,
      average,
      highRisk: summary.high,
      mediumRisk: summary.medium,
      lowRisk: summary.low,
      total: summary.total,
    };
  }, [finalFilteredCandidates]);

  const COLORS_ENHANCED = {
    primary: '#6366f1', // Indigo
    success: '#10b981', // Green
    warning: '#f59e0b', // Amber
    danger: '#ef4444', // Red
    info: '#3b82f6', // Blue
    secondary: '#8b5cf6', // Purple
  };

  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv' | 'pdf'>('json');

  const formatInterviewDate = (candidate: any) => {
    if (!candidate) return null;
    const ts = candidate.timestamp || candidate.completed_at || candidate.updated_at || candidate.created_at;
    if (!ts) return null;
    const date = new Date(ts);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleString();
  };

  const handleExport = async (format: 'json' | 'csv' | 'pdf' = exportFormat) => {
    setIsExporting(true);
    try {
      const candidateIds = Array.from(
        new Set(
          finalFilteredCandidates
            .map(candidate => candidate.candidate_id || candidate.id)
            .filter(Boolean)
            .map(id => String(id))
        )
      );

      const params = new URLSearchParams({
        format,
        includeTranscripts: 'true',
      });

      if (candidateIds.length > 0) {
        params.append('candidateIds', candidateIds.join(','));
      }

      // Fetch comprehensive report data
      const response = await fetch(`/api/reports/export?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch export data');
      }

      if (format === 'pdf') {
        // For PDF, get JSON data and generate PDF on client side
        const data = await response.json();
        await generatePDFReport(data);
      } else if (format === 'csv') {
        // For CSV, download directly
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `interview-reports-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        // For JSON, download directly
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `interview-reports-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }

      // Show success message
      alert(`Report exported successfully as ${format.toUpperCase()}!`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export report. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const escapeHtml = (text: string): string => {
    if (!text) return '';
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  };

  const generatePDFReport = async (data: any) => {
    try {
      // Dynamically import html2pdf
      const html2pdf = (await import('html2pdf.js')).default;

      // Create comprehensive HTML content
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>AI Interview Reports - Comprehensive Export</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              padding: 20px;
              background: white;
            }
            .header { 
              text-align: center; 
              border-bottom: 3px solid #6366f1; 
              padding-bottom: 20px; 
              margin-bottom: 30px;
            }
            .header h1 { 
              color: #6366f1; 
              font-size: 32px; 
              margin: 10px 0;
            }
            .header .date { 
              color: #6b7280; 
              font-size: 14px;
            }
            .summary-section {
              background: #f8fafc;
              padding: 20px;
              border-radius: 8px;
              margin-bottom: 30px;
              border: 1px solid #e2e8f0;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 15px;
              margin-top: 15px;
            }
            .summary-item {
              background: white;
              padding: 15px;
              border-radius: 6px;
              border: 1px solid #e2e8f0;
            }
            .summary-label {
              font-size: 12px;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 5px;
            }
            .summary-value {
              font-size: 24px;
              font-weight: bold;
              color: #1e293b;
            }
            .candidate-section {
              margin: 30px 0;
              page-break-inside: avoid;
            }
            .candidate-header {
              background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
              color: white;
              padding: 15px 20px;
              border-radius: 8px 8px 0 0;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .candidate-name {
              font-size: 20px;
              font-weight: bold;
            }
            .candidate-meta {
              font-size: 12px;
              opacity: 0.9;
            }
            .candidate-content {
              border: 1px solid #e2e8f0;
              border-top: none;
              border-radius: 0 0 8px 8px;
              padding: 20px;
            }
            .scores-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 15px;
              margin-bottom: 20px;
            }
            .score-card {
              background: #f8fafc;
              padding: 15px;
              border-radius: 6px;
              text-align: center;
              border: 1px solid #e2e8f0;
            }
            .score-label {
              font-size: 12px;
              color: #6b7280;
              margin-bottom: 5px;
            }
            .score-value {
              font-size: 28px;
              font-weight: bold;
              color: #6366f1;
            }
            .transcript-section {
              margin-top: 25px;
            }
            .transcript-title {
              font-size: 16px;
              font-weight: bold;
              color: #1e293b;
              margin-bottom: 15px;
              padding-bottom: 10px;
              border-bottom: 2px solid #e2e8f0;
            }
            .qa-item {
              margin: 20px 0;
              padding: 15px;
              background: #f8fafc;
              border-radius: 6px;
              border-left: 4px solid #6366f1;
            }
            .qa-question {
              font-weight: bold;
              color: #1e293b;
              margin-bottom: 10px;
              font-size: 14px;
            }
            .qa-answer {
              color: #475569;
              margin-bottom: 10px;
              white-space: pre-wrap;
              font-size: 13px;
            }
            .qa-feedback {
              background: #dbeafe;
              padding: 10px;
              border-radius: 4px;
              margin-top: 10px;
              font-size: 12px;
              color: #1e40af;
            }
            .qa-scoring {
              margin-top: 10px;
              font-size: 12px;
              color: #6b7280;
            }
            .page-break {
              page-break-before: always;
            }
            @media print {
              body { margin: 0; padding: 10px; }
              .page-break { page-break-before: always; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>AI Interview Reports</h1>
            <div class="date">Generated on ${new Date().toLocaleString()}</div>
          </div>

          <div class="summary-section">
            <h2 style="font-size: 18px; margin-bottom: 15px; color: #1e293b;">Summary Statistics</h2>
            <div class="summary-grid">
              <div class="summary-item">
                <div class="summary-label">Total Candidates</div>
                <div class="summary-value">${data.metadata?.total_candidates || 0}</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Total Transcripts</div>
                <div class="summary-value">${data.metadata?.total_transcripts || 0}</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Average Score</div>
                <div class="summary-value">${data.summary?.average_score || '0%'}</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Shortlisted</div>
                <div class="summary-value">${data.summary?.shortlisted || 0}</div>
              </div>
            </div>
          </div>

          ${data.candidates.map((candidate: any, idx: number) => `
            <div class="candidate-section ${idx > 0 ? 'page-break' : ''}">
              <div class="candidate-header">
                <div>
                  <div class="candidate-name">${escapeHtml(candidate.name || 'Unknown')}</div>
                  <div class="candidate-meta">${escapeHtml(candidate.candidate_id || candidate.id || 'N/A')} | ${escapeHtml(candidate.role || 'Unknown Role')} | ${escapeHtml(candidate.status || 'Unknown')}</div>
                </div>
              </div>
              <div class="candidate-content">
                <div class="scores-grid">
                  <div class="score-card">
                    <div class="score-label">Overall</div>
                    <div class="score-value">${candidate.overall_score || candidate.overall || 0}%</div>
                  </div>
                  <div class="score-card">
                    <div class="score-label">Technical</div>
                    <div class="score-value">${candidate.technical || 0}</div>
                  </div>
                  <div class="score-card">
                    <div class="score-label">Communication</div>
                    <div class="score-value">${candidate.communication || 0}</div>
                  </div>
                  <div class="score-card">
                    <div class="score-label">Behavioral</div>
                    <div class="score-value">${candidate.behavioral || 0}</div>
                  </div>
                </div>
                
                <div style="margin-top: 20px; padding: 15px; background: #f1f5f9; border-radius: 6px;">
                  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 12px;">
                    <div><strong>Plagiarism:</strong> ${candidate.plagiarism || 0}%</div>
                    <div><strong>Authenticity:</strong> ${candidate.authenticity || (100 - (candidate.plagiarism || 0))}</div>
                    <div><strong>Duration:</strong> ${candidate.duration || 0} minutes</div>
                    <div><strong>Email:</strong> ${escapeHtml(candidate.email || 'N/A')}</div>
                  </div>
                </div>

                ${candidate.transcripts && candidate.transcripts.length > 0 ? `
                  <div class="transcript-section">
                    <div class="transcript-title">Interview Transcripts (${candidate.transcripts.length} interview${candidate.transcripts.length > 1 ? 's' : ''})</div>
                    ${candidate.transcripts.map((transcript: any) => `
                      <div style="margin-bottom: 30px; padding: 15px; background: white; border: 1px solid #e2e8f0; border-radius: 6px;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 15px;">
                          Interview ID: ${escapeHtml(transcript.interview_id || 'N/A')} | 
                          Completed: ${transcript.completed_at ? new Date(transcript.completed_at).toLocaleString() : 'N/A'}
                        </div>
                        ${transcript.qa.map((qa: any, qIdx: number) => `
                          <div class="qa-item">
                            <div class="qa-question">Q${qIdx + 1}: ${escapeHtml(qa.question || 'No question')}</div>
                            <div class="qa-answer">${escapeHtml(qa.answer || 'No answer')}</div>
                            ${qa.feedback ? `<div class="qa-feedback"><strong>AI Feedback:</strong> ${escapeHtml(qa.feedback)}</div>` : ''}
                            ${qa.scoring ? `<div class="qa-scoring"><strong>Score:</strong> ${qa.scoring.overallScore || qa.scoring.overall || 'N/A'}/10</div>` : ''}
                          </div>
                        `).join('')}
                      </div>
                    `).join('')}
                  </div>
                ` : '<div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-radius: 6px; color: #92400e;">No transcripts available for this candidate.</div>'}
              </div>
            </div>
          `).join('')}

          <div style="margin-top: 40px; padding: 20px; background: #f8fafc; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">
              This comprehensive report was generated by AI Interviewer. All feedback and scoring is based on AI analysis of interview responses.
            </p>
          </div>
        </body>
        </html>
      `;

      // Create temporary element
      const element = document.createElement('div');
      element.innerHTML = htmlContent;
      document.body.appendChild(element);

      // Generate PDF
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `interview-reports-comprehensive-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      await html2pdf().set(opt).from(element).save();
      document.body.removeChild(element);
    } catch (error) {
      console.error('Error generating PDF:', error);
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/30 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Enhanced Header with Gradient Accent */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-blue-500/10 rounded-2xl blur-2xl"></div>
          <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl p-6 md:p-8 border border-indigo-100/50 shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                      AI Interview Reports
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">Comprehensive candidate evaluation dashboard</p>
                  </div>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    size="lg" 
                    className="gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        Export Report
                        <ChevronDown className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Export Format</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => handleExport('json')}
                    className="cursor-pointer"
                  >
                    <FileJson className="w-4 h-4 mr-2" />
                    Export as JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleExport('csv')}
                    className="cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleExport('pdf')}
                    className="cursor-pointer"
                  >
                    <FileTextIcon className="w-4 h-4 mr-2" />
                    Export as PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Enhanced Metrics with Icons and Better Visuals */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="relative overflow-hidden border-2 border-blue-100 hover:border-blue-300 transition-all duration-300 hover:shadow-lg group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-blue-100 rounded-bl-full opacity-50 group-hover:opacity-75 transition-opacity"></div>
            <CardHeader className="flex flex-row items-center justify-between pb-3 relative">
              <CardTitle className="text-sm font-semibold text-gray-700">Total Candidates</CardTitle>
              <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {liveData?.summary?.total_candidates ?? filteredCandidates.length}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="text-green-600">↑ 12%</span>
                <span className="text-gray-500">vs last month</span>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-2 border-purple-100 hover:border-purple-300 transition-all duration-300 hover:shadow-lg group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-purple-100 rounded-bl-full opacity-50 group-hover:opacity-75 transition-opacity"></div>
            <CardHeader className="flex flex-row items-center justify-between pb-3 relative">
              <CardTitle className="text-sm font-semibold text-gray-700">Average Score</CardTitle>
              <div className="p-2 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                <BarChart3 className="w-5 h-5 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {liveData?.summary?.average_score ?? `${averageOverall}%`}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-xs">Across all dimensions</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-2 border-green-100 hover:border-green-300 transition-all duration-300 hover:shadow-lg group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-green-100 rounded-bl-full opacity-50 group-hover:opacity-75 transition-opacity"></div>
            <CardHeader className="flex flex-row items-center justify-between pb-3 relative">
              <CardTitle className="text-sm font-semibold text-gray-700">Shortlisted</CardTitle>
              <div className="p-2 bg-green-500/10 rounded-lg group-hover:bg-green-500/20 transition-colors">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {liveData?.summary?.shortlisted ?? shortlistedCount}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge className="bg-green-500/10 text-green-700 border-green-300">
                  {liveData?.summary?.shortlisted && liveData?.summary?.total_candidates 
                    ? `${Math.round((liveData.summary.shortlisted / liveData.summary.total_candidates) * 100)}% of candidates`
                    : `${shortlistedPercentage}% of candidates`}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-2 border-orange-100 hover:border-orange-300 transition-all duration-300 hover:shadow-lg group">
            <div className="absolute top-0 right-0 w-20 h-20 bg-orange-100 rounded-bl-full opacity-50 group-hover:opacity-75 transition-opacity"></div>
            <CardHeader className="flex flex-row items-center justify-between pb-3 relative">
              <CardTitle className="text-sm font-semibold text-gray-700">Avg Duration</CardTitle>
              <div className="p-2 bg-orange-500/10 rounded-lg group-hover:bg-orange-500/20 transition-colors">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {liveData?.summary?.avg_duration ?? `${averageDuration}m`}
              </div>
              <div className="text-xs text-muted-foreground">Per interview session</div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Filter Chips */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => toggleQuickFilter("high-performers")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              quickFilters.includes("high-performers")
                ? "bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg scale-105"
                : "bg-white border-2 border-purple-200 text-purple-700 hover:border-purple-400"
            }`}
          >
            <Award className="w-4 h-4" />
            High Performers ({liveData?.summary?.high_performers ?? highPerformers})
          </button>
          <button
            onClick={() => toggleQuickFilter("shortlisted")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              quickFilters.includes("shortlisted")
                ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg scale-105"
                : "bg-white border-2 border-green-200 text-green-700 hover:border-green-400"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            Shortlisted Only
          </button>
          <button
            onClick={() => toggleQuickFilter("needs-review")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              quickFilters.includes("needs-review")
                ? "bg-gradient-to-r from-red-500 to-orange-600 text-white shadow-lg scale-105"
                : "bg-white border-2 border-red-200 text-red-700 hover:border-red-400"
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            Needs Review ({liveData?.summary?.needs_review ?? needsReview})
          </button>
          <button
            onClick={() => toggleQuickFilter("pending")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              quickFilters.includes("pending")
                ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg scale-105"
                : "bg-white border-2 border-amber-200 text-amber-700 hover:border-amber-400"
            }`}
          >
            <Clock className="w-4 h-4" />
            Pending ({liveData?.summary?.pending ?? pendingReviews})
          </button>
          <button
            onClick={() => toggleQuickFilter("top-technical")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              quickFilters.includes("top-technical")
                ? "bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg scale-105"
                : "bg-white border-2 border-blue-200 text-blue-700 hover:border-blue-400"
            }`}
          >
            <Activity className="w-4 h-4" />
            Top Technical
          </button>
        </div>

        {/* Enhanced Filters Panel */}
        <Card className="border-2 border-gray-100 hover:border-indigo-200 transition-all duration-300">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-indigo-50/30 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-indigo-600" />
                <CardTitle>Filter Options</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-600 hover:text-gray-900"
                onClick={() => {
                  setSelectedRole("all");
                  setMinScore(0);
                  setMaxPlagiarism(100);
                  setSelectedStatus("all");
                  setSearchQuery("");
                  setQuickFilters([]);
                  setStartDate("");
                  setEndDate("");
                }}
              >
                Clear All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Search className="w-4 h-4" />
                  Search Candidates
                </Label>
                <Input
                  placeholder="Name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Briefcase className="w-4 h-4" />
                  Job Role
                </Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {roleOptions.map(role => (
                      <SelectItem key={role} value={role}>{role}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Target className="w-4 h-4" />
                  Min Score
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={minScore}
                  onChange={(e) => setMinScore(parseInt(e.target.value) || 0)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Shield className="w-4 h-4" />
                  Max Plagiarism %
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={maxPlagiarism}
                  onChange={(e) => setMaxPlagiarism(parseInt(e.target.value) || 100)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Activity className="w-4 h-4" />
                  Status
                </Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {statuses.map(status => (
                      <SelectItem key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Calendar className="w-4 h-4" />
                  Interview Date Range
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Enhanced Tabs */}
        <Tabs defaultValue="summary" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 bg-white/50 p-1 rounded-xl border-2 border-gray-100 h-auto">
            <TabsTrigger 
              value="summary" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-purple-600 data-[state=active]:text-white transition-all duration-300 rounded-lg py-3"
            >
              <FileText className="w-4 h-4 mr-2 inline" />
              <span className="hidden md:inline">Summary</span>
              <span className="md:hidden">Summary</span>
            </TabsTrigger>
            <TabsTrigger 
              value="transcripts"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-purple-600 data-[state=active]:text-white transition-all duration-300 rounded-lg py-3"
            >
              <FileText className="w-4 h-4 mr-2 inline" />
              <span className="hidden md:inline">Transcripts</span>
              <span className="md:hidden">Transcripts</span>
            </TabsTrigger>
            <TabsTrigger 
              value="comparative"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-purple-600 data-[state=active]:text-white transition-all duration-300 rounded-lg py-3"
            >
              <BarChart3 className="w-4 h-4 mr-2 inline" />
              <span className="hidden md:inline">Comparative</span>
              <span className="md:hidden">Compare</span>
            </TabsTrigger>
            <TabsTrigger 
              value="plagiarism"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-purple-600 data-[state=active]:text-white transition-all duration-300 rounded-lg py-3"
            >
              <Shield className="w-4 h-4 mr-2 inline" />
              <span className="hidden md:inline">Plagiarism</span>
              <span className="md:hidden">Plagiarism</span>
            </TabsTrigger>
            <TabsTrigger 
              value="analytics"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-purple-600 data-[state=active]:text-white transition-all duration-300 rounded-lg py-3"
            >
              <Activity className="w-4 h-4 mr-2 inline" />
              <span className="hidden md:inline">Analytics</span>
              <span className="md:hidden">Analytics</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            <Card className="border-2 border-gray-100">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-indigo-50/30 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-indigo-600" />
                      Candidate Summary
                    </CardTitle>
                    <CardDescription className="mt-1">Overview of all candidates with performance metrics</CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={refreshCandidateSummary}
                      disabled={isRefreshing}
                      className="gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                      {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </Button>
                    <Badge className="bg-indigo-100 text-indigo-700 border-indigo-300">
                      {finalFilteredCandidates.length} Candidates
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {finalFilteredCandidates.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">No Candidates Found</h3>
                    <p className="text-gray-500 mb-4">
                      {liveData === null 
                        ? "No interview data available. Start conducting interviews to see candidate reports here."
                        : "No candidates match your current filter criteria. Try adjusting your filters."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {finalFilteredCandidates.map((candidate, candidateIdx) => (
                      <Card 
                        key={`candidate-${candidate.id || candidate.candidate_id || candidateIdx}-${candidate.interview_id || ''}-${candidateIdx}`} 
                        className="hover:shadow-xl transition-all duration-300 border-2 hover:border-indigo-300 group cursor-pointer"
                      >
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                                {candidate.name.split(' ').map((n: string) => n[0]).join('')}
                              </div>
                              <div>
                                <CardTitle className="text-base">{candidate.name}</CardTitle>
                                <p className="text-xs text-muted-foreground">{candidate.id || candidate.candidate_id}</p>
                              </div>
                            </div>
                            <Badge
                              variant={candidate.status === "shortlisted" ? "default" : candidate.status === "pending" ? "secondary" : "destructive"}
                              className="ml-2"
                            >
                              {candidate.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {candidate.role}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <div className="flex justify-between text-sm mb-2">
                              <span className="font-medium text-gray-700">Overall Score</span>
                              <span className="font-bold text-lg text-indigo-600">{candidate.overall_score || candidate.overall || 0}%</span>
                            </div>
                            <Progress value={candidate.overall_score || candidate.overall || 0} className="h-3" />
                          </div>
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div className="bg-blue-50 rounded-lg p-2 text-center">
                              <p className="text-blue-600 font-medium mb-1">Technical</p>
                              <p className="font-bold text-lg">{candidate.technical || 0}</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-2 text-center">
                              <p className="text-green-600 font-medium mb-1">Comm</p>
                              <p className="font-bold text-lg">{candidate.communication || 0}</p>
                            </div>
                            <div className="bg-purple-50 rounded-lg p-2 text-center">
                              <p className="text-purple-600 font-medium mb-1">Behavioral</p>
                              <p className="font-bold text-lg">{candidate.behavioral || 0}</p>
                            </div>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {candidate.duration || '0'}m
                            </div>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="group-hover:bg-indigo-500 group-hover:text-white transition-colors"
                              onClick={() => {
                                setSelectedCandidate(candidate);
                                setIsDetailsOpen(true);
                              }}
                            >
                              View Details
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transcripts">
            <Card className="border-2 border-gray-100">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-indigo-50/30 border-b">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  <div>
                    <CardTitle>Interview Transcripts</CardTitle>
                    <CardDescription className="mt-1">Detailed Q&A sessions with AI feedback</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {transcripts && transcripts.length > 0 ? (
                  <Accordion type="single" collapsible className="w-full">
                    {transcripts.map((t: any, idx: number) => {
                    // Create a unique key combining multiple fields to avoid duplicates
                    const itemValue = `transcript-${t.interview_id || 'unknown'}-${t.candidate_id || 'unknown'}-${idx}-${t.completed_at || Date.now()}`;
                    return (
                    <AccordionItem key={itemValue} value={itemValue}>
                      <AccordionTrigger className="text-left">
                        <div className="flex justify-between items-center w-full pr-4">
                          <div>
                            <span className="font-semibold">{t.candidate_name} - {t.role || 'Position'}</span>
                            <span className="text-sm text-muted-foreground ml-2">{t.candidate_id}</span>
                          </div>
                          <Badge>{t.qa.filter((q: any) => q.question && q.answer).length} Questions</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4">
                        {t.qa.filter((q: any) => q.question && q.answer).map((q: any, qIdx: number) => (
                          <div key={`${itemValue}-qa-${q.id || qIdx}`} className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center font-semibold text-indigo-600">
                                {qIdx + 1}
                              </div>
                              <div className="flex-1 space-y-3">
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Question</p>
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-gray-900">{q.question}</p>
                                    <ResponseTypeBadge responseType={q.responseType} />
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Answer</p>
                                  <p className="text-gray-700 whitespace-pre-wrap">{q.answer}</p>
                                </div>
                                {q.feedback && (
                                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                                    <p className="text-xs font-semibold text-blue-800 mb-1">AI Feedback</p>
                                    <p className="text-sm text-blue-700">{q.feedback}</p>
                                  </div>
                                )}
                                {q.scoring && q.scoring.overallScore !== undefined && (
                                  <div className="flex items-center gap-2 text-xs text-gray-600 mt-2">
                                    <Badge variant="outline" className="text-xs">
                                      Score: {q.scoring.overallScore}/10
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {t.qa.filter((q: any) => q.question && q.answer).length === 0 && (
                          <div className="text-center py-8 text-gray-500">
                            <p>No questions and answers available for this interview.</p>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );})}
                  </Accordion>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">No Transcripts Available</h3>
                    <p className="text-gray-500 mb-4">No interview transcripts found. Complete interviews to see Q&A transcripts here.</p>
                    {transcripts !== null && transcripts.length === 0 && (
                      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg max-w-2xl mx-auto">
                        <p className="text-sm text-yellow-800">
                          <strong>Debug Info:</strong> Check the browser console and server logs for detailed information about why transcripts are not showing.
                          The API found completed sessions but they may not have interview Q&A data stored yet.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="comparative">
            <Card className="border-2 border-gray-100">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-indigo-50/30 border-b">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  <div>
                    <CardTitle>Comparative Evaluation</CardTitle>
                    <CardDescription className="mt-1">Compare candidates across all dimensions</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Technical</TableHead>
                        <TableHead>Communication</TableHead>
                        <TableHead>Behavioral</TableHead>
                        <TableHead>Overall</TableHead>
                        <TableHead>Plagiarism %</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCandidates.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12">
                            <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-600 text-lg font-semibold mb-2">No Candidate Data Available</p>
                            <p className="text-gray-500 text-sm">Complete interviews to see comparative evaluations here.</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCandidates.slice(0, 20).map((candidate, candidateIdx) => (
                          <TableRow key={`comparative-${candidate.id || candidate.candidate_id || candidateIdx}-${candidate.interview_id || ''}-${candidateIdx}`}>
                            <TableCell className="font-medium">{candidate.id || candidate.candidate_id}</TableCell>
                            <TableCell>{candidate.name}</TableCell>
                            <TableCell>{candidate.role}</TableCell>
                            <TableCell>{candidate.technical}</TableCell>
                            <TableCell>{candidate.communication}</TableCell>
                            <TableCell>{candidate.behavioral}</TableCell>
                            <TableCell className="font-semibold">{candidate.overall_score || candidate.overall || 0}</TableCell>
                            <TableCell className={(candidate.plagiarism || 0) > 30 ? "text-red-600 font-bold" : (candidate.plagiarism || 0) > 15 ? "text-orange-600" : "text-gray-600"}>
                              {candidate.plagiarism || 0}%
                            </TableCell>
                            <TableCell>
                              <Badge variant={candidate.status === "shortlisted" ? "default" : "secondary"}>
                                {candidate.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="plagiarism">
            <Card className="border-2 border-gray-100">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-red-50/30 border-b">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-600" />
                  <div>
                    <CardTitle>Plagiarism Report</CardTitle>
                    <CardDescription className="mt-1">Candidates requiring authenticity review</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {plagiarismInsights.total === 0 ? (
                  <div className="text-center py-12">
                    <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 text-lg font-semibold mb-2">No Candidate Data Yet</p>
                    <p className="text-gray-500 text-sm">
                      Once interviews are completed, plagiarism analysis for every candidate will appear here.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="p-4 rounded-xl border bg-white shadow-sm">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Average Plagiarism</p>
                        <div className="text-3xl font-bold text-gray-900 mb-3">{plagiarismInsights.average}%</div>
                        <Progress value={plagiarismInsights.average} className="h-2" />
                      </div>
                      <div className="p-4 rounded-xl border bg-red-50 border-red-100">
                        <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">High Risk (&gt;=30%)</p>
                        <div className="text-3xl font-bold text-red-700">{plagiarismInsights.highRisk}</div>
                        <p className="text-xs text-red-600 mt-1">Immediate manual review recommended</p>
                      </div>
                      <div className="p-4 rounded-xl border bg-amber-50 border-amber-100">
                        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">Medium Risk (15-29%)</p>
                        <div className="text-3xl font-bold text-amber-700">{plagiarismInsights.mediumRisk}</div>
                        <p className="text-xs text-amber-600 mt-1">Cross-check recommended</p>
                      </div>
                      <div className="p-4 rounded-xl border bg-emerald-50 border-emerald-100">
                        <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Low Risk (&lt;15%)</p>
                        <div className="text-3xl font-bold text-emerald-700">{plagiarismInsights.lowRisk}</div>
                        <p className="text-xs text-emerald-600 mt-1">Authenticity verified</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Plagiarism %</TableHead>
                            <TableHead>Risk Level</TableHead>
                            <TableHead>Authenticity</TableHead>
                            <TableHead>Overall Score</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {plagiarismInsights.sortedCandidates.map((candidate, candidateIdx) => {
                            const plagiarismPct = candidate.plagiarism ?? 0;
                            const authenticityScore = candidate.authenticity ?? (100 - plagiarismPct);
                            const riskConfig =
                              plagiarismPct >= 30
                                ? { label: "High", className: "bg-red-100 text-red-700 border-red-200" }
                                : plagiarismPct >= 15
                                  ? { label: "Medium", className: "bg-amber-100 text-amber-700 border-amber-200" }
                                  : { label: "Low", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };

                            return (
                              <TableRow key={`plagiarism-${candidate.id || candidate.candidate_id || candidateIdx}-${candidate.interview_id || ''}-${candidateIdx}`}>
                                <TableCell className="font-medium">{candidate.id || candidate.candidate_id}</TableCell>
                                <TableCell>{candidate.name}</TableCell>
                                <TableCell>{candidate.role}</TableCell>
                                <TableCell>
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-xs font-semibold">
                                      <span>{plagiarismPct}%</span>
                                      <span className={plagiarismPct >= 30 ? "text-red-600" : plagiarismPct >= 15 ? "text-amber-600" : "text-emerald-600"}>
                                        {plagiarismPct >= 30 ? "Investigate" : plagiarismPct >= 15 ? "Monitor" : "Clean"}
                                      </span>
                                    </div>
                                    <Progress value={plagiarismPct} className="h-2" />
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge className={`${riskConfig.className} border`}>
                                    {riskConfig.label}
                                  </Badge>
                                </TableCell>
                                <TableCell>{authenticityScore}%</TableCell>
                                <TableCell>{candidate.overall_score || candidate.overall || 0}%</TableCell>
                                <TableCell>
                                  <Badge variant={candidate.status === "shortlisted" ? "default" : candidate.status === "rejected" ? "destructive" : "secondary"}>
                                    {candidate.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-2 border-gray-100 hover:border-indigo-300 transition-all duration-300 hover:shadow-lg">
                <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50/30 border-b">
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                    Score Distribution by Role
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={roleScoreData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                      <XAxis dataKey="role" tick={{ fill: '#64748b' }} />
                      <YAxis tick={{ fill: '#64748b' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#fff', 
                          border: '1px solid #e0e7ff',
                          borderRadius: '8px'
                        }} 
                      />
                      <Legend />
                      <Bar dataKey="technical" fill="#6366f1" name="Technical" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="communication" fill="#10b981" name="Communication" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="behavioral" fill="#f59e0b" name="Behavioral" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-2 border-gray-100 hover:border-indigo-300 transition-all duration-300 hover:shadow-lg">
                <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50/30 border-b">
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    Status Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={statusDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusDistribution.map((entry, index) => {
                          const colors = ['#10b981', '#f59e0b', '#ef4444'];
                          return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                        })}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-2 border-gray-100 hover:border-indigo-300 transition-all duration-300 hover:shadow-lg">
                <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50/30 border-b">
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-red-600" />
                    Plagiarism Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={plagiarismData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {plagiarismData.map((entry, index) => {
                          const colors = ['#10b981', '#f59e0b', '#ef4444'];
                          return <Cell key={`cell-${index}`} fill={colors[index]} />;
                        })}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-2 border-gray-100 hover:border-indigo-300 transition-all duration-300 hover:shadow-lg">
                <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50/30 border-b">
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-purple-600" />
                    Overall Score Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={scoreDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                      <XAxis dataKey="range" tick={{ fill: '#64748b' }} />
                      <YAxis tick={{ fill: '#64748b' }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#fff', 
                          border: '1px solid #e0e7ff',
                          borderRadius: '8px'
                        }} 
                      />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-2 border-gray-100 hover:border-indigo-300 transition-all duration-300 hover:shadow-lg">
                <CardHeader className="bg-gradient-to-r from-cyan-50 to-blue-50/30 border-b">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-cyan-600" />
                    Technical vs Authenticity
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <ScatterChart data={scatterData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                      <XAxis dataKey="technical" name="Technical" tick={{ fill: '#64748b' }} />
                      <YAxis dataKey="authenticity" name="Authenticity" tick={{ fill: '#64748b' }} />
                      <Tooltip 
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{ 
                          backgroundColor: '#fff', 
                          border: '1px solid #e0e7ff',
                          borderRadius: '8px'
                        }}
                      />
                      <Scatter dataKey="authenticity" fill="#06b6d4" fillOpacity={0.6} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-2 border-gray-100 hover:border-indigo-300 transition-all duration-300 hover:shadow-lg">
                <CardHeader className="bg-gradient-to-r from-indigo-50 to-violet-50/30 border-b">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-600" />
                    Multi-Dimensional Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#e0e7ff" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b' }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#64748b' }} />
                      <Radar 
                        name="Average" 
                        dataKey="value" 
                        stroke="#6366f1" 
                        fill="#6366f1" 
                        fillOpacity={0.6} 
                      />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Candidate Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Candidate Details
            </DialogTitle>
            <DialogDescription>
              Detailed performance analysis for {selectedCandidate?.name || 'this candidate'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedCandidate && (
            <div className="space-y-6 mt-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-600">Name</p>
                  <p className="text-lg">{selectedCandidate.name}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Role</p>
                  <p className="text-lg">{selectedCandidate.role}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">ID</p>
                  <p className="text-lg">{selectedCandidate.id || selectedCandidate.candidate_id}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Status</p>
                  <Badge variant={selectedCandidate.status === "shortlisted" ? "default" : "secondary"}>
                    {selectedCandidate.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Interview Date</p>
                  <p className="text-lg">{formatInterviewDate(selectedCandidate) || 'N/A'}</p>
                </div>
              </div>

              {/* Scores */}
              <div className="border rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-4">Performance Scores</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Overall</p>
                    <p className="text-2xl font-bold text-indigo-600">{selectedCandidate.overall || selectedCandidate.overall_score || 0}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Technical</p>
                    <p className="text-2xl font-bold text-blue-600">{selectedCandidate.technical || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Communication</p>
                    <p className="text-2xl font-bold text-green-600">{selectedCandidate.communication || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Behavioral</p>
                    <p className="text-2xl font-bold text-purple-600">{selectedCandidate.behavioral || 0}</p>
                  </div>
                </div>
              </div>

              {/* Interview Q&A from transcripts */}
              {transcripts && transcripts.length > 0 && (() => {
                const candidateTranscript = transcripts.find(t => 
                  t.candidate_id === selectedCandidate.candidate_id || 
                  t.candidate_name === selectedCandidate.name
                );
                
                if (candidateTranscript && candidateTranscript.qa.length > 0) {
                  return (
                    <div className="border rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-4">Interview Q&A ({candidateTranscript.qa.length} questions)</h3>
                      <div className="space-y-4">
                        {candidateTranscript.qa.map((qa: any, idx: number) => (
                          <div key={`dialog-qa-${candidateTranscript.interview_id || candidateTranscript.candidate_id}-${qa.id || idx}-${idx}`} className="border rounded p-4">
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center font-semibold text-indigo-600">
                                {idx + 1}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <p className="font-semibold text-gray-900">Q: {qa.question || 'Question unavailable'}</p>
                                  <ResponseTypeBadge responseType={qa.responseType} />
                                </div>
                                <p className="text-sm text-gray-700 mb-2">A: {qa.answer || 'Answer unavailable'}</p>
                                {qa.feedback && (
                                  <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-2">
                                    <p className="text-xs font-semibold text-blue-800 mb-1">AI Feedback:</p>
                                    <p className="text-xs text-blue-700">{qa.feedback}</p>
                                  </div>
                                )}
                                {qa.scoring && (
                                  <div className="mt-2 text-xs text-gray-500">
                                    Score: {qa.scoring.overallScore || qa.scoring.overall || 'N/A'}/10
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

