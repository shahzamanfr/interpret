import React from 'react';
import StarIcon from './icons/StarIcon';

const Header: React.FC = () => {
  return (
    <header className="w-full px-4 lg:px-8 mx-auto max-w-7xl">
      <div className="flex items-center justify-between py-5 border-b border-gray-800 sticky top-0 z-30 backdrop-blur-md bg-black/70">
        <div className="flex items-center space-x-3">
          <StarIcon className="w-6 h-6 text-white" />
          <h1 className="text-[1.05rem] font-semibold text-white tracking-tight">
            Communication Coach
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="#image-describe"
            className="rounded-full border border-gray-600 bg-black text-white px-4 py-2 text-xs sm:text-sm font-semibold hover:opacity-90 transition-colors duration-200"
          >
            Try Image Describe
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;