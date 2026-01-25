"use client";

import { useState, useRef, useEffect } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { analyzeResume, type AnalyzeResumeOutput } from "@/ai/flows/resume-analyzer";
import { generateRoleSpecificQuestions, type GenerateRoleSpecificQuestionsOutput } from "@/ai/flows/interview-question-generator";
import { useExams, useSubcategories } from "@/hooks/use-exams";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { saveQuestions, saveResumeAnalysis, saveVideoPreference, saveInterviewMode, clearAllData, isInterviewActive, endInterviewSession, saveExamConfig } from "@/lib/data-store";
import { ArrowRight, CheckCircle, FileText, Loader, Mic, Sparkles, Camera, Keyboard, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Combobox } from "./ui/combobox";
import { ResumeFeedback } from "./resume-feedback";
import { validateFile, getFileTypeIcon, formatFileSize } from '@/lib/file-validator';
import { convertFileToText, createDataURI, testPDFParsing } from '@/lib/file-converter';

// Preload libraries when component mounts
const preloadLibraries = async (setLoading: (loading: boolean) => void) => {
  try {
    setLoading(true);
    // This will start loading the libraries in the background
    const { convertFileToText: _ } = await import('@/lib/file-converter');
    console.log('Libraries preloaded successfully');
  } catch (error) {
    console.error('Failed to preload libraries:', error);
  } finally {
    setLoading(false);
  }
};

// Step 1: Resume Upload
const resumeSchema = z.object({
  resume: z.custom<FileList>().refine((files) => files?.length > 0, "A resume file is required."),
});
type ResumeFormValues = z.infer<typeof resumeSchema>;

// Step 2: Exam Details - Now loaded dynamically from database

// College options for CAT Aspirants
const catColleges = [
  {
    category: 'IIM (Indian Institutes of Management)',
    colleges: [
      { value: 'iim-ahmedabad', label: 'IIM Ahmedabad' },
      { value: 'iim-bangalore', label: 'IIM Bangalore' },
      { value: 'iim-calcutta', label: 'IIM Calcutta' },
      { value: 'iim-indore', label: 'IIM Indore' },
      { value: 'iim-lucknow', label: 'IIM Lucknow' },
      { value: 'iim-kozhikode', label: 'IIM Kozhikode' },
      { value: 'iim-cap', label: 'IIM CAP' },
      { value: 'iim-amritsar', label: 'IIM Amritsar' },
      { value: 'iim-shillong', label: 'IIM Shillong' },
      { value: 'iim-rohtak', label: 'IIM Rohtak' },
      { value: 'iim-raipur', label: 'IIM Raipur' },
      { value: 'iim-mumbai', label: 'IIM Mumbai' },
      { value: 'iim-udaipur', label: 'IIM Udaipur' },
      { value: 'iim-kashipur', label: 'IIM Kashipur' },
    ]
  },
  {
    category: 'Other Premier Institutes',
    colleges: [
      { value: 'fms-delhi', label: 'FMS Delhi' },
      { value: 'iift', label: 'IIFT' },
      { value: 'xlri', label: 'XLRI' },
      { value: 'spjimr', label: 'SPJIMR' },
      { value: 'mdi-gurgaon', label: 'MDI Gurgaon' },
      { value: 'imt', label: 'IMT' },
      { value: 'nmims', label: 'NMIMS' },
      { value: 'ximb', label: 'XIMB' },
      { value: 'mica', label: 'MICA' },
      { value: 'sibm-pune', label: 'SIBM Pune' },
      { value: 'scmhrd', label: 'SCMHRD' },
    ]
  }
];

const jobDetailsSchema = z.object({
  examId: z.string().min(1, 'Exam is required.'),
  subcategoryId: z.string().min(1, 'Subcategory is required.'),
  college: z.string().optional(),
  language: z.string({ required_error: 'Please select a language.' }),
}).refine((data) => {
  // College is required only for CAT Aspirants
  // Note: This validation will be handled in the component where we have access to subcategories
  return true;
}, {
  message: "College selection is required for CAT Aspirants",
  path: ["college"]
});
type JobDetailsFormValues = z.infer<typeof jobDetailsSchema>;

