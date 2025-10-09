import React from 'react';
import BrainIcon from './icons/BrainIcon';
import TargetIcon from './icons/TargetIcon';
import GrowthIcon from './icons/GrowthIcon';
import { CommunicationBehavior } from '../types';

interface BehavioralAnalysisPanelProps {
  behavior?: CommunicationBehavior;
}

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; content: string }> = ({ icon, label, content }) => (
    <div className="grid grid-cols-3 gap-4 border-t border-gray-800 py-6">
        <div className="col-span-1">
            <div className="flex items-center">
                <div className="flex-shrink-0 w-5 h-5">{icon}</div>
                <h4 className="ml-2 text-sm text-gray-400 font-medium">{label}</h4>
            </div>
        </div>
        <p className="col-span-2 text-gray-300">{content}</p>
    </div>
);

const BehavioralAnalysisPanel: React.FC<BehavioralAnalysisPanelProps> = ({ behavior }) => {
  if (!behavior) {
    return null;
  }

  return (
    <div className="border-t border-gray-800 pt-8">
      <div className="mb-6">
        <h3 className="text-3xl font-bold text-white tracking-tighter">Communication Profile</h3>
        <p className="text-gray-500 mt-1">An analysis of your communication style.</p>
      </div>
      <div className="pb-6">
        <div className="text-center ui-card p-4 rounded-xl">
          <p className="text-sm text-gray-400 font-medium">Your identified profile is:</p>
          <p className="text-xl font-bold text-white">{behavior.profile}</p>
        </div>
      </div>
      <div className="space-y-0">
        <InfoRow 
          icon={<TargetIcon className="text-gray-500" />}
          label="Strength"
          content={behavior.strength}
        />
        <InfoRow 
          icon={<GrowthIcon className="text-gray-500" />}
          label="Growth Area"
          content={behavior.growthArea}
        />
      </div>
    </div>
  );
};

export default BehavioralAnalysisPanel;