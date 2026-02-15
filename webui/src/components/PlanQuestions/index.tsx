import { useState } from 'react';
import { ChevronUp, ChevronDown, MessageSquareMore, X } from 'lucide-react';

export interface PlanQuestion {
  id: string;
  question: string;
  options: { id: string; label: string }[];
  allowMultiple: boolean;
  hasOther: boolean;
}

interface PlanQuestionsProps {
  questions: PlanQuestion[];
  onSubmit: (answers: Record<string, string | string[]>) => void;
  onSkip: () => void;
}

export function PlanQuestionsOverlay({ questions, onSubmit, onSkip }: PlanQuestionsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [showOtherInput, setShowOtherInput] = useState<Record<string, boolean>>({});

  if (questions.length === 0) return null;

  const current = questions[currentIndex];
  const totalQuestions = questions.length;

  const letterFromIndex = (i: number) => String.fromCharCode(65 + i); // A, B, C...

  const handleSingleSelect = (qId: string, optionId: string) => {
    if (optionId === '__other__') {
      setShowOtherInput(prev => ({ ...prev, [qId]: true }));
      setAnswers(prev => ({ ...prev, [qId]: '__other__' }));
    } else {
      setShowOtherInput(prev => ({ ...prev, [qId]: false }));
      setAnswers(prev => ({ ...prev, [qId]: optionId }));
    }
  };

  const handleMultiSelect = (qId: string, optionId: string) => {
    setAnswers(prev => {
      const current = (prev[qId] as string[]) || [];
      if (optionId === '__other__') {
        setShowOtherInput(p => ({ ...p, [qId]: !p[qId] }));
        if (current.includes('__other__')) {
          return { ...prev, [qId]: current.filter(id => id !== '__other__') };
        }
        return { ...prev, [qId]: [...current, '__other__'] };
      }
      if (current.includes(optionId)) {
        return { ...prev, [qId]: current.filter(id => id !== optionId) };
      }
      return { ...prev, [qId]: [...current, optionId] };
    });
  };

  const handleOtherText = (qId: string, text: string) => {
    setOtherTexts(prev => ({ ...prev, [qId]: text }));
  };

  const isSelected = (qId: string, optionId: string): boolean => {
    const val = answers[qId];
    if (Array.isArray(val)) return val.includes(optionId);
    return val === optionId;
  };

  const handleContinue = () => {
    // Build final answers, replacing __other__ with typed text
    const finalAnswers: Record<string, string | string[]> = {};
    for (const q of questions) {
      const val = answers[q.id];
      if (Array.isArray(val)) {
        finalAnswers[q.id] = val.map(v => v === '__other__' ? (otherTexts[q.id] || 'Other') : v);
      } else if (val === '__other__') {
        finalAnswers[q.id] = otherTexts[q.id] || 'Other';
      } else {
        finalAnswers[q.id] = val || '';
      }
    }
    onSubmit(finalAnswers);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center pb-4 px-3 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-[480px] bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
          <div className="flex items-center gap-2">
            <MessageSquareMore size={16} className="text-zinc-400" />
            <span className="text-sm font-semibold text-zinc-200">Questions</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Navigation */}
            <button
              onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronUp size={16} />
            </button>
            <span className="text-xs text-zinc-500 font-medium min-w-[40px] text-center">
              {currentIndex + 1} of {totalQuestions}
            </span>
            <button
              onClick={() => setCurrentIndex(i => Math.min(totalQuestions - 1, i + 1))}
              disabled={currentIndex === totalQuestions - 1}
              className="p-0.5 rounded text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronDown size={16} />
            </button>
            <button
              onClick={onSkip}
              className="p-0.5 rounded text-zinc-600 hover:text-zinc-400 transition-colors ml-1"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Question content */}
        <div className="px-4 py-4 max-h-[350px] overflow-y-auto">
          <div className="mb-4">
            <span className="text-[13px] text-zinc-300 leading-relaxed">
              <span className="text-zinc-500 font-medium mr-1.5">{currentIndex + 1}.</span>
              {current.question}
            </span>
          </div>

          {/* Options */}
          <div className="space-y-1.5">
            {current.options.map((option, i) => {
              const selected = isSelected(current.id, option.id);
              return (
                <button
                  key={option.id}
                  onClick={() => current.allowMultiple
                    ? handleMultiSelect(current.id, option.id)
                    : handleSingleSelect(current.id, option.id)
                  }
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all text-[13px] ${
                    selected
                      ? 'bg-zinc-800 border border-zinc-600 text-zinc-100'
                      : 'bg-zinc-800/30 border border-zinc-800/60 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
                    selected
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                      : 'bg-zinc-800 text-zinc-500 border border-zinc-700/60'
                  }`}>
                    {letterFromIndex(i)}
                  </span>
                  <span className="flex-1">{option.label}</span>
                  {current.allowMultiple && (
                    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      selected ? 'border-orange-500 bg-orange-500/20' : 'border-zinc-700'
                    }`}>
                      {selected && <span className="text-orange-400 text-[10px]">✓</span>}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Other option */}
            {current.hasOther && (
              <>
                <button
                  onClick={() => current.allowMultiple
                    ? handleMultiSelect(current.id, '__other__')
                    : handleSingleSelect(current.id, '__other__')
                  }
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all text-[13px] ${
                    isSelected(current.id, '__other__')
                      ? 'bg-zinc-800 border border-zinc-600 text-zinc-100'
                      : 'bg-zinc-800/30 border border-zinc-800/60 text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-400'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
                    isSelected(current.id, '__other__')
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                      : 'bg-zinc-800 text-zinc-600 border border-zinc-700/60'
                  }`}>
                    {letterFromIndex(current.options.length)}
                  </span>
                  <span className="flex-1 italic">Other...</span>
                </button>

                {showOtherInput[current.id] && (
                  <div className="ml-8 mt-1">
                    <input
                      type="text"
                      value={otherTexts[current.id] || ''}
                      onChange={(e) => handleOtherText(current.id, e.target.value)}
                      placeholder="Please type your answer..."
                      className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-md px-3 py-2 text-[12px] text-zinc-300 outline-none focus:border-zinc-600 placeholder-zinc-600 font-mono"
                      autoFocus
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800/60 bg-zinc-900/50">
          <button
            onClick={onSkip}
            className="text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors font-medium"
          >
            Skip
          </button>
          <button
            onClick={handleContinue}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-[12px] font-semibold transition-colors"
          >
            Continue
            <span className="text-orange-200/60 text-[10px]">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