export function PrepareFlow() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [resumeAnalysis, setResumeAnalysis] = useState<AnalyzeResumeOutput | null>(null);
  const [questions, setQuestions] = useState<GenerateRoleSpecificQuestionsOutput | null>(null);
  
  // Load dynamic exams and subcategories
  const { exams, loading: examsLoading, error: examsError } = useExams();
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const { subcategories, loading: subcategoriesLoading, error: subcategoriesError } = useSubcategories(selectedExamId || undefined);

  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isCameraTestOpen, setIsCameraTestOpen] = useState(false);
  const videoTestRef = useRef<HTMLVideoElement>(null);
  
  // Microphone test state
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [isStartingInterview, setIsStartingInterview] = useState(false);
  
  // File validation state
  const [fileValidationError, setFileValidationError] = useState<string | null>(null);
  const [isValidatingFile, setIsValidatingFile] = useState(false);
  const [librariesLoading, setLibrariesLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  
  // Microphone monitoring effect
  useEffect(() => {
    if (!isMuted) {
      const startMicrophoneMonitoring = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const analyserNode = audioCtx.createAnalyser();
          const source = audioCtx.createMediaStreamSource(stream);
          
          analyserNode.fftSize = 256;
          source.connect(analyserNode);
          
          setAudioContext(audioCtx);
          setAnalyser(analyserNode);
          
          const updateVolume = () => {
            if (analyserNode) {
              const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
              analyserNode.getByteFrequencyData(dataArray);
              const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
              setVolume(average / 255);
            }
          };
          
          const interval = setInterval(updateVolume, 100);
          
          return () => {
            clearInterval(interval);
            stream.getTracks().forEach(track => track.stop());
            if (audioCtx.state !== 'closed') {
              audioCtx.close();
            }
          };
        } catch (error) {
          console.error('Error accessing microphone:', error);
        }
      };
      
      const cleanup = startMicrophoneMonitoring();
      return () => {
        cleanup.then(cleanupFn => cleanupFn?.());
      };
    } else {
      // Clean up when muted
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
      setAudioContext(null);
      setAnalyser(null);
      setVolume(0);
    }
  }, [isMuted]);
  
  const { toast } = useToast();

  const resumeForm = useForm<ResumeFormValues>({
    resolver: zodResolver(resumeSchema),
  });

  const jobDetailsForm = useForm<JobDetailsFormValues>({
    resolver: zodResolver(jobDetailsSchema),
    defaultValues: {
      examId: '',
      subcategoryId: '',
      college: '',
      language: 'English',
    },
  });

  const watchedExamId = jobDetailsForm.watch('examId');
  
  // Update selected exam ID when form changes
  useEffect(() => {
    if (watchedExamId) {
      setSelectedExamId(parseInt(watchedExamId));
      // Clear subcategory when exam changes
      jobDetailsForm.setValue('subcategoryId', '');
    }
  }, [watchedExamId, jobDetailsForm]);

  // Compute CAT selection status for conditional rendering
  const selectedSubcategoryId = jobDetailsForm.watch('subcategoryId');
  const selectedSubcategory = subcategories.find(sub => sub.id.toString() === selectedSubcategoryId);
  const isCATSelected = selectedSubcategory?.name?.toLowerCase() === 'cat';

  const handleStopCamera = () => {
    if (videoTestRef.current?.srcObject) {
      const stream = videoTestRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoTestRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    // Cleanup stream on component unmount
    return () => {
      handleStopCamera();
    };
  }, []);

  // Clear any existing interview data when starting fresh
  useEffect(() => {
    // Check if there's an active interview session
    if (isInterviewActive()) {
      // Block error toast - log to console only
      // toast({
      //   variant: "destructive",
      //   title: "Active Interview Session Detected",
      //   description: "There's an active interview session. Please complete it or start fresh.",
      // });
      console.error("Active Interview Session Detected: There's an active interview session. Please complete it or start fresh.");
      // End the active session
      endInterviewSession();
    }
    clearAllData();
  }, [toast]);

  // Preload libraries when component mounts
  useEffect(() => {
    preloadLibraries(setLibrariesLoading);
  }, []);

  // Clear validation errors when form is reset
  const clearValidationErrors = () => {
    setFileValidationError(null);
    setIsValidatingFile(false);
  };

  // File validation function
  const validateSelectedFile = async (file: File) => {
    setIsValidatingFile(true);
    setFileValidationError(null);
    
    try {
      // Quick validation (under 100ms)
      const validation = validateFile(file);
      
      if (!validation.isValid) {
        setFileValidationError(validation.error || 'Invalid file');
        return false;
      }

      // Test PDF parsing for debugging
      if (file.type === 'application/pdf') {
        await testPDFParsing(file);
      }

      // Additional file content validation with timeout (max 3 seconds)
      const conversionPromise = convertFileToText(file);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('File validation timeout')), 3000)
      );
      
      const conversion = await Promise.race([conversionPromise, timeoutPromise]) as any;
      
      if (!conversion.success) {
        setFileValidationError(conversion.error || 'Unable to read file content');
        return false;
      }

      setFileValidationError(null);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'File validation timeout') {
        setFileValidationError('File validation took too long. Please try a smaller file or different format.');
      } else {
        setFileValidationError('File validation failed. Please try again.');
      }
      return false;
    } finally {
      setIsValidatingFile(false);
    }
  };

  const handleTestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoTestRef.current) {
        videoTestRef.current.srcObject = stream;
      }
    } catch (err) {
        // Block error toast - log to console only
        // toast({
        //     variant: "destructive",
        //     title: "Camera Access Denied",
        //     description: "Please enable camera permissions in your browser settings.",
        // });
        console.error("Camera Access Denied: Please enable camera permissions in your browser settings.");
        setIsCameraTestOpen(false);
    }
  };

  const handleCameraTestOpenChange = (open: boolean) => {
    if (open) {
        handleTestCamera();
    } else {
        handleStopCamera();
    }
    setIsCameraTestOpen(open);
  };

  const handleStartInterview = async (mode: 'voice' | 'text') => {
    setIsStartingInterview(true);
    try {
      // Save preferences
      saveVideoPreference(videoEnabled);
      saveInterviewMode(mode);
      
      // Show loading toast
      toast({
        title: "Starting Interview",
        description: mode === 'voice' ? "Preparing your voice interview..." : "Preparing your text interview...",
      });
      
      // Small delay to show the loading state
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Navigate to interview page
      router.push('/interview');
    } catch (error) {
      // Block error toast - log to console only
      // toast({
      //   variant: "destructive",
      //   title: "Error",
      //   description: "Failed to start interview. Please try again.",
      // });
      console.error("Error: Failed to start interview. Please try again.");
      setIsStartingInterview(false);
    }
  };

  const handleResumeSubmit: SubmitHandler<ResumeFormValues> = async (data) => {
    setIsLoading(true);
    const file = data.resume[0];
    
    // Show immediate feedback
    toast({
      title: "Processing Resume",
      description: "Converting file and preparing for analysis...",
    });
    
    try {
      // Convert file to text first
      const conversion = await convertFileToText(file);
      
      if (!conversion.success) {
        throw new Error(conversion.error || 'Failed to convert file');
      }
      
      // Create a data URI with the extracted text
      const resumeDataUri = createDataURI(file, conversion.text || '');
      
      // Show analysis progress
      toast({
        title: "Analyzing Resume",
        description: "Our AI is providing comprehensive feedback...",
      });
      
      // Determine file type for analysis
      let fileType: 'pdf' | 'doc' | 'docx' = 'pdf';
      if (file.name.endsWith('.doc')) fileType = 'doc';
      else if (file.name.endsWith('.docx')) fileType = 'docx';
      
      const analysis = await analyzeResume({ 
        resumeDataUri, 
        fileType, 
        fileName: file.name 
      });
      
      if (!analysis.isResume) {
        // Block error toast - log to console only
        // toast({
        //   variant: "destructive",
        //   title: "Invalid File",
        //   description: "The uploaded file does not appear to be a resume. Please upload a valid resume.",
        // });
        console.error("Invalid File: The uploaded file does not appear to be a resume. Please upload a valid resume.");
        resumeForm.reset();
        clearValidationErrors();
        return;
      }
      
      setResumeAnalysis(analysis);
      saveResumeAnalysis(analysis);
      clearValidationErrors();
      
      // Show success feedback
      toast({
        title: "Analysis Complete!",
        description: "Your resume has been analyzed with detailed feedback.",
      });
      
      // Keep on the same page; show Interview Details card below
      // setStep(2);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      // Block error toast - log to console only
      // toast({
      //   variant: "destructive",
      //   title: "Error Analyzing Resume",
      //   description: errorMessage,
      // });
      console.error("Error Analyzing Resume:", errorMessage);
      
      // Set validation error for display
      setFileValidationError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleJobDetailsSubmit: SubmitHandler<JobDetailsFormValues> = async (data) => {
    if (!resumeAnalysis) {
        // Don't show toast for resume analysis errors to avoid frontend popups
        // toast({ variant: 'destructive', title: 'Error', description: 'Resume analysis is not available.' });
        console.error('Resume analysis is not available');
        return;
    }
    setIsLoading(true);
    jobDetailsForm.clearErrors();

    try {
        // Find the selected exam and subcategory
        const selectedExam = exams.find(exam => exam.id.toString() === data.examId);
        const selectedSubcategory = subcategories.find(sub => sub.id.toString() === data.subcategoryId);
        
        if (!selectedExam || !selectedSubcategory) {
            throw new Error('Selected exam or subcategory not found');
        }

        // Validate college selection for CAT aspirants
        if (selectedSubcategory.name.toLowerCase().includes('cat') && !data.college) {
            jobDetailsForm.setError('college', {
                type: 'manual',
                message: 'College selection is required for CAT Aspirants'
            });
            return;
        }

        // Fetch exam configuration if available
        try {
            const configResponse = await fetch(`/api/exam-config?examId=${data.examId}&subcategoryId=${data.subcategoryId}`);
            const configData = await configResponse.json();
            
            if (configData.success && configData.data) {
                console.log('Found exam configuration:', configData.data);
                saveExamConfig({
                    numQuestions: configData.data.num_questions || configData.data.numQuestions,
                    randomizeQuestions: configData.data.randomize_questions ?? configData.data.randomizeQuestions ?? false,
                    examId: data.examId,
                    subcategoryId: data.subcategoryId,
                    examName: selectedExam.name,
                    subcategoryName: selectedSubcategory.name
                });
            } else {
                console.log('No exam configuration found for this exam/subcategory combination');
                // Clear any previous config
                saveExamConfig({
                    numQuestions: 0, // 0 means no limit configured
                    randomizeQuestions: false,
                    examId: data.examId,
                    subcategoryId: data.subcategoryId,
                    examName: selectedExam.name,
                    subcategoryName: selectedSubcategory.name
                });
            }
        } catch (configError) {
            console.warn('Failed to fetch exam config, continuing without it:', configError);
        }

        const generatedQuestions = await generateRoleSpecificQuestions({
            jobRole: selectedSubcategory.name,
            company: selectedExam.name,
            college: data.college, // Add college information
            language: data.language,
            resumeText: `${resumeAnalysis.skills.join(', ')}\n\n${resumeAnalysis.experienceSummary}`,
            // Pass exam and subcategory information for filtering
            examId: parseInt(data.examId),
            subcategoryId: parseInt(data.subcategoryId),
            subcategoryName: selectedSubcategory.name
        });
        
        console.log('Generated questions with params:', {
            jobRole: selectedSubcategory.name,
            company: selectedExam.name,
            college: data.college,
            language: data.language
        });
        setQuestions(generatedQuestions);
        saveQuestions(generatedQuestions, data.language, selectedSubcategory.name, selectedExam.name, data.college);
        setStep(3);
    } catch (error) {
        // Block error toast - log to console only
        // toast({
        //     variant: "destructive",
        //     title: "Error During Preparation",
        //     description: error instanceof Error ? error.message : "An unknown error occurred. Please try again.",
        // });
        console.error("Error During Preparation:", error instanceof Error ? error.message : "An unknown error occurred. Please try again.");
    } finally {
        setIsLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
          <Card className="rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.06)] border border-slate-200">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="font-headline text-xl">Resume Analysis</CardTitle>
                  <CardDescription>Upload your resume for AI-powered analysis and personalized feedback</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Form {...resumeForm}>
                <form onSubmit={resumeForm.handleSubmit(handleResumeSubmit)} className="space-y-6">
                  <FormField
                    control={resumeForm.control}
                    name="resume"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resume File</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <input
                              id="resume-file"
                              type="file"
                              accept=".pdf,.doc,.docx"
                              className="hidden"
                              onChange={async (e) => {
                                const files = e.target.files;
                                field.onChange(files);
                                if (files?.[0]) {
                                  const file = files[0];
                                  const isValid = await validateSelectedFile(file);
                                  if (!isValid) {
                                    field.onChange(null);
                                  }
                                }
                              }}
                            />
                            <label
                              htmlFor="resume-file"
                              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                              onDragLeave={() => setIsDragging(false)}
                              onDrop={async (e) => {
                                e.preventDefault();
                                setIsDragging(false);
                                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                  const file = e.dataTransfer.files[0];
                                  const dt = new DataTransfer();
                                  dt.items.add(file);
                                  field.onChange(dt.files);
                                  await validateSelectedFile(file);
                                }
                              }}
                              className={`block cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-white/60 hover:border-blue-400 hover:bg-blue-50'}`}
                            >
                              <div className="flex flex-col items-center gap-3">
                                <div className="h-12 w-12 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 16a1 1 0 0 1-1-1V9.414l-2.293 2.293a1 1 0 1 1-1.414-1.414l4-4a1 1 0 0 1 1.414 0l4 4a1 1 0 0 1-1.414 1.414L13 9.414V15a1 1 0 0 1-1 1Z"/><path d="M20 15a1 1 0 1 1 2 0v2a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-2a1 1 0 1 1 2 0v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2Z"/></svg>
                                </div>
                                <div className="text-slate-800 font-medium">Choose file or drag and drop</div>
                                <div className="text-xs text-slate-500">Supported formats: PDF, DOC, DOCX (Max 10MB)</div>
                                <div className="flex items-center gap-4 text-[11px] text-slate-400">
                                  <span>ATS Optimized</span>
                                  <span>Skills Detection</span>
                                  <span>Experience Analysis</span>
                                </div>
                              </div>
                            </label>
                            {field.value?.[0] && (
                              <div className={`flex items-center gap-2 p-2 rounded-md border ${
                                fileValidationError ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                              }`}>
                                <span className="text-lg">{getFileTypeIcon(field.value[0].type)}</span>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium block truncate">{field.value[0].name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatFileSize(field.value[0].size)} • {field.value[0].type}
                                  </span>
                                </div>
                                {isValidatingFile && (
                                  <Loader className="w-4 h-4 animate-spin text-blue-500" />
                                )}
                                {!isValidatingFile && !fileValidationError && (
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                )}
                              </div>
                            )}
                          </div>
                        </FormControl>
                        <FormMessage />
                        
                        {/* File validation error */}
                        {fileValidationError && (
                          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                            <AlertCircle className="w-4 h-4 text-red-500" />
                            <div className="flex-1">
                              <span className="text-sm text-red-700 block">{fileValidationError}</span>
                              {fileValidationError.includes('PDF processing library not available') && (
                                <div className="mt-2 text-xs text-red-600">
                                  <p>• Try refreshing the page</p>
                                  <p>• Check your internet connection</p>
                                  <p>• Try uploading a different file format (DOC, DOCX)</p>
                                </div>
                              )}
                              {fileValidationError.includes('Failed to load PDF processing libraries') && (
                                <div className="mt-2 text-xs text-red-600">
                                  <p>• Try refreshing the page</p>
                                  <p>• Check your internet connection</p>
                                  <p>• Try uploading a DOC or DOCX file instead</p>
                                  <p>• Contact support if the issue persists</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        

                        <p className="text-sm text-muted-foreground">
                          Supported formats: PDF, DOC, DOCX (Max 10MB)
                        </p>
                        {field.value?.[0] && field.value[0].size > 5 * 1024 * 1024 && (
                          <div className="flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                            <AlertCircle className="w-4 h-4 text-yellow-500" />
                            <span className="text-sm text-yellow-700">
                              Large file detected. Processing may take longer than usual.
                            </span>
                          </div>
                        )}
                      </FormItem>
                    )}
                  />
                  <Button 
                    type="submit" 
                    disabled={isLoading || isValidatingFile || !!fileValidationError || !resumeForm.watch('resume')?.[0] || librariesLoading} 
                    className="w-full rounded-2xl py-6 text-[15px] disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {isLoading ? (
                      <>
                        <Loader className="animate-spin mr-2" />
                        Analyzing Resume...
                      </>
                    ) : isValidatingFile ? (
                      <>
                        <Loader className="animate-spin mr-2" />
                        Validating File...
                      </>
                    ) : (
                      <>
                        Analyze Resume
                        <ArrowRight className="ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
          {resumeAnalysis && (
            <div className="mt-6 space-y-6">
              {/* Success banner */}
              <div className="flex items-start rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="w-5 h-5" />
                  <div>
                    <div className="font-semibold">Analysis Complete!</div>
                    <div className="text-sm">Your resume has been successfully analyzed</div>
                  </div>
                </div>
              </div>

              {/* Analysis details */}
              <ResumeFeedback analysis={resumeAnalysis} />
            </div>
          )}

          {/* Always show Interview Details right below on the same page */}
          <div className="mt-8 grid md:grid-cols-1 gap-8 items-start">
            <Card className="rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.06)] border border-slate-200">
                <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="font-headline text-xl">Interview Details</CardTitle>
                        <CardDescription>Configure your interview preferences and target role</CardDescription>
                      </div>
                    </div>
                </CardHeader>
                <CardContent>
                <Form {...jobDetailsForm}>
                    <form onSubmit={jobDetailsForm.handleSubmit(handleJobDetailsSubmit)} className="space-y-6">
                       <div className="grid sm:grid-cols-2 gap-6">
                            <FormField
                                control={jobDetailsForm.control}
                                name="examId"
                                render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel className="text-sm font-medium text-slate-700 mb-2">
                                      Interview Type <span className="text-red-500">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                          <SelectTrigger className="rounded-xl border-slate-300 p-3">
                                            <SelectValue placeholder="Select interview type..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {exams.map(exam => (
                                              <SelectItem key={exam.id} value={exam.id.toString()}>
                                                {exam.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={jobDetailsForm.control}
                                name="subcategoryId"
                                render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel className="text-sm font-medium text-slate-700 mb-2">
                                      Target Role <span className="text-red-500">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                          <SelectTrigger className="rounded-xl border-slate-300 p-3">
                                            <SelectValue placeholder="Select target role..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {subcategories.map(sub => (
                                              <SelectItem key={sub.id} value={sub.id.toString()}>
                                                {sub.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                       </div>
                       
                       {/* College selection for CAT Aspirants */}
                       {isCATSelected && (
                           <div className="mb-6">
                               <FormField
                                   control={jobDetailsForm.control}
                                   name="college"
                                   render={({ field }) => (
                                       <FormItem className="flex flex-col">
                                           <FormLabel className="text-sm font-medium text-slate-700 mb-2">
                                               Target College <span className="text-red-500">*</span>
                                           </FormLabel>
                                           <FormControl>
                                               <Select onValueChange={field.onChange} value={field.value}>
                                                   <SelectTrigger className="rounded-xl border-slate-300 p-3">
                                                       <SelectValue placeholder="Select your target college..." />
                                                   </SelectTrigger>
                                                   <SelectContent>
                                                       {catColleges.map((category) => (
                                                           <div key={category.category}>
                                                               <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                                                                   {category.category}
                                                               </div>
                                                               {category.colleges.map((college) => (
                                                                   <SelectItem key={college.value} value={college.value}>
                                                                       {college.label}
                                                                   </SelectItem>
                                                               ))}
                                                           </div>
                                                       ))}
                                                   </SelectContent>
                                               </Select>
                                           </FormControl>
                                           <FormMessage />
                                           <p className="text-xs text-slate-600 mt-2">
                                               Selecting your target college helps us generate more relevant interview questions
                                           </p>
                                       </FormItem>
                                   )}
                               />
                           </div>
                       )}
                       
                       <div className="grid sm:grid-cols-2 gap-6">
                      <FormField
                        control={jobDetailsForm.control}
                        name="language"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium text-slate-700 mb-2">Interview Language</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger className="rounded-xl border-slate-300 p-3">
                                  <SelectValue placeholder="Select a language" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="English">English</SelectItem>
                                <SelectItem value="Hindi">Hindi</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-slate-700 mb-2">Experience Level</FormLabel>
                        <Select defaultValue="fresher">
                          <SelectTrigger className="rounded-xl border-slate-300 p-3">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fresher">Fresher (0-1 years)</SelectItem>
                            <SelectItem value="junior">Junior (1-3 years)</SelectItem>
                            <SelectItem value="mid">Mid-level (3-5 years)</SelectItem>
                            <SelectItem value="senior">Senior (5+ years)</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                      </div>
                      
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-slate-700 mb-2">Additional Notes (Optional)</FormLabel>
                        <Textarea
                          rows={3}
                          placeholder="Any specific areas you'd like to focus on or additional information..."
                          className="rounded-xl border-slate-300 p-3 resize-none"
                        />
                      </FormItem>

                     <Button 
                       type="submit" 
                       disabled={!resumeAnalysis || isLoading || examsLoading || subcategoriesLoading || !selectedExamId || !jobDetailsForm.watch('subcategoryId')} 
                       className={`w-full rounded-2xl py-4 px-6 font-semibold text-lg transition-all duration-300 ${
                         resumeAnalysis && !isLoading && !examsLoading && !subcategoriesLoading && selectedExamId && jobDetailsForm.watch('subcategoryId')
                           ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl hover:shadow-2xl transform hover:-translate-y-1'
                           : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                       }`}
                     >
                       <span className="flex items-center justify-center space-x-2">
                         {!resumeAnalysis ? (
                           <>
                             <AlertCircle className="w-5 h-5" />
                             <span>Complete Resume Analysis First</span>
                           </>
                         ) : isLoading ? (
                           <>
                             <Loader className="animate-spin" />
                             <span>Starting Interview...</span>
                           </>
                         ) : (
                           <>
                             <span>Start Your Mock Interview</span>
                             <ArrowRight className="w-5 h-5" />
                           </>
                         )}
                       </span>
                     </Button>
                     {!resumeAnalysis && (
                       <p className="text-sm text-slate-500 text-center mt-2">
                         Please upload and analyze your resume before starting the interview
                       </p>
                     )}
                    </form>
                </Form>
                </CardContent>
            </Card>
          </div>
          </>
        );
      case 2:
        return (
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div className="space-y-6">
              <Card className="rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.06)] border border-slate-200">
                <CardHeader>
                  <CardTitle className="font-headline flex items-center gap-2">
                    <CheckCircle className="text-green-500" />
                    Resume Analysis Complete
                  </CardTitle>
                  <CardDescription>
                    Here's your comprehensive resume feedback. Now, tell us about the exam you're preparing for.
                  </CardDescription>
                </CardHeader>
              </Card>
              {resumeAnalysis && <ResumeFeedback analysis={resumeAnalysis} />}
            </div>
            <Card className="rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.06)] border border-slate-200">
                <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="font-headline text-xl">Interview Details</CardTitle>
                        <CardDescription>Configure your interview preferences and target role</CardDescription>
                      </div>
                    </div>
                </CardHeader>
                <CardContent>
                <Form {...jobDetailsForm}>
                    <form onSubmit={jobDetailsForm.handleSubmit(handleJobDetailsSubmit)} className="space-y-6">
                       <div className="grid sm:grid-cols-2 gap-4">
                            <FormField
                                control={jobDetailsForm.control}
                                name="examId"
                                render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Exam</FormLabel>
                                    <FormControl>
                                        <Combobox
                                            options={exams.map(exam => ({ value: exam.id.toString(), label: exam.name }))}
                                            value={field.value}
                                            onChange={field.onChange}
                                            placeholder={examsLoading ? "Loading exams..." : "Select exam..."}
                                            searchPlaceholder="Search exams..."
                                            emptyPlaceholder={examsError ? "Error loading exams" : "No exams found."}
                                            creatable={false}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <FormField
                                control={jobDetailsForm.control}
                                name="subcategoryId"
                                render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Subcategory</FormLabel>
                                    <FormControl>
                                        <Combobox
                                            options={subcategories.map(sub => ({ value: sub.id.toString(), label: sub.name }))}
                                            value={field.value}
                                            onChange={field.onChange}
                                            placeholder={subcategoriesLoading ? "Loading subcategories..." : "Select subcategory..."}
                                            searchPlaceholder="Search subcategories..."
                                            emptyPlaceholder={subcategoriesError ? "Error loading subcategories" : "No subcategories found."}
                                            creatable={false}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            
                       </div>
                       
                      <FormField
                        control={jobDetailsForm.control}
                        name="language"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Interview Language</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a language" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="English">English</SelectItem>
                                <SelectItem value="Hindi">Hindi</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                     <Button type="submit" disabled={isLoading || examsLoading || subcategoriesLoading || !selectedExamId} className="rounded-2xl py-5 w-full">
                        {isLoading ? <Loader className="animate-spin" /> : 'Start Your Mock Interview'}
                        <ArrowRight className="ml-2" />
                    </Button>
                    </form>
                </Form>
                </CardContent>
            </Card>
          </div>
        );
      case 3:
        return (
            <div className="space-y-8">
              <Card className="rounded-3xl shadow-[0_10px_30px_rgba(0,0,0,0.06)] border border-slate-200">
                <CardHeader>
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                    <h1 className="text-2xl font-bold text-slate-800">Ready for your interview!</h1>
                  </div>
                  <p className="text-slate-600">
                    Your personalized interview is ready. Choose your preferred interview format below.
                  </p>
                </CardHeader>
                <CardContent className="space-y-8">
                  {/* Camera Setup */}
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 mb-4">Optional: Camera Setup (For Voice Interview)</h3>
                    
                    <div className="flex items-center justify-between p-4 bg-blue-50 rounded-2xl mb-4">
                      <div className="flex items-center">
                        <Camera className="w-6 h-6 text-blue-600 mr-3" />
                        <div>
                          <span className="font-semibold text-slate-800">Enable Video for Enhanced Feedback</span>
                          <p className="text-sm text-slate-600">This allows our AI to provide feedback on your body language and visual presentation. Your video is not stored.</p>
                        </div>
                      </div>
                      <Switch checked={videoEnabled} onCheckedChange={setVideoEnabled} />
                    </div>

                    {videoEnabled && (
                      <Dialog open={isCameraTestOpen} onOpenChange={handleCameraTestOpenChange}>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="flex items-center px-4 py-2 bg-slate-100 rounded-xl text-slate-700 hover:bg-slate-200 transition-colors">
                            <Camera className="w-5 h-5 mr-2" />
                            Test Camera
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Camera Test</DialogTitle>
                          </DialogHeader>
                          <div className="aspect-video bg-muted rounded-md overflow-hidden">
                            <video ref={videoTestRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>

                  {/* Microphone Test */}
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 mb-4">Microphone Test</h3>
                    
                    <div className="flex items-center justify-between p-4 bg-green-50 rounded-2xl mb-4">
                      <div className="flex items-center">
                        <Mic className="w-6 h-6 text-green-600 mr-3" />
                        <div>
                          <span className="font-semibold text-slate-800">Enable Microphone</span>
                          <p className="text-sm text-slate-600">Test your microphone to ensure clear audio during the voice interview.</p>
                        </div>
                      </div>
                      <Switch checked={!isMuted} onCheckedChange={(checked) => setIsMuted(!checked)} />
                    </div>

                    {!isMuted && (
                      <div className="space-y-4">
                        {/* Volume Level Indicator */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-slate-700">Volume Level</span>
                            <span className="text-sm text-green-600 font-semibold">Working</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${Math.min(volume * 100, 75)}%` }}></div>
                          </div>
                        </div>

                        {/* Test Instructions */}
                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                          <p className="text-sm text-blue-800">
                            <strong>Test Instructions:</strong> Speak into your microphone to see the volume level indicator move. 
                            Make sure you can see the bar moving when you speak.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Interview Options */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <button
                      onClick={() => handleStartInterview('voice')}
                      disabled={isStartingInterview}
                      className="group p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border-2 border-blue-200 hover:border-blue-400 transition-all duration-300 hover:shadow-lg text-left"
                    >
                      <div className="flex items-center justify-center mb-4">
                        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                          <Mic className="w-8 h-8 text-white" />
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">Start Voice Interview</h3>
                      <p className="text-slate-600 text-sm">Practice with spoken questions and answers for a realistic interview experience.</p>
                    </button>

                    <button
                      onClick={() => handleStartInterview('text')}
                      disabled={isStartingInterview}
                      className="group p-6 bg-gradient-to-br from-slate-50 to-gray-50 rounded-2xl border-2 border-slate-200 hover:border-slate-400 transition-all duration-300 hover:shadow-lg text-left"
                    >
                      <div className="flex items-center justify-center mb-4">
                        <div className="w-16 h-16 bg-slate-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                          <FileText className="w-8 h-8 text-white" />
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2">Start Text Interview</h3>
                      <p className="text-slate-600 text-sm">Practice with written questions and typed responses for focused content preparation.</p>
                    </button>
                  </div>
                </CardContent>
              </Card>
            </div>
        );
      default:
        return null;
    }
  };

  return <div>{renderStep()}</div>;
}
