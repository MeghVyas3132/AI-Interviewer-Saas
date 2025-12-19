import * as React from "react";
import { cn } from "@/lib/utils";

interface ScoreCircleProps {
  score: number; // score out of 10
  size?: number;
  strokeWidth?: number;
  className?: string;
  showText?: boolean;
}

const ScoreCircle = ({ score, size = 60, strokeWidth = 6, className, showText = true }: ScoreCircleProps) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Make sure score is within 0-10 range
  const clampedScore = Math.max(0, Math.min(score, 10));
  const offset = circumference - (clampedScore / 10) * circumference;

  let colorClass = "text-green-500";
  if (clampedScore < 8) colorClass = "text-yellow-400";
  if (clampedScore < 5) colorClass = "text-orange-400";
  if (clampedScore < 3) colorClass = "text-red-500";

  const percentage = Math.round(clampedScore * 10);

  return (
    <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg className="w-full h-full" viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="text-gray-200 dark:text-gray-700"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={cn("transform -rotate-90 origin-center transition-all duration-1000 ease-out", colorClass)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          strokeLinecap="round"
        />
      </svg>
      {showText && (
         <span className={cn("absolute font-bold", size >= 100 ? "text-2xl" : "text-sm", colorClass)}>
            {percentage}%
        </span>
      )}
    </div>
  );
};

export { ScoreCircle };
