# 🎯 **AI Interviewer - TIME AI Powered Coach** 🚀

> **Your AI-powered interview preparation companion with resume analysis, personalized questions, and real-time feedback**

[![Next.js](https://img.shields.io/badge/Next.js-15.3.3-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.3-black?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-3.8-blue?style=for-the-badge&logo=docker)](https://www.docker.com/)

---

## 🌟 **Overview**

**AI Interviewer** is a cutting-edge, AI-powered interview preparation platform that transforms how candidates prepare for job interviews. Built with Next.js 15, TypeScript, and powered by Google's Gemini AI, it provides:

- **📄 Smart Resume Analysis** - AI-powered ATS scoring and detailed feedback
- **🎯 Personalized Interview Questions** - Tailored to your resume and job role
- **🎙️ Voice & Text Interviews** - Multiple interaction modes for flexibility
- **📊 Real-time Scoring & Feedback** - Instant performance evaluation
- **🎥 Camera & Microphone Integration** - Professional interview simulation
- **📱 Responsive Design** - Works seamlessly on all devices

---

## ✨ **Key Features**

### **🎯 Resume Analysis Engine**
- **ATS Score Calculation** - Get your resume's Applicant Tracking System compatibility score
- **Section-wise Ratings** - Detailed analysis of summary, skills, experience, education, and formatting
- **Grammar & Content Feedback** - Actionable suggestions for improvement
- **Skills Extraction** - AI identifies and categorizes your technical and soft skills
- **Comprehensive Summary** - Complete resume overview with strengths and areas for improvement

### **🤖 AI Interview Agent**
- **Personalized Questions** - Questions generated based on your resume content
- **Dynamic Follow-ups** - AI adapts questions based on your responses
- **Real-time Evaluation** - Instant scoring and feedback for each answer
- **Conversational AI** - Natural, engaging interview experience
- **Performance Analytics** - Detailed scoring across multiple dimensions

### **🎙️ Interview Modes**
- **Voice Mode** - Speak naturally with real-time speech recognition
- **Text Mode** - Type your responses for precise communication
- **Hybrid Mode** - Switch between voice and text as needed
- **Real-time Feedback** - Visual indicators for voice activity and quality

### **📱 User Experience**
- **Responsive Design** - Optimized for desktop, tablet, and mobile
- **Modern UI/UX** - Clean, professional interface with smooth animations
- **Navigation Warnings** - Prevents accidental data loss during interviews
- **Progress Tracking** - Monitor interview progress and completion status

---

## 🛠️ **Technology Stack**

- **Frontend**: Next.js 15, React 18, TypeScript 5
- **Styling**: Tailwind CSS, Shadcn UI Components
- **AI Integration**: Google Gemini AI (Genkit Framework)
- **Audio Processing**: Web Audio API, Speech Recognition API
- **File Handling**: PDF.js, Mammoth.js for document processing
- **State Management**: React Hooks, Local Storage
- **Deployment**: Docker, Docker Compose

---

## 🚀 **Quick Start**

### **Option 1: Docker (Recommended)**

```bash
# Clone the repository
git clone https://github.com/Avinashhmavi/AI-INTERVIEW.git
cd AI-INTERVIEW

# Create environment file
cp .env.example .env
# Edit .env with your Google AI API key

# Run with Docker Compose
docker-compose up -d

# Access the application
open http://localhost:3000
```

### **Option 2: Local Development**

```bash
# Clone the repository
git clone https://github.com/Avinashhmavi/AI-INTERVIEW.git
cd AI-INTERVIEW

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Google AI API key

# Run development server
npm run dev

# Access the application
open http://localhost:3000
```

---

## 🔧 **Environment Configuration**

Create a `.env` file in the root directory:

```env
# Google AI API Configuration
# Primary API key (required)
GOOGLE_API_KEY=your_primary_google_ai_api_key_here

# Secondary API keys (optional, for rotation and fallback)
GOOGLE_API_KEY_2=your_secondary_google_ai_api_key_here
GOOGLE_API_KEY_3=your_tertiary_google_ai_api_key_here

# API Key Rotation Configuration
# Strategy: 'round-robin', 'least-used', or 'random' (default: 'round-robin')
API_KEY_ROTATION_STRATEGY=round-robin

# Cooldown duration in milliseconds when a key fails (default: 300000 = 5 minutes)
API_KEY_COOLDOWN_DURATION=300000

# Maximum retries before giving up (default: 3)
API_KEY_MAX_RETRIES=3

# OpenAI API Configuration (for TTS)
OPENAI_API_KEY=your_primary_openai_api_key_here

# Secondary OpenAI API keys (optional, for rotation and fallback)
OPENAI_API_KEY_2=your_secondary_openai_api_key_here
OPENAI_API_KEY_3=your_tertiary_openai_api_key_here

# OpenAI API Key Rotation Configuration
# Strategy: 'round-robin', 'least-used', or 'random' (default: 'round-robin')
OPENAI_API_KEY_ROTATION_STRATEGY=round-robin

# Cooldown duration in milliseconds when a key fails (default: 300000 = 5 minutes)
OPENAI_API_KEY_COOLDOWN_DURATION=300000

# Maximum retries before giving up (default: 3)
OPENAI_API_KEY_MAX_RETRIES=3

# Application Configuration
NEXT_PUBLIC_APP_NAME=AI Interviewer
NEXT_PUBLIC_APP_VERSION=2.0.0
```

### **Getting API Keys**

#### **Google AI API Keys**
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create multiple API keys for better reliability and load distribution
3. Copy the keys to your `.env` file as `GOOGLE_API_KEY`, `GOOGLE_API_KEY_2`, and `GOOGLE_API_KEY_3`

#### **OpenAI API Keys**
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create multiple API keys for better reliability and load distribution
3. Copy the keys to your `.env` file as `OPENAI_API_KEY`, `OPENAI_API_KEY_2`, and `OPENAI_API_KEY_3`

### **API Key Rotation Features**

The application now supports intelligent API key rotation for both Google AI and OpenAI APIs with the following features:

- **Multiple API Keys**: Use up to 3 Google AI API keys and up to 3 OpenAI API keys for redundancy
- **Automatic Fallback**: If one key fails, the system automatically tries the next available key
- **Rotation Strategies**:
  - `round-robin`: Cycles through keys in order
  - `least-used`: Uses the key with the least usage count
  - `random`: Randomly selects from available keys
- **Error Handling**: Keys that fail are temporarily disabled and retried after a cooldown period
- **Monitoring**: Track key usage, error counts, and performance metrics for both Google AI and OpenAI keys

**Benefits:**
- **High Availability**: Service continues even if individual keys fail
- **Load Distribution**: Spreads requests across multiple keys
- **Automatic Recovery**: Failed keys are automatically retried after cooldown
- **Better Performance**: Reduces rate limiting and improves response times
- **Dual Provider Support**: Both Google AI (for interview questions) and OpenAI (for TTS) benefit from key rotation

### **API Key Management Utility**

Use the built-in utility to manage your API keys:

```bash
# View status of all API keys
npm run api-keys status

# Test all configured API keys
npm run api-keys test

# Reset error counts and cooldowns
npm run api-keys reset

# Show which key would be used next
npm run api-keys next
```

**Example Output:**
```
🔑 API Key Status Report
============================================================

📊 Google AI API Keys
------------------------------

Key 1: AIzaSyC7...
  Status: ✅ Active
  Usage Count: 45
  Error Count: 0
  Last Used: 2024-01-15T10:30:00.000Z

Key 2: AIzaSyD8...
  Status: ✅ Active
  Usage Count: 23
  Error Count: 0
  Last Used: 2024-01-15T10:25:00.000Z

📊 Google AI Summary: 2/2 keys available

🤖 OpenAI API Keys
------------------------------

Key 1: sk-proj-...
  Status: ✅ Active
  Usage Count: 12
  Error Count: 0
  Last Used: 2024-01-15T10:28:00.000Z

Key 2: sk-proj-...
  Status: ✅ Active
  Usage Count: 8
  Error Count: 0
  Last Used: 2024-01-15T10:20:00.000Z

📊 OpenAI Summary: 2/2 keys available
```

---

## 🐳 **Docker Configuration**

### **Production Build**

```bash
# Build and run production container
docker-compose up -d

# View logs
docker-compose logs -f ai-interviewer

# Stop services
docker-compose down
```

### **Development Build**

```bash
# Run development container with hot reloading
docker-compose --profile dev up -d

# Access development version
open http://localhost:3001
```

### **Custom Docker Commands**

```bash
# Build image manually
docker build -t ai-interviewer .

# Run container manually
docker run -p 3000:3000 --env-file .env ai-interviewer

# Build with specific tag
docker build -t ai-interviewer:v2.0 .
```

---

## 📱 **Usage Guide**

### **1. Resume Upload & Analysis**
1. Navigate to the **Prepare** section
2. Upload your resume (PDF/DOCX supported)
3. Wait for AI analysis (usually 10-30 seconds)
4. Review detailed feedback and ATS score
5. Proceed to interview preparation

### **2. Starting an Interview**
1. Click **"Start Your Mock Interview"**
2. Grant camera and microphone permissions
3. Choose interview mode (Voice or Text)
4. Begin answering AI-generated questions

### **3. During the Interview**
- **Voice Mode**: Speak clearly into your microphone
- **Text Mode**: Type your responses and press Enter
- **Navigation**: Use the "End Interview" button to close properly
- **Feedback**: Receive real-time scoring and suggestions

### **4. Interview Completion**
- Review your performance summary
- Download detailed PDF report
- Start a new interview session

---

## 🏗️ **Project Structure**

```
AI-INTERVIEW/
├── src/
│   ├── ai/                    # AI flows and prompts
│   │   ├── flows/            # Interview agent, resume analyzer
│   │   └── genkit.ts         # AI configuration
│   ├── app/                  # Next.js app router
│   │   ├── interview/        # Interview session page
│   │   ├── prepare/          # Resume upload & analysis
│   │   └── summary/          # Interview results
│   ├── components/           # React components
│   │   ├── ui/              # Shadcn UI components
│   │   ├── interview-session.tsx
│   │   ├── resume-feedback.tsx
│   │   └── voice-feedback.tsx
│   ├── lib/                  # Utilities and helpers
│   │   ├── file-converter.ts # Document processing
│   │   ├── file-validator.ts # File validation
│   │   └── data-store.ts     # Local storage management
│   └── hooks/                # Custom React hooks
├── public/                   # Static assets
├── Dockerfile               # Production Docker image
├── Dockerfile.dev           # Development Docker image
├── docker-compose.yml       # Docker services orchestration
└── package.json             # Dependencies and scripts
```

---

## 🔍 **API Endpoints**

### **Text-to-Speech (TTS)**
- **POST** `/api/tts` - Convert text to speech using Google TTS

### **AI Flows**
- **Resume Analysis** - AI-powered resume evaluation
- **Question Generation** - Personalized interview questions
- **Interview Agent** - Real-time interview management

---

## 🧪 **Testing**

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run linting
npm run lint

# Run type checking
npm run type-check
```

---

## 🚀 **Deployment**

### **Vercel (Recommended)**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### **Docker Production**
```bash
# Build production image
docker build -t ai-interviewer:prod .

# Run with environment variables
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name ai-interviewer-prod \
  ai-interviewer:prod
```

### **Traditional Hosting**
```bash
# Build for production
npm run build

# Start production server
npm start
```

---

## 🤝 **Contributing**

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### **Development Guidelines**
- Follow TypeScript best practices
- Use conventional commit messages
- Ensure all tests pass
- Update documentation as needed

---

## 📄 **License**

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 **Acknowledgments**

- **Google Gemini AI** - For powerful AI capabilities
- **Next.js Team** - For the amazing React framework
- **Shadcn UI** - For beautiful, accessible components
- **Tailwind CSS** - For utility-first styling
- **Open Source Community** - For inspiration and support

---

## 📞 **Support & Contact**

- **GitHub Issues**: [Report bugs or request features](https://github.com/Avinashhmavi/AI-INTERVIEW/issues)
- **Discussions**: [Join the community](https://github.com/Avinashhmavi/AI-INTERVIEW/discussions)

---

## 🎉 **Show Your Support**

If this project helps you, please consider:

- ⭐ **Starring** the repository
- 🍴 **Forking** for your own projects
- 💬 **Sharing** with your network
- 🐛 **Reporting** issues you encounter

---

**Made with ❤️ by the Avinash**

*Empowering candidates to ace their interviews with AI-powered preparation tools*


