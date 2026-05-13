import { useState, useEffect, useRef, memo } from 'react';
import { cn } from '../lib/utils';

const SPINNER_VERBS = [
  'Thinking', 'Analyzing', 'Processing', 'Writing code', 'Reading files',
  'Running commands', 'Searching', 'Debugging', 'Building', 'Testing',
  'Reviewing', 'Planning', 'Implementing', 'Refactoring', 'Optimizing',
  'Generating', 'Compiling', 'Deploying', 'Cooking', 'Locked in',
];

interface SpinnerVerbDisplayProps {
  isRunning: boolean;
  className?: string;
}

const SpinnerVerbDisplay = memo(function SpinnerVerbDisplay({ isRunning, className }: SpinnerVerbDisplayProps) {
  const [spinnerVerb, setSpinnerVerb] = useState('');
  const spinnerIndexRef = useRef(0);

  useEffect(() => {
    if (!isRunning) return;
    spinnerIndexRef.current = Math.floor(Math.random() * SPINNER_VERBS.length);
    setSpinnerVerb(SPINNER_VERBS[spinnerIndexRef.current]);
    const id = setInterval(() => {
      spinnerIndexRef.current = (spinnerIndexRef.current + 1) % SPINNER_VERBS.length;
      setSpinnerVerb(SPINNER_VERBS[spinnerIndexRef.current]);
    }, 2400);
    return () => clearInterval(id);
  }, [isRunning]);

  if (!isRunning) return null;

  return <span className={cn(className)}>{spinnerVerb}</span>;
});

export default SpinnerVerbDisplay;
