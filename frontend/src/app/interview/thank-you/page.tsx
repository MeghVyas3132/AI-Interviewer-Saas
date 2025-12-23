'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { CheckCircle, Mail, Calendar, ArrowRight } from 'lucide-react';

export default function ThankYouPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Thank You for Your Interview!
        </h1>
        
        <p className="text-gray-600 mb-8">
          Your interview has been successfully completed and recorded. 
          Our team will review your responses and get back to you soon.
        </p>

        <div className="bg-gray-50 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">What Happens Next?</h2>
          
          <div className="space-y-4 text-left">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-primary-600 font-semibold">1</span>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Review Process</h3>
                <p className="text-sm text-gray-500">Our hiring team will review your interview responses within 3-5 business days.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-primary-600 font-semibold">2</span>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Email Notification</h3>
                <p className="text-sm text-gray-500">You'll receive an email with the results and any next steps.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-primary-600 font-semibold">3</span>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Follow-up Interview</h3>
                <p className="text-sm text-gray-500">If selected, you may be invited for a follow-up interview with our team.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button variant="outline" onClick={() => router.push('/')}>
            Return Home
          </Button>
          <Button onClick={() => window.close()}>
            Close Window
          </Button>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          If you have any questions, please contact our HR team.
        </p>
      </Card>
    </div>
  );
}
