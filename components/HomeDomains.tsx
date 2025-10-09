import React from 'react';
import { ImageDomain } from '../types';

interface HomeDomainsProps {
  domains: ImageDomain[];
  selectedDomainSlug?: string;
  onSelectDomain: (slug: string) => void;
}

const HomeDomains: React.FC<HomeDomainsProps> = ({ domains, selectedDomainSlug, onSelectDomain }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {domains.map((domain) => {
        const isSelected = domain.slug === selectedDomainSlug;
        return (
          <button
            key={domain.slug}
            type="button"
            onClick={() => onSelectDomain(domain.slug)}
            className={`group relative flex h-full min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl ui-card p-5 text-left shadow-[0_10px_40px_-20px_rgba(0,0,0,0.7)] transition-transform duration-300 hover:-translate-y-0.5 focus:outline-none ${isSelected ? 'ring-2 ring-white/30' : ''}`}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl" aria-hidden>{domain.emoji}</span>
              <div className="flex-1">
                <h3 className="text-white font-semibold tracking-tight">{domain.title}</h3>
                <p className="mt-1 text-xs text-gray-400/90 leading-relaxed line-clamp-2">{domain.description}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {domain.images.slice(0, 3).map((img) => (
                <div key={img.id} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-900/60 border border-gray-800/70">
                  <img src={img.src} alt={img.alt} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" aria-hidden />
                </div>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default HomeDomains;


