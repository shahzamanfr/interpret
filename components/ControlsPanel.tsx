import React from 'react';
import { CoachMode } from '../types';

interface ControlsPanelProps {
  selectedMode: CoachMode;
  onModeChange: (mode: CoachMode) => void;
  isDisabled: boolean;
}

const modes = [
  { id: CoachMode.Teacher, label: 'Teacher' },
  { id: CoachMode.Debater, label: 'Debater' },
  { id: CoachMode.Storyteller, label: 'Storyteller' },
];

const ControlsPanel: React.FC<ControlsPanelProps> = ({ selectedMode, onModeChange, isDisabled }) => {
  return (
    <div className="border-t border-gray-800 pt-8">
      <h2 className="text-3xl font-bold text-white tracking-tighter mb-6">Coach Persona</h2>
      <div className="ui-card rounded-2xl p-2 border border-gray-800/70">
        {modes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            disabled={isDisabled}
            className={`inline-block mr-2 last:mr-0 text-center px-4 py-2.5 rounded-full text-sm font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed
              ${selectedMode === mode.id
                ? 'bg-gray-800 text-white'
                : 'text-gray-300 hover:bg-gray-900/60'
              }`}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ControlsPanel;